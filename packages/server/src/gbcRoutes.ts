/**
 * The GBC (pokecrystal-family) server -- the server-side counterpart of
 * `cli/src/gbcCommands.ts`, the same way `index.ts`'s GBA body is the server
 * counterpart of the CLI's own GBA render/query commands. `createServer`
 * (`index.ts`) branches to `createGbcServer` here the moment
 * `detectEngineFamily` says `"gbc"`, before `openProject` (the GBA loader)
 * ever runs.
 *
 * Task 1a's own routes are `/api/project` and the GBA-only-route 501
 * refusals. Task 1b adds `/api/groups`, `/api/map/:name`,
 * `/api/render/:name.png` and `/api/metatile/:map/:id.png`. Task 2 (this
 * file's current state) adds `/api/world`, `/api/encounters/:map`,
 * `/api/where/:species`, `/api/coverage` and `/api/species` -- everything
 * else still answers a plain 404. Plan 7 adds `/api/edit/*` once GBC gets a
 * write path.
 *
 * The payload-assembly logic for `/api/groups` and `/api/map/:name` is
 * factored into `buildGbcGroupsPayload`/`buildGbcMapPayload` below, exported
 * and unit-testable against a `stubGbcProject` (Task 1b fix round 1, quality
 * review findings 2/5) -- `createGbcServer`'s own body stays a thin dispatch
 * list of `if (match) return send(200, buildX(...))` lines, the same shape
 * Task 2's five new routes should follow rather than growing this function
 * into one 400-line handler the way `index.ts` did.
 */
import { createServer as createHttp, type Server } from "node:http";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { loadGbcMapEvents, outOfBoundsEventDefects } from "@pokemap/core/src/gbc/load/events.js";
import { renderGbcMap, renderGbcMapMetatile } from "@pokemap/core/src/gbc/render/map.js";
import { buildGbcWorld, type GbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import {
  gbcEncounterSources,
  gbcWhereSpecies,
  gbcCoverage,
  loadGbcSpeciesConstants,
  normalizeGbcSpecies,
  type GbcCoverage,
} from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { GbcMap } from "@pokemap/core/src/gbc/model/types.js";
import type {
  GbcCollisionInfoEntry,
  GbcMapPayload,
  GbcWorldPayload,
  GbcEncountersPayload,
} from "@pokemap/core/src/gbc/wire.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { parseBorder, parseTime, type TimeOfDay } from "@pokemap/cli/src/args.js";
import type { PokemapServer } from "./index.js";

/**
 * GBA-only routes this server refuses with a 501, the HTTP counterpart of
 * the CLI's `refuseIfGbc` (`cli/src/index.ts`) -- the route exists, but this
 * family doesn't support it (yet, in Plan 7's case for `/api/edit/*`). An
 * unmatched path stays a plain 404, handled by the fallthrough below, not by
 * this list. `sign/`, `edit/` and the species-icon path end in a required
 * next segment (`sign/NAME/suggestions`, `edit/NAME/undo`,
 * `species/NAME/icon.png`), so their own alternatives don't need a trailing
 * `(/|$)` the way `dungeons` and `world/...`'s bare-vs-nested routes do.
 */
const GBA_ONLY_ROUTE_RE = /^\/api\/(warps\/|dungeons(\/|$)|world\/placement$|world\/dungeons$|sign\/|edit\/|species\/[^/]+\/icon\.png$)/;

/**
 * `decodeURIComponent` throws a `URIError` on a malformed percent-escape
 * (e.g. a lone `%` or a truncated multi-byte UTF-8 sequence like
 * `%E0%A4%A`) -- letting that throw reach a route's own try/catch-free body
 * would surface as a 500 naming only "URI malformed", not the offending
 * segment (Task 1b fix round 1, spec review finding 7). Every `:name`-style
 * route below calls this instead of `decodeURIComponent` directly, and
 * answers 400 naming the raw (still-encoded) segment on `undefined` --
 * `index.ts`'s GBA routes keep their own pre-existing 500-on-malformed-
 * escape behaviour unchanged, since this fix is GBC-only (spec ground rule:
 * "index.ts is not touched in this task").
 */
export function decodeMapName(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Shared `?time=` parser for the render and metatile routes (Task 1b fix
 * round 1, quality review finding 3: this exact 8-line block used to be
 * duplicated verbatim in both). Absent -> `"day"` (the CLI's own default,
 * `cli/src/index.ts:52`); present but invalid -> `{ error }` for the caller
 * to turn into a 400, mirroring `parseBorder`'s own throw-vs-guard split
 * rather than throwing itself, so a caller never needs its own try/catch
 * around this. Typed with the already-exported `TimeOfDay`
 * (`cli/src/args.ts`) rather than repeating the `"morn" | "day" | "nite"`
 * literal union a second time in this file (quality review finding 6).
 */
export function parseTimeParam(url: URL): { time: TimeOfDay } | { error: string } {
  const timeParam = url.searchParams.get("time");
  if (timeParam === null) return { time: "day" };
  try {
    return { time: parseTime(timeParam) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * `GET /api/groups`'s payload -- `MapTree`'s own `MapGroupsData` shape
 * (Plan 6b Q1: reused as-is, so there's no new GBC-only groups type).
 * `groupOrder` is `proj.groupNames()` verbatim (`newgroup` order);
 * `groups[name]` is built by walking every map once and bucketing it by its
 * 1-based `group` field, then sorting each bucket by `number` -- NOT by
 * sorting the names alphabetically, which would silently reorder e.g.
 * CABLE_CLUB's Colosseum/MobileBattleRoom/... away from their real in-group
 * order. Exported (Task 1b fix round 1, quality review finding 5) so the
 * route handler below stays a one-line dispatch.
 */
export function buildGbcGroupsPayload(proj: GbcProject): { groupOrder: string[]; groups: Record<string, string[]> } {
  const groupOrder = proj.groupNames();
  const buckets: GbcMap[][] = groupOrder.map(() => []);
  for (const m of proj.maps) buckets[m.group - 1]!.push(m);
  const groups: Record<string, string[]> = {};
  groupOrder.forEach((name, i) => {
    groups[name] = buckets[i]!.slice().sort((a, b) => a.number - b.number).map((m) => m.name);
  });
  return { groupOrder, groups };
}

/**
 * `GET /api/map/:name`'s payload, exactly `GbcMapPayload` (`gbc/wire.ts`).
 * `map` is already resolved by the caller (the route below looks it up
 * through `mapNames`/`proj.map()` so an unknown name never reaches here) --
 * this function itself never throws on a bad name, only on the underlying
 * loaders' own real failures.
 *
 * `collisionInfo` is filtered to only the values this tileset's `collision`
 * array actually uses (all 4 quadrants of every metatile, not just the ones
 * this one map's blocks reference) -- NOT the full 256-entry table
 * `proj.collisionInfo()` holds (Plan 6b "Collision display"). `blocks` is
 * `layout.blocks` verbatim: raw ids, `0` NOT substituted for the border
 * metatile the way `renderGbcMap`'s own render loop does -- that
 * substitution is a per-pixel rendering concern, not this payload's (the
 * corpus itself has no id-0 block to prove this against over HTTP; see
 * `gbcRoutes.test.ts`'s own `buildGbcMapPayload` unit test, which overrides
 * `layout()` through `stubGbcProject` to supply one, Task 1b fix round 1,
 * quality review finding 2).
 *
 * Exported (fix round 1, quality review findings 2/5) precisely so it can
 * be unit-tested directly against a stub `GbcProject`, without needing
 * `createGbcServer` restructured for dependency injection.
 */
export function buildGbcMapPayload(proj: GbcProject, map: GbcMap): GbcMapPayload {
  const { layout, defects: layoutDefects } = proj.layout(map);
  const ts = proj.tileset(map.tileset);

  const usedValues = new Set<number>();
  for (const c of ts.collision) {
    usedValues.add(c.tl);
    usedValues.add(c.tr);
    usedValues.add(c.bl);
    usedValues.add(c.br);
  }
  const allCollisionInfo = proj.collisionInfo();
  const collisionInfo: Record<string, GbcCollisionInfoEntry> = {};
  for (const v of usedValues) {
    const entry = allCollisionInfo.get(v);
    if (entry) collisionInfo[String(v)] = entry;
  }

  const { events, defects: eventDefects } = loadGbcMapEvents(proj.root, map);
  const defects = [...layoutDefects, ...eventDefects, ...outOfBoundsEventDefects(map, events)];

  return {
    family: "gbc",
    map,
    layout: { blkPath: layout.blkPath, width: layout.width, height: layout.height, writable: layout.writable },
    blocks: layout.blocks,
    metatileCount: ts.metatiles.length,
    tileset: { constName: ts.constName, name: ts.name },
    collision: ts.collision,
    collisionInfo,
    events,
    defects,
    paddingWidth: proj.paddingWidth(),
  } satisfies GbcMapPayload;
}

/**
 * `GET /api/world`'s payload (Task 2), wire-shaping `buildGbcWorld`'s own
 * `GbcWorld` -- `world.placements` (a `Map`, keyed by map name) becomes a
 * plain `Object.fromEntries` object (`GbcWorldPayload.placements`'s own doc
 * comment: JSON has no `Map`, and serialising one directly gives `{}`, not a
 * refusal -- a mutation this file's tests specifically check for).
 * `components`/`conflicts` pass through unchanged. Takes the already-built
 * `world` rather than `proj`, since nothing here needs anything from `proj`
 * that isn't already in `world` -- `createGbcServer`'s own `getWorld()`
 * (below) is what caches the expensive `buildGbcWorld` call itself; this
 * function is cheap and safe to call fresh on every request, including the
 * "second request returns deep-equal data" test, since `Object.fromEntries`
 * never mutates the `Map` it reads from.
 */
export function buildGbcWorldPayload(world: GbcWorld): GbcWorldPayload {
  return {
    family: "gbc",
    blockPx: 32,
    placements: Object.fromEntries(world.placements),
    components: world.components,
    conflicts: world.conflicts,
  } satisfies GbcWorldPayload;
}

/**
 * `GET /api/encounters/:map`'s payload (Task 2). `map` is already resolved
 * by the caller (the route below checks `mapNames` first, same discipline as
 * `buildGbcMapPayload`) -- `name` here is trusted to be a real map name.
 * `sources` is `gbcEncounterSources`'s own output verbatim: an empty array
 * for a map with no wild encounters (e.g. `PlayersHouse1F`, `ElmsLab`) is
 * real data, not an error, so this never special-cases a length-0 result.
 * `defects` is `proj.wild().defects` -- the corpus-wide wild-data defect
 * list (the `kanto_grass.asm` missing-terminator warning), the same value
 * for every map, not a per-map defect list (`GbcEncountersPayload`'s own doc
 * comment).
 */
export function buildGbcEncountersPayload(proj: GbcProject, name: string): GbcEncountersPayload {
  return {
    mapName: name,
    sources: gbcEncounterSources(proj, name),
    defects: proj.wild().defects,
  } satisfies GbcEncountersPayload;
}

export async function createGbcServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer> {
  const proj = openGbcProject(opts.projectPath);

  // Built once, not per-request: proj.maps is already fully loaded and
  // read-only for the life of this process (I8, same reasoning as every
  // GBA-side cache in index.ts). Every route below that resolves a `:name`
  // segment checks membership in this Set BEFORE ever calling proj.map(name)
  // -- proj.map() throws on a miss, and letting that throw reach the outer
  // try/catch would turn "no such map" into a 500 instead of a 404.
  const mapNames = new Set(proj.maps.map((m) => m.name));

  // Rendered PNGs are cache-keyed by every input that changes their pixels
  // (name/map, border where it applies, and time-of-day) -- Plan 0 §7's own
  // "cache key dropped border" lesson, which is why the render and metatile
  // caches below are separate Maps (mirrors index.ts's own pngCache/
  // iconCache split) rather than one shared cache keyed loosely enough for
  // a render key and a metatile key to ever collide.
  const renderCache = new Map<string, Buffer>();
  const metatileCache = new Map<string, Buffer>();

  // buildGbcWorld walks all 391 maps' connections -- measured ~2ms against
  // the real corpus (cheap, unlike GBA's ~4s buildWorld over 1,209 maps), but
  // proj is read-only for the life of this process (I8) either way, so the
  // answer can't change and there is no reason to recompute it per request.
  // Same "compute at most once, on the first request that needs it" posture
  // as GBA's own worldCache (index.ts).
  let worldCache: GbcWorld | undefined;
  const getWorld = () => (worldCache ??= buildGbcWorld(proj));

  // gbcCoverage walks every one of the 391 maps' wild-data tables (measured
  // ~100-150ms against the real corpus in this environment -- slower than
  // the plan review's own ~11ms estimate, re-measured rather than trusted;
  // see the implementer report) -- same "read-only project, compute once"
  // reasoning as worldCache above and GBA's own coverageCache.
  let coverageCache: GbcCoverage | undefined;
  const getCoverage = () => (coverageCache ??= gbcCoverage(proj));

  // loadGbcSpeciesConstants reads one small .asm file and returns it already
  // sorted -- cheap even uncached, but the answer can't change for the life
  // of this read-only-decomp process (I8), same reasoning as every other
  // cache in this file.
  let speciesCache: string[] | undefined;
  const getSpecies = () => (speciesCache ??= loadGbcSpeciesConstants(proj.root));

  const http: Server = createHttp((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    try {
      if (url.pathname === "/api/project") {
        return send(200, { family: "gbc", root: proj.root } satisfies ProjectInfo);
      }

      if (url.pathname === "/api/groups") {
        return send(200, buildGbcGroupsPayload(proj));
      }

      const mapMatch = /^\/api\/map\/(.+)$/.exec(url.pathname);
      if (mapMatch) {
        const rawName = mapMatch[1]!;
        const name = decodeMapName(rawName);
        if (name === undefined) return send(400, { error: `malformed map name ${rawName}` });
        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });
        return send(200, buildGbcMapPayload(proj, proj.map(name)));
      }

      // Both PNG routes below resolve the map name FIRST (404), then
      // validate `?border`/`?id`/`?time` (400) -- a deliberate choice made
      // for GBC specifically (Task 1b fix round 1, spec review finding 4),
      // not a copy of GBA's own two routes, which disagree with EACH OTHER
      // on this and shouldn't both be mirrored: GBA's render route
      // (`index.ts`) only happens to validate `?border` before its 404
      // because that 404 lives inside its cache-miss branch
      // (`index.ts:281-293`), an artefact of how that route's caching was
      // written, not a deliberate order; GBA's metatile route
      // (`index.ts:318-320`) checks `layoutByName`'s 404 before
      // `Number.isInteger(id)`'s 400 for its own, unrelated reason. GBC's
      // two routes agree with each other on purpose instead of reproducing
      // that incidental GBA split.
      const renderMatch = /^\/api\/render\/(.+)\.png$/.exec(url.pathname);
      if (renderMatch) {
        const rawName = renderMatch[1]!;
        const name = decodeMapName(rawName);
        if (name === undefined) return send(400, { error: `malformed map name ${rawName}` });
        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });

        const borderParam = url.searchParams.get("border");
        let border: number;
        if (borderParam === null) {
          border = 0;
        } else {
          try { border = parseBorder(borderParam); }
          catch (e) { return send(400, { error: (e as Error).message }); }
        }
        const maxBorder = proj.paddingWidth();
        if (border > maxBorder) {
          return send(400, { error: `border ${border} out of range -- must be an integer 0-${maxBorder}` });
        }

        const timeResult = parseTimeParam(url);
        if ("error" in timeResult) return send(400, { error: timeResult.error });
        const { time } = timeResult;

        const key = `${name}:${border}:${time}`;
        let png = renderCache.get(key);
        if (!png) {
          png = encodePng(renderGbcMap(proj, name, { border, time }));
          renderCache.set(key, png);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }

      // Id segment uses `[^/]+`, not `\d+` -- same reasoning as the GBA
      // metatile route's own comment (`index.ts`): `\d+` would silently
      // dead-code the `Number.isInteger` 400 guard below for a non-digit
      // id (e.g. "abc" or "1.5"), which would otherwise just fall through
      // to the generic 404 instead of the named 400 the spec asks for.
      const metatileMatch = /^\/api\/metatile\/(.+)\/([^/]+)\.png$/.exec(url.pathname);
      if (metatileMatch) {
        const rawName = metatileMatch[1]!;
        const rawId = metatileMatch[2]!;
        const name = decodeMapName(rawName);
        if (name === undefined) return send(400, { error: `malformed map name ${rawName}` });
        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });

        const id = Number(rawId);
        if (!Number.isInteger(id) || id < 0) {
          return send(400, { error: `metatile id must be a non-negative integer, got ${rawId}` });
        }

        const timeResult = parseTimeParam(url);
        if ("error" in timeResult) return send(400, { error: timeResult.error });
        const { time } = timeResult;

        const map = proj.map(name);
        const ts = proj.tileset(map.tileset);
        const metatileCount = ts.metatiles.length;
        if (id >= metatileCount) {
          return send(404, { error: `metatile ${id} out of range for ${ts.constName} (count ${metatileCount})` });
        }

        const key = `${name}:${id}:${time}`;
        let png = metatileCache.get(key);
        if (!png) {
          png = encodePng(renderGbcMapMetatile(proj, name, id, { time }));
          metatileCache.set(key, png);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
        return res.end(png);
      }

      // Query params are ignored here on purpose: GBA's own `/api/world`
      // reads `?dungeons=`, but GBC's `buildGbcWorld` places every map
      // unconditionally -- there is no dungeons-on/off toggle to read a
      // query param for (`gbc/world/connections.ts`'s own doc comment).
      if (url.pathname === "/api/world") {
        return send(200, buildGbcWorldPayload(getWorld()));
      }

      // `(.+)`, not `[^/]+` -- same reasoning as `/api/map/:name` above: a
      // map name never contains a slash in this corpus, but matching the
      // rest of the path rather than one segment keeps this route's own
      // malformed-escape handling (`decodeMapName`) the single place that
      // rejects a bad name, instead of a slash in it silently 404ing through
      // the generic fallthrough.
      const encountersMatch = /^\/api\/encounters\/(.+)$/.exec(url.pathname);
      if (encountersMatch) {
        const rawName = encountersMatch[1]!;
        const name = decodeMapName(rawName);
        if (name === undefined) return send(400, { error: `malformed map name ${rawName}` });
        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });
        return send(200, buildGbcEncountersPayload(proj, name));
      }

      // `[^/]+`, the GBA `/api/where/:species` convention (`index.ts`) --
      // a species constant never contains a slash. Unlike GBA's own route,
      // this one runs the raw segment through `decodeMapName` first (this
      // file's own established convention for every `:name`-style capture,
      // even though this one isn't a map name), so a malformed percent-escape
      // answers 400 rather than an unnamed 500. An unknown species is a 200
      // with `[]`, exactly like GBA -- `gbcWhereSpecies` never throws on a
      // species with no hits, it just returns nothing to iterate.
      const whereMatch = /^\/api\/where\/([^/]+)$/.exec(url.pathname);
      if (whereMatch) {
        const raw = whereMatch[1]!;
        const species = decodeMapName(raw);
        if (species === undefined) return send(400, { error: `malformed species ${raw}` });
        return send(200, gbcWhereSpecies(proj, normalizeGbcSpecies(species)));
      }

      if (url.pathname === "/api/coverage") {
        return send(200, getCoverage());
      }

      // Exact match, not a prefix -- same discipline as GBA's own
      // `/api/species` (`index.ts`): "/api/species" alone, nothing after it,
      // so it can never shadow the GBA-only-route refusal below for
      // "/api/species/:name/icon.png" (GBA_ONLY_ROUTE_RE's own
      // `species/[^/]+/icon\.png$` alternative).
      if (url.pathname === "/api/species") {
        return send(200, getSpecies());
      }

      if (GBA_ONLY_ROUTE_RE.test(url.pathname)) {
        return send(501, { error: `${url.pathname} is not supported for gbc (pokecrystal-family) projects yet` });
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

  return { port, family: "gbc", project: proj, close: () => new Promise<void>((r) => http.close(() => r())) };
}
