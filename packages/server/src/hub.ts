import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `new URL(...).hostname`, parsed from a header value that may or may not
 * already carry a scheme (`Origin` always does; `Host` never does) --
 * returns `undefined` on anything unparseable rather than throwing, so
 * every call site can treat "malformed" the same as "not local."
 */
function hostnameOf(headerValue: string, alreadyHasScheme: boolean): string | undefined {
  try {
    return new URL(alreadyHasScheme ? headerValue : `http://${headerValue}`).hostname;
  } catch {
    return undefined;
  }
}

/**
 * SR-F9 (security): reject any request whose `Origin` or `Host` header
 * names a non-local hostname, before it is routed anywhere -- for EVERY
 * path, not just `POST /api/hub/open`. Two distinct browser-reachable
 * attacks this blocks, both already possible against this dev server before
 * the hub existed but widened by it (spec review F9): (1) a same-origin-
 * policy-exempt drive-by request from any web page a person happens to have
 * open -- `POST /api/hub/open` with `{ force: true }` would discard unsaved
 * edits or open an arbitrary directory with no user interaction, and
 * `GET /api/hub/browse` would let a remote page enumerate the local
 * filesystem; (2) DNS rebinding, where an attacker's domain later resolves
 * to `127.0.0.1` -- at that point the attacker's own page can be considered
 * "same-origin" by the browser, so `Origin` alone isn't enough; checking
 * `Host` too (what the request line itself claims to be addressed to) is
 * what actually stops it, since the hub only ever means to answer for
 * itself. The Vite dev proxy forwards a same-site `Origin` and a
 * `Host: localhost:<port>` (any port -- this is a dev server on a port that
 * can change), so it passes; Node's own `fetch` sends `Host: 127.0.0.1:
 * <port>` and no `Origin` at all, so every existing test passes too.
 */
function isCrossOriginRequest(headers: { origin?: string; host?: string }): boolean {
  if (headers.origin) {
    const originHost = hostnameOf(headers.origin, true);
    if (!originHost || !LOCAL_HOSTNAMES.has(originHost)) return true;
  }
  const hostHost = headers.host ? hostnameOf(headers.host, false) : undefined;
  if (!hostHost || !LOCAL_HOSTNAMES.has(hostHost)) return true;
  return false;
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
      if (isCrossOriginRequest({ origin: req.headers.origin, host: req.headers.host })) {
        return send(403, { error: "cross-origin request refused" });
      }

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
        // `resolve()` first (SR-F4): a relative `dir` (e.g. `.`, or a `..`
        // that would otherwise walk above whatever `safeNorm` alone could
        // catch) must become absolute before `existsSync`/`readdirSync` ever
        // see it, or the response's own `dir`/`parent` fields silently stay
        // relative and a client-side "up" click can loop.
        const dir = safeNorm(resolve(rawDir));
        if (!existsSync(dir)) return send(404, { error: `no such directory ${dir}` });
        if (!statSync(dir).isDirectory()) return send(400, { error: `not a directory: ${dir}` });
        return send(200, { dir, parent: parentOf(dir), entries: listDir(dir) });
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
            // SR-F5: the swap above already committed -- a client must not
            // be told it failed (500) just because the follow-up
            // recent.json write couldn't happen (e.g. an unwritable home).
            // Log and move on; the swap itself is the thing that matters.
            try {
              pushRecent(home, { path: next.info.root, family: next.family });
            } catch (e) {
              console.error("pokemap hub: failed to record recent project:", e);
            }
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
