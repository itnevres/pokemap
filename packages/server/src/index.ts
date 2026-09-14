import { readFileSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type Server } from "node:http";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { renderSpeciesIcon } from "@pokemap/core/src/render/species.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { parseEncounters, speciesChances, FISHING_RODS, type Encounters, type Method, type Rod, type SpeciesChance } from "@pokemap/core/src/load/encounters.js";
import { coverage, whereSpecies, allSpecies } from "@pokemap/core/src/analyse/coverage.js";
import { buildWorld, resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import type { Placement } from "@pokemap/core/src/world/connections.js";
import { readSidecar, writeSidecar } from "@pokemap/core/src/world/sidecar.js";
import { readDungeons, writeDungeons } from "@pokemap/core/src/world/dungeons.js";
import { warpConnectedMapsFrom } from "@pokemap/core/src/world/warpGraph.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { parseBorder } from "@pokemap/cli/src/args.js";
import { randomUUID } from "node:crypto";
import { createEditSessionStore, snapshotOf, snapshotCommand } from "./editSessions.js";
import { paintCells, floodFill, shiftGrid, type Stamp } from "@pokemap/core/src/edit/paint.js";

export interface PokemapServer { port: number; project: Project; close(): Promise<void>; }

/**
 * Buffers a request body to a string. `/api/world/placement` is the first
 * POST route this server has ever needed -- every route before it only ever
 * reads.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function createServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer> {
  const project = openProject(opts.projectPath);

  // Unbounded on purpose for now, and worth knowing why: the whole corpus is
  // 1,209 maps and the largest PNG is a few hundred KB, but Route47 at
  // 1920x976 is not, and a client that walks every map pins all of it. Task 23
  // designs the real cache with an eviction policy; until then this is a
  // single-user dev server and the ceiling is understood rather than enforced.
  const pngCache = new Map<string, Buffer>();

  // buildWorld walks all 1,209 maps' connections (~4s against the real
  // corpus, per packages/core/test/world/connections.test.ts) and the
  // project is read-only for all of Plan 1, so its answer can never change
  // for the lifetime of one server process. Computed at most once, on the
  // first request that needs it -- not eagerly at startup, so routes that
  // never touch /api/world (most of api.test.ts) don't pay for it.
  let worldCache: ReturnType<typeof buildWorld> | undefined;
  const getWorld = () => (worldCache ??= buildWorld(project));

  // Species icon PNGs, keyed by species+source+frame -- same reasoning and
  // the same "unbounded for now" ceiling as pngCache above, but with far less
  // to hold: at most a few thousand 32x32 frames across the whole species
  // list, not one entry per map.
  const iconCache = new Map<string, Buffer>();

  // wild_encounters.json is parsed once and reused for the lifetime of this
  // (read-only, per-process) server -- same reasoning as worldCache above.
  let encountersCache: Encounters | undefined;
  const getEncounters = () => (encountersCache ??= parseEncounters(readFileSync(project.paths.wildEncountersJson, "utf8")));

  // coverage(project) walks all 497 tables across every map (Task 29) --
  // same "read-only project, compute once" reasoning as worldCache and
  // encountersCache just above: the project can never change out from
  // under a live server process (I8), so the answer can't either. Computed
  // on the first request that actually needs it (/api/coverage), not
  // eagerly at startup. whereSpecies is NOT cached here -- it takes a
  // species argument and returns a different answer per call, so there is
  // nothing shaped like "the one answer" to memoize the way there is for
  // coverage()'s single, argument-free result.
  let coverageCache: ReturnType<typeof coverage> | undefined;
  const getCoverage = () => (coverageCache ??= coverage(project));

  // allSpecies(project) reads one directory listing -- cheap even
  // uncached, but the result can't change for the lifetime of a
  // read-only-decomp server process (I8), same reasoning as every other
  // cache in this file. Computed on the first request that needs it.
  let speciesCache: string[] | undefined;
  const getSpecies = () => (speciesCache ??= allSpecies(project));

  const editSessions = createEditSessionStore(project);

  const editEntryFor = (name: string) => editSessions.open(name);

  const sendSession = (send: (code: number, body: unknown) => void, code: number, entry: ReturnType<typeof editEntryFor>) =>
    send(code, { blocks: entry.session.blocks, border: entry.session.border, isDirty: entry.session.isDirty });

  const http: Server = createHttp((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    try {
      if (url.pathname === "/api/groups") {
        return send(200, { groupOrder: project.groups.groupOrder, groups: project.groups.groups });
      }

      const mapMatch = /^\/api\/map\/(.+)$/.exec(url.pathname);
      if (mapMatch) {
        const name = decodeURIComponent(mapMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const map = project.map(name);
        const layout = project.layoutById(map.layout);
        if (!layout) return send(404, { error: `no layout ${map.layout}` });
        const split = project.splitFor(layout);

        // Raw blocks, plus each one's resolved tile behaviour -- the canvas
        // draws collision/elevation overlays and a hover status strip
        // entirely off this payload, with no per-hover round trip. Ownership
        // (primary vs secondary tileset) follows the same id/split rule as
        // renderMetatile: below split.metatiles is primary at that index,
        // at or above it is secondary at (id - split.metatiles).
        const primary = project.tileset(layout.primaryTileset);
        const secondary = project.tileset(layout.secondaryTileset);
        const behaviorCache = new Map<number, number>();
        const behaviorFor = (metatileId: number): number => {
          let b = behaviorCache.get(metatileId);
          if (b === undefined) {
            const inSecondary = metatileId >= split.metatiles;
            const owner = inSecondary ? secondary : primary;
            const local = inSecondary ? metatileId - split.metatiles : metatileId;
            b = local >= 0 && local < owner.metatileCount ? owner.behavior(local) : 0;
            behaviorCache.set(metatileId, b);
          }
          return b;
        };

        const rawBlocks = parseBlocks(readFileSync(`${project.paths.root}/${layout.blockdataFilepath}`), project.profile);
        const blocks = rawBlocks.slice(0, layout.width * layout.height).map((b) => ({
          metatileId: b.metatileId,
          collision: b.collision,
          elevation: b.elevation,
          behavior: behaviorFor(b.metatileId),
        }));

        return send(200, { map, layout, split, blocks });
      }

      const renderMatch = /^\/api\/render\/(.+)\.png$/.exec(url.pathname);
      if (renderMatch) {
        const name = decodeURIComponent(renderMatch[1]!);

        // Same parser the CLI uses, so `?border=abc` and `?border=1.5` are
        // refused here exactly as `--border abc` is there. It throws
        // commander's InvalidArgumentError, which is a plain Error subclass --
        // catching it to answer 400 rather than letting the outer catch call
        // it a 500.
        let border: number;
        try { border = parseBorder(url.searchParams.get("border") ?? "0"); }
        catch (e) { return send(400, { error: (e as Error).message }); }

        const key = `${name}:${border}`;
        let png = pngCache.get(key);
        if (!png) {
          // Resolve without throwing. `project.map(name)` refuses an unknown
          // name, and that refusal must become a 404 here, not a 500 from the
          // outer catch.
          const layoutName = project.layoutByName(name)
            ? name
            : project.mapNames().includes(name)
              ? project.layoutById(project.map(name).layout)?.name
              : undefined;
          if (!layoutName) return send(404, { error: `no layout or map ${name}` });
          png = encodePng(renderLayout(project, layoutName, { border }));
          pngCache.set(key, png);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }

      // `:name` is a raw species constant (e.g. "SPECIES_ESPEON"), exactly the
      // string speciesChances already puts in every SpeciesChance -- so the
      // encounter gutter builds this URL straight from that field, with no
      // client-side transform of its own to get wrong. `[^/]+`, not `.+`
      // (unlike /api/render/(.+)\.png above): a species constant never
      // contains a slash, and the tighter match keeps a stray extra segment
      // from being silently swallowed into the capture.
      const speciesIconMatch = /^\/api\/species\/([^/]+)\/icon\.png$/.exec(url.pathname);
      if (speciesIconMatch) {
        const species = decodeURIComponent(speciesIconMatch[1]!);

        const sourceParam = url.searchParams.get("source");
        if (sourceParam !== null && sourceParam !== "icon" && sourceParam !== "overworld") {
          return send(400, { error: `?source= must be "icon" or "overworld", got ${JSON.stringify(sourceParam)}` });
        }
        const source = (sourceParam ?? "icon") as "icon" | "overworld";

        // Same shape as ?border= above: refuse a non-integer or negative
        // frame here rather than letting it become a nonsensical (or
        // negative-index-wrapping) row offset inside renderSpeciesIcon.
        const frameParam = url.searchParams.get("frame");
        let frame = 0;
        if (frameParam !== null) {
          frame = Number(frameParam);
          if (!Number.isInteger(frame) || frame < 0) {
            return send(400, { error: `?frame= must be a non-negative integer, got ${JSON.stringify(frameParam)}` });
          }
        }

        const key = `${species}:${source}:${frame}`;
        let png = iconCache.get(key);
        if (!png) {
          const raster = renderSpeciesIcon(project, species, { source, frame });
          // No art for this species/source (or the species itself doesn't
          // exist) -- a 404, not a thrown ENOENT the outer catch would turn
          // into a 500.
          if (!raster) return send(404, { error: `no ${source} art for ${species}` });
          png = encodePng(raster);
          iconCache.set(key, png);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }

      // The world view's per-map encounter gutter: true percentages per
      // method for one map's FIRST table (day, or the only variant most maps
      // have) -- same default `entry: 0` speciesChances itself uses, and the
      // same one `pokemap encounters` reports by default. A variant selector
      // for the rest of a multi-table map is a later task's job, not this
      // route's.
      const encountersMatch = /^\/api\/encounters\/(.+)$/.exec(url.pathname);
      if (encountersMatch) {
        const name = decodeURIComponent(encountersMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const mapId = project.map(name).id;
        const enc = getEncounters();

        // One row per (method) -- or, for fishing_mons, per (method, rod)
        // that actually has a table. A method/rod with no table contributes
        // no row at all, rather than one present as `null` or `[]`, so the
        // gutter can tell "no table for this" from "table exists but is
        // empty" without a second signal. A map with no encounters at all
        // (982 of 1,209 -- spec §9) still answers 200 with `methods: []`:
        // that is real data, not an error.
        //
        // fishing_mons gets THREE rows, one per rod, not one. Review fix:
        // this used to call speciesChances(enc, mapId, "fishing_mons") with
        // no `opts`, which defaults to `rod: "old"` (ChanceOptions' own
        // default) -- silently showing only the Old Rod's 2-slot segment
        // under a plain "Fishing" label, with nothing in the response
        // disclosing that Good Rod and Super Rod species were left out
        // entirely. Exactly the kind of hidden-behind-a-percentage gap
        // encounters.ts's own FISHING_RODS split exists to prevent (see its
        // "three distributions packed into one array" comment there).
        const methods: Array<{ method: Method; rod?: Rod; chances: SpeciesChance[] }> = [];
        for (const m of ["land_mons", "water_mons", "rock_smash_mons"] as const) {
          const chances = speciesChances(enc, mapId, m);
          if (chances) methods.push({ method: m, chances });
        }
        for (const { rod } of FISHING_RODS) {
          const chances = speciesChances(enc, mapId, "fishing_mons", { rod });
          if (chances) methods.push({ method: "fishing_mons", rod, chances });
        }

        return send(200, { mapName: name, mapId, methods });
      }

      // Feature B (dungeon-mode-and-warp-tools spec §4.2): a map's warp
      // events, already fully parsed by load/maps.ts but not exposed
      // anywhere until now. Reused by BOTH the warp-marker toggle (fetched
      // lazily per visible map, mirroring the encounter cache exactly --
      // a later task) and Feature C's dungeon connection lines (also a
      // later task) -- one route, two consumers. Not cached server-side:
      // this is already-parsed, uncomputed data, the same "no cache
      // needed" posture as /api/map and /api/encounters.
      const warpsMatch = /^\/api\/warps\/(.+)$/.exec(url.pathname);
      if (warpsMatch) {
        const name = decodeURIComponent(warpsMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        // Same idToName enrichment /api/coverage and /api/where already
        // build for the identical reason: the client only ever works with
        // map NAMES (world/connections.ts's own Placement.map), never the
        // raw MAP_ID constants warpEvents.destMap carries.
        const idToName = new Map(project.mapNames().map((n) => [project.map(n).id, n]));
        const warps = project.map(name).warpEvents.map((w) => ({ ...w, destMapName: idToName.get(w.destMap) }));
        return send(200, { mapName: name, warps });
      }

      // Task 29's coverage lenses: level-curve, empty-maps, unused-species
      // and method, all driven off one coverage() call (cached above).
      // levelByMap comes back keyed by mapId only (coverage.ts's own
      // documented shape), but the world view's placements are keyed by
      // map NAME (world/connections.ts's Placement.map) -- so this route
      // enriches each entry with its display name here, at the wire layer,
      // rather than changing coverage()'s own tested core shape for a
      // UI-only need. Same idToName-by-mapId lookup whereSpecies below
      // already builds, for the identical reason.
      if (url.pathname === "/api/coverage") {
        const c = getCoverage();
        const idToName = new Map(project.mapNames().map((n) => [project.map(n).id, n]));
        return send(200, { ...c, levelByMap: c.levelByMap.map((m) => ({ ...m, mapName: idToName.get(m.mapId) })) });
      }

      // The species spotlight's type-ahead dropdown: every SPECIES_X the
      // project has art for, sorted -- fetched once by the client and
      // filtered client-side as the user types (coverage.ts's own
      // allSpecies doc comment explains why sorting happens there instead
      // of here). This is an exact string match, not a regex like the
      // species-icon route below -- "/api/species" alone, with nothing
      // after it, so it can never accidentally swallow that route's own
      // "/api/species/:name/icon.png" path.
      if (url.pathname === "/api/species") {
        return send(200, getSpecies());
      }

      // `[^/]+`, not `.+` -- same reasoning as the species-icon route
      // above: a species constant never contains a slash, and the tighter
      // match keeps a stray extra path segment from being silently
      // swallowed into the capture. `:species` is tolerant of whatever the
      // spotlight search box sends -- "pikachu", "PIKACHU" or
      // "SPECIES_PIKACHU" -- normalised the same way the CLI's own
      // `pokemap where` is.
      const whereMatch = /^\/api\/where\/([^/]+)$/.exec(url.pathname);
      if (whereMatch) {
        const s = decodeURIComponent(whereMatch[1]!);
        return send(200, whereSpecies(project, s.startsWith("SPECIES_") ? s : `SPECIES_${s.toUpperCase()}`));
      }

      if (url.pathname === "/api/world") {
        const dungeons = url.searchParams.get("dungeons") !== "0";
        const world = getWorld();
        const sidecar = readSidecar(project.paths.root);
        const merged = resolveWorldPlacements(project, world, sidecar, { dungeons });

        // Feature A (dungeon-mode-and-warp-tools spec §3.2): the world
        // view's default-population filter needs each placement's own map
        // kind and whether the user ever manually placed it -- both are
        // UI-only display concerns layered onto the wire response, not onto
        // Placement itself (core/world/connections.ts), mirroring how
        // /api/coverage already enriches levelByMap with a display name
        // rather than growing coverage()'s own tested shape for a UI-only
        // need (see that route's own comment just above in this file). A
        // name absent from knownMaps (a stale manualPlacements entry for a
        // since-renamed or removed map) has no real mapType to report --
        // MAP_TYPE_NONE is the project's own "nothing special" value and,
        // combined with `manual` being true for any such entry, is never
        // actually consulted either way (any name missing from knownMaps
        // can only have arrived via applySidecar's placeholder branch, so
        // `manual` is necessarily true for it regardless of what mapType
        // ends up as).
        const knownMaps = new Set(project.mapNames());
        // Local, wire-only shape: Placement plus the two enrichment fields
        // above. Not part of core's own Placement (same "UI-only concern"
        // reasoning as the comment above) -- kept here rather than as
        // Record<string, unknown> so the object literal below is still
        // checked against a real shape.
        interface WirePlacement extends Placement { mapType: string; manual: boolean }
        const placements: Record<string, WirePlacement> = {};
        for (const [name, p] of merged) {
          placements[name] = {
            ...p,
            mapType: knownMaps.has(name) ? project.map(name).mapType : "MAP_TYPE_NONE",
            manual: name in sidecar.manualPlacements,
          };
        }

        return send(200, {
          placements,
          components: world.components,
          conflicts: world.conflicts,
          verticalLinks: world.verticalLinks,
          sidecar,
        });
      }

      if (url.pathname === "/api/world/placement" && req.method === "POST") {
        return readBody(req)
          .then((body) => {
            let parsed: { map?: unknown; x?: unknown; y?: unknown };
            try {
              parsed = JSON.parse(body) as typeof parsed;
            } catch (e) {
              return send(400, { error: `invalid JSON body: ${(e as Error).message}` });
            }
            if (typeof parsed.map !== "string" || typeof parsed.x !== "number" || typeof parsed.y !== "number") {
              return send(400, { error: `expected { map: string, x: number, y: number }, got ${body}` });
            }
            const sidecar = readSidecar(project.paths.root);
            sidecar.manualPlacements[parsed.map] = { x: parsed.x, y: parsed.y };
            writeSidecar(project.paths.root, sidecar);
            return send(200, { ok: true });
          })
          // This chain runs after the try/catch below has already returned,
          // so a throw in here (bad JSON, wrong shape, or readSidecar's own
          // I7 refusal on a corrupted world.json) would otherwise become an
          // unhandled rejection and leave the request hanging forever
          // instead of answering it.
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      // Review fix: the dungeon-layout switch (packages/ui's WorldCanvas)
      // only ever changed the query string used for its own next fetch --
      // nothing persisted sidecar.dungeonAutoLayout, so a reload silently
      // discarded it. Mirrors /api/world/placement's own shape exactly
      // (JSON-parse guard, shape guard, read-mutate-write, outer .catch()
      // for the same "runs after the try/catch below has returned" reason).
      if (url.pathname === "/api/world/dungeons" && req.method === "POST") {
        return readBody(req)
          .then((body) => {
            let parsed: { enabled?: unknown };
            try {
              parsed = JSON.parse(body) as typeof parsed;
            } catch (e) {
              return send(400, { error: `invalid JSON body: ${(e as Error).message}` });
            }
            if (typeof parsed.enabled !== "boolean") {
              return send(400, { error: `expected { enabled: boolean }, got ${body}` });
            }
            const sidecar = readSidecar(project.paths.root);
            sidecar.dungeonAutoLayout = parsed.enabled;
            writeSidecar(project.paths.root, sidecar);
            return send(200, { ok: true });
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      // Feature C (dungeon-mode-and-warp-tools spec §5.3): user-curated
      // named groups of maps, persisted to their own sidecar file --
      // .pokemap/dungeons.json, not world.json, for the same single-
      // responsibility split sidecar.ts's own file already established.
      if (url.pathname === "/api/dungeons" && req.method === "GET") {
        return send(200, readDungeons(project.paths.root).dungeons);
      }

      if (url.pathname === "/api/dungeons" && req.method === "POST") {
        return readBody(req)
          .then((body) => {
            let parsed: { name?: unknown; seedMap?: unknown; maps?: unknown };
            try {
              parsed = JSON.parse(body) as typeof parsed;
            } catch (e) {
              return send(400, { error: `invalid JSON body: ${(e as Error).message}` });
            }
            if (typeof parsed.name !== "string" || parsed.name.trim() === "") {
              return send(400, { error: `expected a non-empty "name" string, got ${body}` });
            }
            if (parsed.seedMap !== undefined && typeof parsed.seedMap !== "string") {
              return send(400, { error: `"seedMap" must be a string when present, got ${body}` });
            }
            if (parsed.maps !== undefined && (!Array.isArray(parsed.maps) || parsed.maps.some((m) => typeof m !== "string"))) {
              return send(400, { error: `"maps" must be a string array when present, got ${body}` });
            }

            let maps: string[];
            if (typeof parsed.seedMap === "string") {
              if (!project.mapNames().includes(parsed.seedMap)) {
                return send(400, { error: `seedMap ${parsed.seedMap} is not a known map` });
              }
              maps = [...warpConnectedMapsFrom(project, parsed.seedMap)].sort();
            } else {
              maps = (parsed.maps as string[] | undefined) ?? [];
            }

            const dungeons = readDungeons(project.paths.root);
            const dungeon = { id: randomUUID(), name: parsed.name, maps };
            dungeons.dungeons.push(dungeon);
            writeDungeons(project.paths.root, dungeons);
            return send(200, dungeon);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const dungeonIdMatch = /^\/api\/dungeons\/(.+)$/.exec(url.pathname);
      if (dungeonIdMatch && req.method === "PATCH") {
        const id = decodeURIComponent(dungeonIdMatch[1]!);
        return readBody(req)
          .then((body) => {
            let parsed: { name?: unknown; maps?: unknown };
            try {
              parsed = JSON.parse(body) as typeof parsed;
            } catch (e) {
              return send(400, { error: `invalid JSON body: ${(e as Error).message}` });
            }
            if (parsed.name !== undefined && (typeof parsed.name !== "string" || parsed.name.trim() === "")) {
              return send(400, { error: `"name" must be a non-empty string when present, got ${body}` });
            }
            if (parsed.maps !== undefined && (!Array.isArray(parsed.maps) || parsed.maps.some((m) => typeof m !== "string"))) {
              return send(400, { error: `"maps" must be a string array when present, got ${body}` });
            }
            const dungeons = readDungeons(project.paths.root);
            const dungeon = dungeons.dungeons.find((d) => d.id === id);
            if (!dungeon) return send(404, { error: `no dungeon ${id}` });
            if (typeof parsed.name === "string") dungeon.name = parsed.name;
            if (Array.isArray(parsed.maps)) dungeon.maps = parsed.maps as string[];
            writeDungeons(project.paths.root, dungeons);
            return send(200, dungeon);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      if (dungeonIdMatch && req.method === "DELETE") {
        const id = decodeURIComponent(dungeonIdMatch[1]!);
        const dungeons = readDungeons(project.paths.root);
        const before = dungeons.dungeons.length;
        dungeons.dungeons = dungeons.dungeons.filter((d) => d.id !== id);
        if (dungeons.dungeons.length === before) return send(404, { error: `no dungeon ${id}` });
        writeDungeons(project.paths.root, dungeons);
        return send(200, { ok: true });
      }

      // Task 8 (Plan 2): paint-stroke lifecycle. begin/apply/end are three
      // separate requests on purpose -- see editSessions.ts's own doc
      // comment on why a whole stroke is one undo step even though it is
      // many HTTP requests.
      const paintBeginMatch = /^\/api\/edit\/(.+)\/paint\/begin$/.exec(url.pathname);
      if (paintBeginMatch && req.method === "POST") {
        const name = decodeURIComponent(paintBeginMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        // A redundant begin() while a stroke is already in progress (no
        // intervening end()) must NOT overwrite the real start-of-gesture
        // snapshot with the CURRENT (already-mutated) blocks -- doing so
        // would silently drop everything painted before the re-begin from
        // the eventual undo step and desync isDirty, the mirror image of
        // the double-/paint/end bug guarded by editSessions.ts's own
        // strokeStartBlocks reset.
        if (entry.strokeStartBlocks === null) {
          entry.strokeStartBlocks = entry.session.blocks.map((b) => ({ ...b }));
        }
        return sendSession(send, 200, entry);
      }

      const paintApplyMatch = /^\/api\/edit\/(.+)\/paint\/apply$/.exec(url.pathname);
      if (paintApplyMatch && req.method === "POST") {
        const name = decodeURIComponent(paintApplyMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return readBody(req)
          .then((body) => {
            let parsed: {
              tool?: unknown;
              targets?: { x: number; y: number }[]; stamp?: Stamp; origin?: { x: number; y: number };
              x?: number; y?: number; replacement?: { metatileId: number; collision?: number; elevation?: number };
              dx?: number; dy?: number;
            };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }

            // This request reads-then-writes entry.session.blocks across an
            // await (readBody's own round trip already happened above) --
            // in principle a same-map /undo or another /paint/apply could
            // interleave here. Low-likelihood in practice: the intended
            // client always awaits each round trip before sending the next
            // (the whole begin/apply/end design assumes exactly that), so
            // this is a known, accepted gap, not a guarantee against it.
            const entry = editEntryFor(name);
            const w = entry.session.layout.width, h = entry.session.layout.height;

            if (parsed.tool === "pencil" || parsed.tool === "rect") {
              const { targets, stamp, origin } = parsed;
              if (!Array.isArray(targets) || targets.some((t) => typeof t?.x !== "number" || typeof t?.y !== "number")) {
                return send(400, { error: `"targets" must be an array of { x: number, y: number }, got ${JSON.stringify(targets)}` });
              }
              if (!stamp || typeof stamp.width !== "number" || typeof stamp.height !== "number" || !Array.isArray(stamp.cells)) {
                return send(400, { error: `"stamp" must be { width: number, height: number, cells: [] }, got ${JSON.stringify(stamp)}` });
              }
              if (typeof origin?.x !== "number" || typeof origin?.y !== "number") {
                return send(400, { error: `"origin" must be { x: number, y: number }, got ${JSON.stringify(origin)}` });
              }
              entry.session.blocks = paintCells(entry.session.blocks, w, h, targets, stamp, origin.x, origin.y);
            } else if (parsed.tool === "bucket") {
              const { x, y, replacement } = parsed;
              if (typeof x !== "number" || typeof y !== "number") {
                return send(400, { error: `"x" and "y" must be numbers, got x=${JSON.stringify(x)} y=${JSON.stringify(y)}` });
              }
              if (typeof replacement?.metatileId !== "number") {
                return send(400, { error: `"replacement" must be { metatileId: number, ... }, got ${JSON.stringify(replacement)}` });
              }
              entry.session.blocks = floodFill(entry.session.blocks, w, h, x, y, replacement);
            } else if (parsed.tool === "shift") {
              const { dx, dy } = parsed;
              if (typeof dx !== "number" || typeof dy !== "number") {
                return send(400, { error: `"dx" and "dy" must be numbers, got dx=${JSON.stringify(dx)} dy=${JSON.stringify(dy)}` });
              }
              entry.session.blocks = shiftGrid(entry.session.blocks, w, h, dx, dy);
            } else {
              return send(400, { error: `unknown tool ${JSON.stringify(parsed.tool)}` });
            }
            return sendSession(send, 200, entry);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      const paintEndMatch = /^\/api\/edit\/(.+)\/paint\/end$/.exec(url.pathname);
      if (paintEndMatch && req.method === "POST") {
        const name = decodeURIComponent(paintEndMatch[1]!);
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const entry = editEntryFor(name);
        if (entry.strokeStartBlocks) {
          const prev = { ...snapshotOf(entry.session), blocks: entry.strokeStartBlocks };
          const next = snapshotOf(entry.session);
          if (JSON.stringify(prev.blocks) !== JSON.stringify(next.blocks)) {
            entry.stack.push(entry.session, snapshotCommand("paint", prev, next));
          }
          entry.strokeStartBlocks = null;
        }
        return sendSession(send, 200, entry);
      }

      const undoMatch = /^\/api\/edit\/(.+)\/undo$/.exec(url.pathname);
      if (undoMatch && req.method === "POST") {
        const name = decodeURIComponent(undoMatch[1]!);
        if (!editSessions.has(name)) return send(200, { blocks: [], border: [], isDirty: false }); // nothing open -- a no-op, not a 500
        const entry = editEntryFor(name);
        entry.stack.undo(entry.session);
        return sendSession(send, 200, entry);
      }

      const redoMatch = /^\/api\/edit\/(.+)\/redo$/.exec(url.pathname);
      if (redoMatch && req.method === "POST") {
        const name = decodeURIComponent(redoMatch[1]!);
        if (!editSessions.has(name)) return send(200, { blocks: [], border: [], isDirty: false });
        const entry = editEntryFor(name);
        entry.stack.redo(entry.session);
        return sendSession(send, 200, entry);
      }

      return send(404, { error: "not found" });
    } catch (e) {
      console.error(e);
      return send(500, { error: (e as Error).message });
    }
  });

  await new Promise<void>((r) => http.listen(opts.port ?? 5174, "127.0.0.1", r));
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);

  return { port, project, close: () => new Promise<void>((r) => http.close(() => r())) };
}
