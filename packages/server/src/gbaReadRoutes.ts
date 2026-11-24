import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { decodeSegment } from "./http.js";
import { refuseBrokenLayout } from "./brokenComponents.js";
import { checkGbaMapDefects } from "@pokemap/core/src/defects/gba.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { speciesChances, FISHING_RODS, type Method, type Rod, type SpeciesChance } from "@pokemap/core/src/load/encounters.js";
import { whereSpecies } from "@pokemap/core/src/analyse/coverage.js";
import { resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import type { Placement } from "@pokemap/core/src/world/connections.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";
import { wireConflicts } from "@pokemap/core/src/world/conflictAcceptance.js";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { renderMetatile } from "@pokemap/core/src/render/metatile.js";
import { renderSpeciesIcon } from "@pokemap/core/src/render/species.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { parseBorder } from "@pokemap/cli/src/args.js";
import type { GbaRouteContext } from "./gbaRouteContext.js";

type Send = (code: number, body: unknown) => unknown;

/**
 * Plan H I1: the read-only GBA routes, moved verbatim out of `createProjectHandler`'s
 * `handle` if-chain in index.ts. Answers a request and returns true, or returns false
 * for a path it does not own so the caller keeps walking its own chain.
 */
export function gbaReadRoutes(ctx: GbaRouteContext): (req: IncomingMessage, res: ServerResponse, url: URL, send: Send) => boolean {
  const { project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor, cachedRender, pngCache, iconCache, getWorld, getEncounters, getCoverage, getSpecies } = ctx;
  return (req, res, url, send) => {
    // The moved text answers with `return send(...)` / `return res.end(...)` / bare `return`, and falls
    // off the end for a path it does not own. `fellThrough` turns that into the boolean the loop needs
    // without touching a single moved line.
    let fellThrough = false;
    (() => {
      if (req.method === "GET") {
        // Options and indicator suggestions also read tileset behavior/collision.
        syncOverlay();
        if (addEvents.handleOptions(url, send)) return;
      }
      if (url.pathname === "/api/project") {
        return send(200, { family: "gba", root: project.paths.root } satisfies ProjectInfo);
      }

      if (url.pathname === "/api/groups") {
        return send(200, { groupOrder: project.groups.groupOrder, groups: project.groups.groups });
      }

      const defectsMatch = /^\/api\/defects\/(.+)$/.exec(url.pathname);
      if (defectsMatch && req.method === "GET") {
        const name = decodeSegment(defectsMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        return send(200, symbols.check((index) => checkGbaMapDefects(project, name, { symbols: index })));
      }

      const mapMatch = /^\/api\/map\/(.+)$/.exec(url.pathname);
      if (mapMatch) {
        const stamp = overlayStamp();
        const name = decodeSegment(mapMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
        if (!project.mapNames().includes(name)) return send(404, { error: `no map ${name}` });
        const map = project.map(name);
        const layout = project.layoutById(map.layout);
        if (!layout) return send(404, { error: `no layout ${map.layout}` });
        refuseBrokenLayout(project, layout); // D25: the defects route reports it; this route refuses
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

        // primary/secondary.metatileCount -- already resolved above for
        // behaviorFor's own owner.metatileCount check -- are exactly what
        // MetatilePalette's primaryCount/secondaryCount props need to size
        // its grid; returning them here means the UI doesn't have to guess
        // or fetch tileset data separately.
        return send(200, { ...stamp, map, layout, split, blocks, primaryCount: primary.metatileCount, secondaryCount: secondary.metatileCount });
      }

      const renderMatch = /^\/api\/render\/(.+)\.png$/.exec(url.pathname);
      if (renderMatch) {
        syncOverlay();
        const name = decodeSegment(renderMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });

        // Same parser the CLI uses, so `?border=abc` and `?border=1.5` are
        // refused here exactly as `--border abc` is there. It throws
        // commander's InvalidArgumentError, which is a plain Error subclass --
        // catching it to answer 400 rather than letting the outer catch call
        // it a 500.
        let border: number;
        try { border = parseBorder(url.searchParams.get("border") ?? "0"); }
        catch (e) { return send(400, { error: (e as Error).message }); }

        // Resolve without throwing. `project.map(name)` refuses an unknown
        // name, and that refusal must become a 404 here, not a 500 from the
        // outer catch.
        const resolveLayoutName = () =>
          project.layoutByName(name)
            ? name
            : project.mapNames().includes(name)
              ? project.layoutById(project.map(name).layout)?.name
              : undefined;

        // A DIRTY (or mid-stroke) edit session for this exact map name means disk
        // state is stale (an edit never touches disk until a real commit, per I6) --
        // render straight from the session's own in-memory blocks and skip
        // pngCache entirely. pngCache is keyed only on `name:border` with no
        // expiry of its own; writing a live render into it would serve that
        // one stale-forever afterward, including to a LATER read-only
        // request for the same map once the session eventually closes. Only
        // BROWSER caching is disabled by the response header below -- this
        // server's own process-lifetime Map needed its own bypass.
        // Keyed on `isDirty` (or an open paint stroke, whose command is pushed only
        // at /paint/end), not on the session merely existing: GET /plan
        // opens a session as a side effect, and a clean session's blocks equal
        // disk, so it can use the cache. A staged-only block edit pushes an
        // undo command, so it is dirty too (the overlay sync above clears
        // pngCache when staged tileset bytes change).
        const liveEntry = editSessions.has(name) ? editEntryFor(name) : undefined;
        if (liveEntry && (liveEntry.session.isDirty || liveEntry.strokeStartBlocks !== null)) {
          const layoutName = resolveLayoutName();
          if (!layoutName) return send(404, { error: `no layout or map ${name}` });
          const png = encodePng(renderLayout(project, layoutName, { border, blocksOverride: liveEntry.session.blocks }));
          res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
          return res.end(png);
        }

        const png = cachedRender(name, border);
        if (!png) return send(404, { error: `no layout or map ${name}` });
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }

      // Task 10 (Plan 2): the metatile palette's own thumbnail source -- one
      // 16x16 PNG per metatile id, split-aware via renderMetatile's own
      // id/split.metatiles rule (see that file's header comment). Layout
      // name uses `(.+)`, not `[^/]+` -- matches this file's own
      // established convention for every OTHER per-name route capturing a
      // Project-resolved identifier (/api/render/, /api/map/). The id
      // segment uses `[^/]+` (mirrors the species-icon route's own
      // tight-non-slash-segment match just below), not `\d+`: `\d+` would
      // refuse to match a non-digit id at all (falling through to this
      // file's generic 404 "not found"), silently dead-coding the explicit
      // `Number.isInteger` 400 guard below and failing this route's own
      // "400s a non-integer metatile id" test -- caught by running that
      // test against a first draft using `\d+` here.
      const metatileMatch = /^\/api\/metatile\/(.+)\/([^/]+)\.png$/.exec(url.pathname);
      if (metatileMatch) {
        syncOverlay();
        const layoutName = decodeSegment(metatileMatch[1]!);
        if (layoutName === undefined) return send(400, { error: "malformed percent-escape in path" });
        const id = Number(metatileMatch[2]);
        const layout = project.layoutByName(layoutName);
        if (!layout) return send(404, { error: `no layout ${layoutName}` });
        refuseBrokenLayout(project, layout); // D25: a broken tileset would otherwise surface as a plain 500
        if (!Number.isInteger(id) || id < 0) return send(400, { error: `metatile id must be a non-negative integer, got ${metatileMatch[2]}` });

        const key = `${layoutName}:${id}`;
        let png = pngCache.get(key);
        if (!png) {
          const split = project.splitFor(layout);
          const raster = renderMetatile(id, project.tileset(layout.primaryTileset), project.tileset(layout.secondaryTileset), split, project.profile);
          png = encodePng(raster);
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
        const species = decodeSegment(speciesIconMatch[1]!);
        // S1: the name goes straight into `graphics/pokemon/<dir>/icon.png`,
        // and `%2F` survives the route's `[^/]+` match -- so a decoded name
        // outside `^\w+$` (a path separator, a traversal, anything but a
        // species constant) is refused before any file is read.
        if (species === undefined || !/^\w+$/.test(species)) return send(400, { error: "malformed species" });

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
        const name = decodeSegment(encountersMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
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
        const name = decodeSegment(warpsMatch[1]!);
        if (name === undefined) return send(400, { error: "malformed percent-escape in path" });
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
        const s = decodeSegment(whereMatch[1]!);
        if (s === undefined) return send(400, { error: "malformed percent-escape in path" });
        return send(200, whereSpecies(project, s.startsWith("SPECIES_") ? s : `SPECIES_${s.toUpperCase()}`));
      }

      if (url.pathname === "/api/world") {
        syncOverlay();
        const dungeons = url.searchParams.get("dungeons") !== "0";
        const world = getWorld();
        const sidecar = readSidecar(project.paths.root);
        const scope = url.searchParams.get("scope");
        // dungeon views need every member placed without changing the user's saved setting.
        const resolveSidecar = scope === "dungeon" ? { ...sidecar, dungeonAutoLayout: true } : sidecar;
        const merged = resolveWorldPlacements(project, world, resolveSidecar, { dungeons });

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
          conflicts: wireConflicts(world.conflicts, sidecar.acceptedConflicts ?? []),
          verticalLinks: world.verticalLinks,
          sidecar,
        });
      }
      fellThrough = true;
    })();
    return !fellThrough;
  };
}
