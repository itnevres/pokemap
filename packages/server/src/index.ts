import { createServer as createHttp, type Server } from "node:http";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { parseBorder } from "@pokemap/cli/src/args.js";

export interface PokemapServer { port: number; project: Project; close(): Promise<void>; }

export async function createServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer> {
  const project = openProject(opts.projectPath);

  // Unbounded on purpose for now, and worth knowing why: the whole corpus is
  // 1,209 maps and the largest PNG is a few hundred KB, but Route47 at
  // 1920x976 is not, and a client that walks every map pins all of it. Task 23
  // designs the real cache with an eviction policy; until then this is a
  // single-user dev server and the ceiling is understood rather than enforced.
  const pngCache = new Map<string, Buffer>();

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
        return send(200, { map, layout, split: project.splitFor(layout) });
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

      return send(404, { error: "not found" });
    } catch (e) {
      return send(500, { error: (e as Error).message });
    }
  });

  await new Promise<void>((r) => http.listen(opts.port ?? 5174, "127.0.0.1", r));
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);

  return { port, project, close: () => new Promise<void>((r) => http.close(() => r())) };
}
