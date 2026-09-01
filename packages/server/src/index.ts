import { readFileSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type Server } from "node:http";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { buildWorld, resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import { readSidecar, writeSidecar } from "@pokemap/core/src/world/sidecar.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { parseBorder } from "@pokemap/cli/src/args.js";

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

      if (url.pathname === "/api/world") {
        const dungeons = url.searchParams.get("dungeons") !== "0";
        const world = getWorld();
        const sidecar = readSidecar(project.paths.root);
        const merged = resolveWorldPlacements(project, world, sidecar, { dungeons });
        return send(200, {
          placements: Object.fromEntries(merged),
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
