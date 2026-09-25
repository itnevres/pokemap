/**
 * The GBC (pokecrystal-family) server -- the server-side counterpart of
 * `cli/src/gbcCommands.ts`, the same way `index.ts`'s GBA body is the server
 * counterpart of the CLI's own GBA render/query commands. `createServer`
 * (`index.ts`) branches to `createGbcServer` here the moment
 * `detectEngineFamily` says `"gbc"`, before `openProject` (the GBA loader)
 * ever runs.
 *
 * Task 1a's own routes are `/api/project` and the GBA-only-route 501
 * refusals; everything else answers a plain 404 for now. Task 1b adds
 * `/api/groups`, `/api/map/:name`, `/api/render/:name.png` and
 * `/api/metatile/:map/:id.png`. Task 2 adds `/api/world`,
 * `/api/encounters/:map`, `/api/where/:species`, `/api/coverage` and
 * `/api/species`. Plan 7 adds `/api/edit/*` once GBC gets a write path.
 */
import { createServer as createHttp, type Server } from "node:http";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import type { ProjectInfo } from "@pokemap/core/src/family.js";
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
