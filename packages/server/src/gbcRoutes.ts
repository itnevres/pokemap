/**
 * The GBC (pokecrystal-family) server -- the server-side counterpart of
 * `cli/src/gbcCommands.ts`, the same way `index.ts`'s GBA body is the server
 * counterpart of the CLI's own GBA render/query commands. `createServer`
 * (`index.ts`) branches to `createGbcServer` here the moment
 * `detectEngineFamily` says `"gbc"`, before `openProject` (the GBA loader)
 * ever runs.
 *
 * Task 1a's own routes are `/api/project` and the GBA-only-route 501
 * refusals. Task 1b (this file's current state) adds `/api/groups`,
 * `/api/map/:name`, `/api/render/:name.png` and
 * `/api/metatile/:map/:id.png` -- everything else still answers a plain 404.
 * Task 2 adds `/api/world`, `/api/encounters/:map`, `/api/where/:species`,
 * `/api/coverage` and `/api/species`. Plan 7 adds `/api/edit/*` once GBC
 * gets a write path.
 */
import { createServer as createHttp, type Server } from "node:http";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { loadGbcMapEvents, outOfBoundsEventDefects } from "@pokemap/core/src/gbc/load/events.js";
import { renderGbcMap, renderGbcMapMetatile } from "@pokemap/core/src/gbc/render/map.js";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { GbcMap } from "@pokemap/core/src/gbc/model/types.js";
import type { GbcCollisionInfoEntry, GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { parseBorder, parseTime } from "@pokemap/cli/src/args.js";
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

      // `MapTree`'s own MapGroupsData shape (Plan 6b Q1: `/api/groups`
      // reuses it, so there's no new GBC-only groups type). `groupOrder` is
      // `proj.groupNames()` verbatim (newgroup order); `groups[name]` is
      // built by walking every map once and bucketing by its 1-based
      // `group` field, then sorting each bucket by `number` -- NOT by
      // sorting the names alphabetically, which would silently reorder
      // e.g. CABLE_CLUB's Colosseum/MobileBattleRoom/... away from their
      // real in-group order.
      if (url.pathname === "/api/groups") {
        const groupOrder = proj.groupNames();
        const buckets: GbcMap[][] = groupOrder.map(() => []);
        for (const m of proj.maps) buckets[m.group - 1]!.push(m);
        const groups: Record<string, string[]> = {};
        groupOrder.forEach((name, i) => {
          groups[name] = buckets[i]!.slice().sort((a, b) => a.number - b.number).map((m) => m.name);
        });
        return send(200, { groupOrder, groups });
      }

      const mapMatch = /^\/api\/map\/(.+)$/.exec(url.pathname);
      if (mapMatch) {
        const name = decodeURIComponent(mapMatch[1]!);
        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });
        const map = proj.map(name);

        const { layout, defects: layoutDefects } = proj.layout(map);
        const ts = proj.tileset(map.tileset);

        // Only the values this tileset's `collision` array actually uses --
        // NOT the full 256-entry table `proj.collisionInfo()` holds (Plan
        // 6b "Collision display"). Walking all 4 quadrants of every
        // metatile, not just the ones a given map's blocks reference,
        // matches the spec's own "the values that occur in collision"
        // wording -- `collision` here is `ts.collision` (per metatile,
        // tileset-wide), not filtered further down to this one map's
        // blocks.
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

        return send(200, {
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
        } satisfies GbcMapPayload);
      }

      // `?border`/`?time` are validated BEFORE the map name is resolved --
      // both checks are independent of which map is named (paddingWidth()
      // is a project-wide constant, and parseBorder/parseTime only look at
      // the raw string), mirroring the GBA render route's own order
      // (`index.ts`'s `/api/render/:name.png`: parseBorder runs before
      // `resolveLayoutName()`'s 404). The metatile route below deliberately
      // checks the map name FIRST instead, matching the GBA metatile
      // route's own order (`index.ts`: `layoutByName` before
      // `Number.isInteger(id)`) -- the two GBC routes don't share one order
      // because their GBA counterparts don't either; each mirrors its own.
      const renderMatch = /^\/api\/render\/(.+)\.png$/.exec(url.pathname);
      if (renderMatch) {
        const name = decodeURIComponent(renderMatch[1]!);

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

        const timeParam = url.searchParams.get("time");
        let time: "morn" | "day" | "nite";
        if (timeParam === null) {
          time = "day";
        } else {
          try { time = parseTime(timeParam); }
          catch (e) { return send(400, { error: (e as Error).message }); }
        }

        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });

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
        const name = decodeURIComponent(metatileMatch[1]!);
        const rawId = metatileMatch[2]!;
        if (!mapNames.has(name)) return send(404, { error: `no map ${name}` });

        const id = Number(rawId);
        if (!Number.isInteger(id) || id < 0) {
          return send(400, { error: `metatile id must be a non-negative integer, got ${rawId}` });
        }

        const timeParam = url.searchParams.get("time");
        let time: "morn" | "day" | "nite";
        if (timeParam === null) {
          time = "day";
        } else {
          try { time = parseTime(timeParam); }
          catch (e) { return send(400, { error: (e as Error).message }); }
        }

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
