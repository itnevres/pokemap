# Plan 4 row 1b review (combined): PokeMap.cmd, scripts/launch.mjs, LAUNCH.md "One-click launch"

Reviewed at HEAD 1ca8c8b (files read with `git show HEAD:`). Verdict: spec met; 1 Important, 4 Minor findings.

## Spec checklist

| Spec sentence | Result | Where |
|---|---|---|
| One file to double-click | met | PokeMap.cmd:1-11 |
| Installs deps if node_modules missing | met | launch.mjs:113 (`npm ci` via shell:true, so npm.cmd resolves) |
| Builds UI if dist/index.html missing or older than UI sources | met (see staleness notes) | launch.mjs:114-125 |
| Starts hub serving built UI | met | launch.mjs:130; serve.ts:47-48 picks up dist |
| Waits until hub answers, opens browser | met | launch.mjs:145-166 |
| Already running -> only open browser | met | launch.mjs:104-108 |
| Closing the window stops the hub | met | child shares the console (stdio inherit, not detached), so the console close event reaches launcher, tsx wrapper and hub. Not run through a real window close. |
| Needs Node; missing -> plain words, stop | met | PokeMap.cmd:4-10 (`where node`, message, pause, exit /b 1) |
| Never runs git; never writes into a game project | met | the launcher only runs npm, node and the browser opener. A project path is only passed to the hub. |

Checked and fine:
- `hub.kill()` on Windows. tsx's cli.mjs spawns a child node. I ran a throwaway test (scratchpad, a listener under tsx, parent `kill()`): the port closed, so no orphan hub. The `--check`, timeout and exit paths do not leak a hub.
- `cd /d "%~dp0"` and `%*` are correct. `start "" url` is quoted correctly: Node quotes the empty arg as `""`.
- `process.exitCode` handling avoids the libuv assertion.
- A failed build: vite empties dist, so a missing index.html means the next run rebuilds.
- A hub dying at start gives "stopped before it was ready" (launch.mjs:155).
- Another program that speaks HTTP on the port gives the plain-words "Something else is using port" (launch.mjs:110).
- Node-version message and range match LAUNCH.md and Vite's engines range.

## Findings (ranked)

1. **Important. `--port 0` is documented but broken.** LAUNCH.md:20 says "`0` lets the system choose, and the real port is printed". The launcher accepts 0 (launch.mjs:101) but builds `url` from the literal port (launch.mjs:25). Scenario: `node scripts/launch.mjs --port 0 --check`. The hub binds a random port, and the launcher polls `http://127.0.0.1:0/` forever. It fails after 90 s with "did not start within 90 seconds" and kills a healthy hub. Fix either way: parse the hub's "pokemap hub on http://127.0.0.1:N" line (this needs stdout piped), or reject 0 in the launcher and drop the claim from LAUNCH.md. The second is simpler, since 0 is only a test convenience.

2. **Minor. A stalled response body can hang forever.** `get()` clears its 1.5 s timer once headers arrive (launch.mjs:53-55), but `r.json()` (:68) and `page.arrayBuffer()` (:71) have no timeout. Scenario: a foreign program on port 5174 sends headers and never finishes the body. The launcher hangs at the "already running" check (:104), which has no overall deadline. Fix: keep the timer until the body is read, or move the clear into the callers.

3. **Minor. The browser can open before the recent project has loaded.** serve.ts:101-125 listens first, then POSTs `/api/hub/open` for the most recent project. The launcher declares "ready" as soon as `/api/hub` answers (launch.mjs:148-152) and opens the browser. Scenario: a big project takes a few seconds to open. The page can load `/api/hub` with `current: null` and show the project picker, although LAUNCH.md:16 says "The hub reopens the most recently used project". This depends on timing and I did not reproduce it. A fix is to wait for the hub's "pokemap hub on" stdout line (printed after the reopen), or to accept it.

4. **Minor. Foreign program that does not speak HTTP on the port.** `hubStatus` returns "down" (launch.mjs:64). The hub then dies with EADDRINUSE and the user sees "PokeMap stopped before it was ready. See the messages above" next to the raw `pokemap hub: listen EADDRINUSE ...` line. This is not the plain-words port message that the HTTP-speaking case gets. A related race: two quick double-clicks. The second launcher's poll can see the first hub as "ui" (launch.mjs:148) and say "running" and open a browser while its own hub has exited. This depends on timing.

5. **Minor. Smaller items.**
   - launch.mjs:80-82: `detached: true` with no `windowsHide` can flash a console window on Windows. `detached` is not needed.
   - .gitattributes has only `*.sh eol=lf`. PokeMap.cmd is LF in the index and the working tree. A plain `cmd` script with no labels works, but add `*.cmd text eol=crlf` as protection.
   - The "Node too old" message exists only in main(). Node older than 14.8 (top-level await) or 12 hits a raw SyntaxError before it. This only matters on very old Node, and PokeMap.cmd only checks that `node` exists.
   - A `readdirSync` permission error in `newestMtime` (launch.mjs:40) is a non-Stop exception, so the user sees a raw stack trace.

## Staleness check

- Inputs counted: ui/src, ui/index.html, ui/package.json, ui/vite.config.ts, core/src, package-lock.json. `node_modules` and `dist` are skipped.
- The UI imports only `@pokemap/core` (grep of ui/src), so the set is adequate. Not counted, and harmless: ui/tsconfig.json (esbuild JSX settings), core/package.json (exports map).
- mtime `<` is right. A file touched by git checkout counts as newer, which only causes a harmless rebuild.
- A build failure is handled (see above).

## LAUNCH.md accuracy

Steps 1-5 match the code order (launch.mjs:97-166). The `--port 0` claim is false for the launcher (finding 1). Everything else matches. Step 4 says "UI sources, core/src, package-lock.json". The code also counts ui/package.json, vite.config.ts and index.html, which "UI sources" covers loosely.

Tests: none exist for the launcher. The brief did not require any.
