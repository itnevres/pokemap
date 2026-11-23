# Plan 4 row 1a: quality review (adversarial)

Scope: commit 07dcc4c (`packages/server/src/hub.ts`, `packages/server/src/serve.ts`) and the tests from 2c325d0 (`packages/server/test/hub.test.ts`, the "hub serves the built UI (uiDir)" describe block). I read the code only through `git show 07dcc4c:` and `git diff 1e57ccd 07dcc4c`. I did not run vitest, as the brief instructed. I ran two standalone `node -e` probes (described below) and touched no repo file.

Verdict: **no Critical findings. 2 Important (one is a test that passes for the wrong reason, the other a pre-existing crash on the line the new routing depends on), 6 Minor.** The serving code itself holds up: I could not find a traversal, leak or ordering bug in `serveUi` or `createHub`.

## Important

### I1. The two "backslash" traversal cases contain no backslash. They pass for the wrong reason.
`packages/server/test/hub.test.ts:686` and `:688`:
```ts
"/..\pokemap-ui-secret.txt",
"/assets\..\..\pokemap-ui-secret.txt",
```
These are ordinary string literals, so `\p` and `\.` are identity escapes and the backslash disappears. Checked with `node -e`: they become `"/..pokemap-ui-secret.txt"` and `"/assets....pokemap-ui-secret.txt"`. Neither sends a backslash to the server, so the test's name ("backslash") overstates what is covered. Only the `%5c` case (line 687) actually tests a backslash. Today the code is still safe for a raw `\`: the `/[/\\:\0]/` segment filter refuses it, and the realpath containment check is a second guard. But no test pins the raw-backslash branch (Node's client and llhttp both pass a raw `\` through unchanged). Fix: write them as `String.raw\`/..\pokemap-ui-secret.txt\`` or with `\\`, and add a raw-backslash case that does not start with `.`, such as `/assets\..\..\pokemap-ui-secret.txt`. That case is the one that would reach `join` if the `\\` were dropped from the regex.

### I2. (Pre-existing, but on the line the new routing hangs off.) `GET //[` crashes the hub process.
`packages/server/src/hub.ts:233`: `const url = new URL(req.url ?? "/", "http://localhost");` sits *outside* the handler's `try`. I confirmed both halves with standalone node probes:
- `new URL("//[", "http://localhost")` throws (so does `//a:b@[x`).
- A plain `node:http` server receives the raw request target `//[` from `GET //[ HTTP/1.1` unchanged, because llhttp accepts it.

The throw escapes the `'request'` listener, which makes it an uncaught exception, and the hub exits. It happens before the cross-origin check runs. A browser that fetches `http://127.0.0.1:5174//[` (WHATWG does not percent-encode `[` in paths) also sends this target, so any web page the user visits can probably kill the hub with one no-cors GET, subject to the browser's Private Network Access rules. Row 1a turns the hub into the user-facing server, and the new `/api`-vs-UI branch reads `url.pathname`, so this is the place to fix it. Move the `new URL` inside the `try`, or turn a parse failure into a 400. A test with `rawRequest(port, "//[", {})` would need `rawRequest` to allow that path, and Node's client does allow it.

## Minor

### M1. `--port=5` is silently ignored and the hub starts on 5174.
`packages/server/src/serve.ts:28` uses `argv.indexOf("--port")`, so the `=` form is neither parsed nor refused. Plan 4 accepts `--project=<path>` for the MCP CLI, so a user may reasonably try `--port=5`. Either accept it or refuse any `--port=` prefix with the same message. The other edges I traced are correct:
- `--port` given last is refused.
- `--port -1`, `--port 0x10`, `--port 99999` and `--port --gbc` are refused.
- `--port 05` gives 5.
- With `--port 0 /root`, `/root` is the root, because line 86 skips the value after `--port`.
- `--gbc` together with `--port` works.

None of this parsing has a test (no test imports `serve.ts`), so all of it is unverified beyond reading.

### M2. The EADDRINUSE test does not exercise the dispose-on-failure path.
`hub.test.ts:759` calls `createHub` without `open`, so `current` is null, and deleting `current?.dispose()` at `hub.ts:385` would not fail any test. Also, on that path `pushRecent` (`hub.ts:369`) has already written `recent.json` and `logWarmUp` has started, all for a hub that never listens. The warm-up stops on `dispose`, which is fine. The recent-list write persists, which is a harmless but undocumented side effect. If disposal matters, add a test that opens a scratch root on a taken port and asserts the handler was disposed. One way: spy on `createProjectHandler`, or observe that a request routed through the returned handler 503s.

### M3. The "secret" file goes in the shared OS temp folder under a fixed name.
`hub.test.ts:617` writes `join(ui, "..", "pokemap-ui-secret.txt")`, which is `tmpdir()/pokemap-ui-secret.txt` because `makeRoot` is a `mkdtemp` directly under `tmpdir()`. `hub.test.ts:625` deletes it in `afterAll`. Two consequences:
- If two runs overlap (two worktrees running the same suite), one run's `afterAll` can delete the file while the other's traversal test is in flight. Every assertion there is `not.toContain("SECRET")` plus a 400/403/404 status, so a missing secret makes the test pass vacuously rather than fail.
- If the process dies before `afterAll`, the file is left behind.

Better: build the UI as `<fresh root>/dist` and put the secret in `<fresh root>`, so `roots` cleanup owns it and nothing is shared.

### M4. The symlink test skips silently.
`hub.test.ts:718`: `catch { return; }` reports a pass when no link can be created. Junctions on Windows and symlinks on POSIX normally work, so this rarely triggers. When it does, the containment check (`relative(uiReal, file)` in `serveUi`) loses its only guard while the run still shows green. Use vitest's `ctx.skip()` (or `it.skipIf` after a probe) so the skip is visible. I checked the mutation by reading the code: if the containment line is removed, `realpathSync` resolves the junction to `outside/leak.txt` and serves `SECRET`, so the test does guard that logic when it runs. On Windows, libuv's lstat reports junctions as symlinks, so the JS `realpathSync` follows them.

### M5. The HEAD assertion cannot fail because of the HEAD branch.
`hub.test.ts:660` checks `head.body === ""`. Node's server drops any body on a HEAD response, and Node's client never reads one, so removing `req.method === "HEAD" ? undefined : data` (`hub.ts:210`) does not change the result. The property worth pinning for HEAD is `content-length` equal to the GET length, and it is not asserted. `rawRequest` returns no headers, so it would need to expose them.

### M6. The dev `server` entry now serves whatever `packages/ui/dist` holds.
`serve.ts` picks up `packages/ui/dist` whenever `index.html` exists, including during the Vite dev workflow (`.claude/launch.json` `server`). A stale build then appears at :5174 next to the live Vite UI. The startup line says so, and `--no-ui` exists. However, `LAUNCH.md` does not mention `--port`, `--no-ui` or the new behavior, and the project CLAUDE.md says LAUNCH.md is updated "alongside any launch-related change". Row 1b owns the LAUNCH.md rewrite, so this can wait for 1b if the orchestrator records it there.

## Checked, no finding
- **Traversal:** the path comes from the raw target; empty segments, `.`, `..`, dot-prefixed names, `/ \ : NUL` after per-segment decoding, `%252e` (decoded once, then refused as a literal name or a 404), drive letters and `::$DATA` are all refused. The realpath containment covers the rest. Windows trailing-dot, 8.3 short-name and case variants can only resolve to files inside `uiDir`, so they are harmless. Device names (`CON`, `NUL`) fail `isFile()` and get a 404.
- **`/api` precedence:** the `/api` vs UI decision uses the normalized `url.pathname`, and the file uses the raw target. I tried mismatches (`/foo/../api/hub`, `/api/../index.html`, `/api%2Fhub`, `/%61pi/hub`, `//api/hub`). Each ends up in an API route or a 404, never a wrong file. `/api` exactly, `/api/hub/*` 404 and the 503 with no project behave as before. The cross-origin 403 and the oversize 413 still run before the UI branch. Without `uiDir`, the behavior is unchanged.
- **Error paths:** if `readFile` fails after `stat` (the file was deleted), the reply is a 404, with no headers sent beforehand. `content-length` is the byte length of the Buffer. A malformed escape gets a 400.
- **Ordering in createHub:** `uiDir` is validated before `open` and before `listen`, so a bad `uiDir` leaves nothing opened. The listen `error` listener is `once` and is removed on success. After a failed listen the server holds no handle. The leftover `listening` callback is garbage.
- **Sockets:** `withHub` closes in `finally`, and `rawRequest` uses `agent: false`. The `fetch` keep-alive sockets are the same pattern as the existing tests.
- **serve.ts:** `new URL("../../ui/dist", import.meta.url)` resolves to `packages/ui/dist`. The `uiDir` it passes is absolute, so `join(uiDir, ...)` does not depend on the current directory.
