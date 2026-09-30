import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createServer as createHttp, type Server } from "node:http";
import { detectEngineFamily, probeEngineFamily, type EngineFamily, type ProjectInfo } from "@pokemap/core/src/family.js";
import { norm } from "@pokemap/core/src/config/paths.js";
import { createProjectHandler, readBody, type ProjectHandler } from "./index.js";
import { readRecent, pushRecent, recentHome, type RecentEntry } from "./recent.js";

/**
 * One long-lived `node:http` listener that can point at a different
 * `ProjectHandler` over its lifetime (Plan 6c A1) -- the actual "server hub"
 * this task builds. `current()` exposes the live handler (or `null` before
 * anything has been opened) for tests and `serve.ts`'s own reopen-most-
 * recent logic; nothing else needs it.
 */
export interface Hub {
  port: number;
  close(): Promise<void>;
  current(): ProjectHandler | null;
}

/**
 * `norm()` (core/config/paths.ts) turns a bare drive root `"C:/"` into
 * `"C:"` -- fine for every OTHER caller, which only ever joins more path
 * onto the result, but fatal here: `readdirSync("C:")` on Windows lists the
 * *current directory on drive C*, not the drive's real root. Every path this
 * file hands to `readdirSync`/`existsSync` goes through this instead, which
 * restores the trailing slash on a bare drive letter.
 */
function safeNorm(s: string): string {
  const n = norm(s);
  return /^[A-Za-z]:$/.test(n) ? `${n}/` : n;
}

/** `null` at a drive root (win32) or `/` (posix) -- both mean "there is no
 *  parent, show drives / show root" to the browse UI. */
function parentOf(dir: string): string | null {
  if (dir === "/" || /^[A-Za-z]:\/$/.test(dir)) return null;
  return safeNorm(dirname(dir));
}

interface BrowseEntry { name: string; path: string; family: EngineFamily | "unsupported" | null }

/** Directories only (never a file), excluding dotfiles/`$`-prefixed names,
 *  sorted case-insensitively. An entry whose probe throws is skipped rather
 *  than failing the whole listing -- `probeEngineFamily` itself never
 *  throws, but this guard costs nothing and matches the spec's own
 *  "never fatal" wording for a directory this process can list but not
 *  otherwise touch (e.g. a permissions edge case on the family probe's own
 *  `existsSync` calls). */
function listDir(dir: string): BrowseEntry[] {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("$"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const entries: BrowseEntry[] = [];
  for (const name of names) {
    const path = dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
    try {
      entries.push({ name, path, family: probeEngineFamily(path) });
    } catch {
      // Never fatal to the whole listing (spec) -- skip just this entry.
    }
  }
  return entries;
}

/** The win32 "no `dir` given" case: every drive letter that actually exists,
 *  named `"C:"` (matching a real drive picker's own convention) with a path
 *  that keeps the trailing slash `safeNorm` exists to protect. */
function driveRootEntries(): BrowseEntry[] {
  const entries: BrowseEntry[] = [];
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    const path = `${letter}:/`;
    if (existsSync(path)) entries.push({ name: `${letter}:`, path, family: probeEngineFamily(path) });
  }
  return entries;
}

export async function createHub(opts: { port?: number; home?: string; open?: string }): Promise<Hub> {
  const home = recentHome(opts.home);
  let current: ProjectHandler | null = null;

  const http: Server = createHttp((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    try {
      if (url.pathname === "/api/hub") {
        return send(200, { current: current?.info ?? null, recent: readRecent(home) } satisfies { current: ProjectInfo | null; recent: RecentEntry[] });
      }

      if (url.pathname === "/api/hub/browse") {
        const rawDir = url.searchParams.get("dir");
        if (!rawDir) {
          if (process.platform === "win32") return send(200, { dir: null, parent: null, entries: driveRootEntries() });
          const dir = "/";
          return send(200, { dir, parent: parentOf(dir), entries: listDir(dir) });
        }
        const dir = safeNorm(rawDir);
        if (!existsSync(dir)) return send(404, { error: `no such directory ${dir}` });
        if (!statSync(dir).isDirectory()) return send(400, { error: `not a directory: ${dir}` });
        return send(200, { dir, parent: parentOf(dir), entries: listDir(dir) });
      }

      if (url.pathname === "/api/hub/open" && req.method === "POST") {
        return readBody(req)
          .then((body) => {
            let parsed: { path?: unknown; force?: unknown };
            try { parsed = JSON.parse(body) as typeof parsed; }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }

            if (typeof parsed.path !== "string" || parsed.path.trim() === "") {
              return send(400, { error: `expected a non-empty "path" string, got ${body}` });
            }
            if (parsed.force !== undefined && typeof parsed.force !== "boolean") {
              return send(400, { error: `"force" must be a boolean when present, got ${JSON.stringify(parsed.force)}` });
            }
            const path = parsed.path;
            const force = parsed.force === true;

            if (!existsSync(path) || !statSync(path).isDirectory()) {
              return send(404, { error: `no such directory ${path}` });
            }

            try {
              detectEngineFamily(path);
            } catch (e) {
              return send(422, { error: (e as Error).message });
            }

            const dirtyMaps = current?.dirtyMaps() ?? [];
            if (dirtyMaps.length > 0 && !force) {
              return send(409, { error: `unsaved edits in ${dirtyMaps.length} map(s)`, dirtyMaps });
            }

            let next: ProjectHandler;
            try {
              next = createProjectHandler(path);
            } catch (e) {
              return send(500, { error: e instanceof Error ? e.message : String(e) });
            }

            // Swap BEFORE disposing the old handler (spec step 6): a request
            // still in flight against `old` at this exact instant reads a
            // handler that is about to be disposed, never one that already
            // is -- there is no window where `current` points at a disposed
            // handler.
            const old = current;
            current = next;
            old?.dispose();
            pushRecent(home, { path: next.info.root, family: next.family });
            return send(200, next.info);
          })
          .catch((e: unknown) => {
            console.error(e);
            send(500, { error: e instanceof Error ? e.message : String(e) });
          });
      }

      if (url.pathname.startsWith("/api/hub")) {
        return send(404, { error: "not found" });
      }

      if (!current) return send(503, { error: "no project open" });
      return current.handle(req, res);
    } catch (e) {
      console.error(e);
      return send(500, { error: (e as Error).message });
    }
  });

  if (opts.open) {
    // Exactly steps 2/3/5 of POST /api/hub/open above, minus the dirty-edits
    // check (step 4): nothing can be dirty before any project has ever been
    // opened. A failure here throws out of createHub -- serve.ts's own catch
    // is what turns that into a reported startup failure, per spec ("no
    // force question at startup").
    const path = opts.open;
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new Error(`no such directory ${path}`);
    }
    detectEngineFamily(path); // throws its own named-marker message on refusal
    current = createProjectHandler(path);
    pushRecent(home, { path: current.info.root, family: current.family });
  }

  await new Promise<void>((r) => http.listen(opts.port ?? 5174, "127.0.0.1", r));
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);

  return {
    port,
    close: () => new Promise<void>((r) => http.close(() => r())),
    current: () => current,
  };
}
