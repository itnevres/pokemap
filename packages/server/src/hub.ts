import { BodyTooLarge, readBody, sendJson, isCrossOriginRequest, refuseOversize, refuseNonJsonBody, decodeSegment } from "./http.js";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createServer as createHttp, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { detectEngineFamily, probeEngineFamily } from "@pokemap/core/src/family.js";
import { norm } from "@pokemap/core/src/config/paths.js";
import type { BrowseEntry, BrowseResult, HubState, OpenConflict } from "@pokemap/core/src/hub/wire.js";
import { createProjectHandler, type ProjectHandler } from "./index.js";
import { readRecent, pushRecent, recentHome } from "./recent.js";
import { errorMessage } from "@pokemap/core/src/errorMessage.js";

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
 * `norm()` (core/config/paths.ts) collapses ANY all-slashes string to `""`
 * (its trailing-slash-strip regex has nothing left to stop at) and, as a
 * special case of that, turns a bare drive root `"C:/"` into `"C:"` -- fine
 * for every OTHER caller, which only ever joins more path onto the result,
 * but fatal here: `readdirSync("C:")` on Windows lists the *current
 * directory on drive C*, not the drive's real root, and an empty string is
 * not a valid path to `readdirSync`/`existsSync` at all. Every path this
 * file hands to those calls goes through this instead, which restores
 * both roots `norm` would otherwise destroy (spec/quality review SR-F4,
 * QR-F1 -- an earlier version only restored the drive-letter case).
 */
export function safeNorm(s: string): string {
  const n = norm(s);
  if (n === "") return "/";
  return /^[A-Za-z]:$/.test(n) ? `${n}/` : n;
}

/**
 * `true` for any path that IS a root and so has no parent: POSIX `/`, a
 * win32 drive root `C:/`, or a UNC share root `//server/share` (with or
 * without a trailing slash). Deliberately plain string matching, not
 * `node:path`'s platform-default `dirname` -- `dirname` would need the
 * win32 module to understand a drive letter and the posix module to treat
 * `/` alone as a root the way this hub always wants regardless of which OS
 * runs it (or its tests); a regex pins the exact same three cases
 * everywhere (SR-F4/QR-F1).
 */
function isRoot(dir: string): boolean {
  return dir === "/" || /^[A-Za-z]:\/$/.test(dir) || /^\/\/[^/]+\/[^/]+\/?$/.test(dir);
}

/** `null` at any root (see `isRoot`) -- the browse UI reads that as "there
 *  is no parent, show drives / show root." Otherwise the everything-before-
 *  the-last-slash prefix, `safeNorm`-ed the same way `dir` itself always is
 *  (so a parent that itself collapses to a bare drive letter, e.g. the
 *  parent of `C:/x`, comes back `C:/` rather than the un-listable `C:`). */
export function parentOf(dir: string): string | null {
  if (isRoot(dir)) return null;
  const idx = dir.lastIndexOf("/");
  const parent = idx <= 0 ? "/" : dir.slice(0, idx);
  return safeNorm(parent);
}

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

/**
 * `listDir(dir)`'s own `readdirSync` can throw for a directory this process
 * has no permission to list at all (SR-F10) -- distinct from the per-entry
 * `probeEngineFamily` guard already inside `listDir`, which only covers a
 * CHILD entry's own probe. `EACCES`/`EPERM` become a named 403 rather than
 * an opaque 500 from the outer catch; anything else (a genuinely unexpected
 * error) still propagates there.
 */
function respondWithListing(send: (code: number, body: unknown) => void, dir: string): void {
  let entries: BrowseEntry[];
  try {
    entries = listDir(dir);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") return send(403, { error: (e as Error).message });
    throw e;
  }
  send(200, { dir, parent: parentOf(dir), entries } satisfies BrowseResult);
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

/** P12-4w: pre-warm the world tiles in the background; a swap disposes the old handler, which stops its loop. */
function logWarmUp(handler: ProjectHandler): void {
  void handler.warmUp()
    .then((r) => console.log(
      `pokemap hub: warmed ${r.rendered} world tiles in ${Math.round(r.ms)} ms (${r.skipped} skipped, ${r.failed} failed)`))
    .catch((e: unknown) => console.error("pokemap hub: warm-up failed:", e));
}

const UI_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Answers one non-`/api` request from the built UI folder (Plan 4 row 1a).
 * `uiReal` is the realpath of the folder, computed once at startup.
 *
 * The file path comes from the RAW request target, not from `new URL(...)`:
 * `URL` silently normalizes `..` and `%2e%2e` away and would parse `//x` as a
 * host, so it can neither see nor reject a traversal attempt. Each segment is
 * decoded separately and refused if it could name anything but a plain file
 * name. `:` is refused so a drive letter (`C:`) or an NTFS stream
 * (`index.html::$DATA`) can never reach the filesystem. No directory
 * listing and no SPA fallback: anything that is not a regular file is 404.
 */
function serveUi(req: IncomingMessage, res: ServerResponse, uiReal: string, uiDir: string): void {
  const send = (code: number, body: unknown) => sendJson(res, code, body);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    return send(405, { error: "method not allowed" });
  }

  const target = req.url ?? "/";
  const cut = target.search(/[?#]/);
  const raw = cut === -1 ? target : target.slice(0, cut);
  if (!raw.startsWith("/")) return send(404, { error: "not found" });

  let segments: string[];
  if (raw === "/") {
    segments = ["index.html"];
  } else {
    const parts = raw.slice(1).split("/");
    if (parts.some((p) => p === "")) return send(404, { error: "not found" });
    segments = [];
    for (const part of parts) {
      const decoded = decodeSegment(part);
      if (decoded === undefined) return send(400, { error: "malformed URL" });
      segments.push(decoded);
    }
    if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith(".") || /[/\\:\0]/.test(s))) {
      return send(404, { error: "not found" });
    }
  }

  let file: string;
  try {
    // `.native` expands Windows 8.3 short names (`ENV~1` -> `.env`) to the real name, so the dotfile rule below sees it.
    file = realpathSync.native(join(uiDir, ...segments));
    const rel = relative(uiReal, file);
    // A link or junction inside the folder that points outside it is not followed.
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return send(404, { error: "not found" });
    // The real path is checked for dotfiles too, not only the requested name.
    if (rel.split(sep).some((p) => p.startsWith("."))) return send(404, { error: "not found" });
    if (!statSync(file).isFile()) return send(404, { error: "not found" });
  } catch {
    return send(404, { error: "not found" });
  }

  readFile(file).then(
    (data) => {
      res.writeHead(200, {
        "content-type": UI_CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "content-length": data.length,
        "x-content-type-options": "nosniff",
        "cache-control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    },
    () => send(404, { error: "not found" }),
  );
}

export async function createHub(opts: { port?: number; home?: string; open?: string; prewarm?: boolean; uiDir?: string }): Promise<Hub> {
  const home = recentHome(opts.home);
  let current: ProjectHandler | null = null;

  // Checked before anything is opened or listening, so a bad folder leaves nothing running.
  const uiDir = opts.uiDir;
  let uiReal = "";
  if (uiDir !== undefined) {
    try {
      if (!statSync(uiDir).isDirectory()) throw new Error("not a directory");
      uiReal = realpathSync.native(uiDir);
    } catch {
      throw new Error(`no such UI directory ${uiDir}`);
    }
  }

  const http: Server = createHttp((req, res) => {
    const send = (code: number, body: unknown) => sendJson(res, code, body);

    try {
      // Inside the try: a request target `new URL` cannot parse (e.g. `//[`) must be a 400, never an uncaught
      // exception that takes the whole hub down. Node's HTTP parser accepts such targets.
      let url: URL;
      try { url = new URL(req.url ?? "/", "http://localhost"); }
      catch { return send(400, { error: "malformed URL" }); }
      if (isCrossOriginRequest({ origin: req.headers.origin, host: req.headers.host })) {
        return send(403, { error: "cross-origin request refused" });
      }
      if (refuseOversize(req, res)) return;
      if (refuseNonJsonBody(req, res)) return;

      // `/api` routes always win; every other path is the built UI when one is configured.
      if (uiDir !== undefined && url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
        return serveUi(req, res, uiReal, uiDir);
      }

      if (url.pathname === "/api/hub") {
        return send(200, { current: current?.info ?? null, recent: readRecent(home) } satisfies HubState);
      }

      if (url.pathname === "/api/hub/browse") {
        const rawDir = url.searchParams.get("dir");
        if (!rawDir) {
          if (process.platform === "win32") return send(200, { dir: null, parent: null, entries: driveRootEntries() } satisfies BrowseResult);
          return respondWithListing(send, "/");
        }
        // `resolve()` first (SR-F4): a relative `dir` (e.g. `.`, or a `..`
        // that would otherwise walk above whatever `safeNorm` alone could
        // catch) must become absolute before `existsSync`/`readdirSync` ever
        // see it, or the response's own `dir`/`parent` fields silently stay
        // relative and a client-side "up" click can loop.
        const dir = safeNorm(resolve(rawDir));
        if (!existsSync(dir)) return send(404, { error: `no such directory ${dir}` });
        if (!statSync(dir).isDirectory()) return send(400, { error: `not a directory: ${dir}` });
        return respondWithListing(send, dir);
      }

      if (url.pathname === "/api/hub/open" && req.method === "POST") {
        return readBody(req)
          .then((body) => {
            let raw: unknown;
            try { raw = JSON.parse(body); }
            catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }

            // SR-F2: valid JSON that parses to anything other than a plain
            // object (null, an array, a bare number/string) must 400 like
            // any other shape mismatch -- without this, `parsed.path` below
            // throws a TypeError on `null`, which the outer `.catch` turns
            // into an unnamed 500.
            if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
              return send(400, { error: `expected a JSON object body, got ${body}` });
            }
            const parsed = raw as { path?: unknown; force?: unknown };

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
              return send(409, { error: `unsaved edits in ${dirtyMaps.length} map(s)`, dirtyMaps } satisfies OpenConflict);
            }

            let next: ProjectHandler;
            try {
              next = createProjectHandler(path);
            } catch (e) {
              return send(500, { error: errorMessage(e) });
            }

            // Swap BEFORE disposing the old handler (spec step 6): a request
            // still in flight against `old` at this exact instant reads a
            // handler that is about to be disposed, never one that already
            // is -- there is no window where `current` points at a disposed
            // handler.
            const old = current;
            current = next;
            old?.dispose();
            // SR-F5: the swap above already committed -- a client must not
            // be told it failed (500) just because the follow-up
            // recent.json write couldn't happen (e.g. an unwritable home).
            // Log and move on; the swap itself is the thing that matters.
            try {
              pushRecent(home, { path: next.info.root, family: next.family });
            } catch (e) {
              console.error("pokemap hub: failed to record recent project:", e);
            }
            if (opts.prewarm) {
              logWarmUp(next);
            }
            return send(200, next.info);
          })
          .catch((e: unknown) => {
            if (e instanceof BodyTooLarge) return send(413, { error: "request body too large" });
            console.error(e);
            send(500, { error: errorMessage(e) });
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
    if (opts.prewarm) {
      logWarmUp(current);
    }
  }

  try {
    // A listen failure (EADDRINUSE etc.) rejects instead of an uncaught 'error' event.
    await new Promise<void>((ok, fail) => {
      http.once("error", fail);
      http.listen(opts.port ?? 5174, "127.0.0.1", () => {
        http.off("error", fail);
        ok();
      });
    });
  } catch (e) {
    current?.dispose(); // the project opened above must not outlive a hub that never started
    throw e;
  }
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 5174);

  return {
    port,
    close: () => new Promise<void>((r) => http.close(() => r())),
    current: () => current,
  };
}
