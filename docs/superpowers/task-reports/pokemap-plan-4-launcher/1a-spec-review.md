# Plan 4 row 1a: spec-compliance review (adversarial)

Scope: `git diff 1e57ccd 07dcc4c` (hub.ts `serveUi`, `createHub` `uiDir`, listen rejection; serve.ts `--port`/`--no-ui`), tests from 2c325d0 (`packages/server/test/hub.test.ts`, describe "hub serves the built UI (uiDir)"). Spec: brief-1a.md requirements 1-7 + serve.ts section, plan row 1a. All code read via `git show`/`git diff` only. No vitest run. The empirical checks below copy the `serveUi` path logic verbatim into a standalone script and run it against a scratch folder under `%TEMP%` (NTFS, C:).

**Verdict: changes requested.** 1 Important spec defect (dotfile rule bypassed on Windows), 1 Important test defect (the backslash cases are vacuous), 1 Important pre-existing crash (outside this diff), and some Minor gaps where tests don't pin a requirement. I could not make any request read a file outside `uiDir`.

## Findings

### I1 (Important, spec req 4): 8.3 short names defeat the dotfile rule
`packages/server/src/hub.ts:186` refuses segments that start with `.`. Then `hub.ts:193` calls `realpathSync(join(uiDir, ...segments))`. On Windows, Node's JS `realpathSync` keeps the name as requested: it does not expand 8.3 short names or fix case. So the dotfile check only ever sees the short alias. I reproduced this on this machine (8.3 generation is on for C:):

| request | result |
|---|---|
| `GET /ENV~1` | 200, body of `<uiDir>\.env` |
| `GET /GITIGN~1` | 200, body of `<uiDir>\.gitignore-long` |
| `GET /VITE~1/manifest.json` | 200, body of `<uiDir>\.vite\manifest.json` |

The files stay inside `uiDir`, so this is not a traversal. It does break the "dotfiles -> 404" requirement. Today's Vite config emits no dotfiles (no `build.manifest`, no `public/`), so the real exposure is low, but the rule is meant as a guarantee. No test covers it.

Fix: resolve with `realpathSync.native` for both `uiReal` (`hub.ts:226`) and the file. On Windows, the native call goes through `GetFinalPathNameByHandle`, which returns long names in their real case. Then re-apply the segment rule (no segment starts with `.`) to `relative(uiReal, file).split(sep)`. Add a test: create `.env`, read its short name with `dir /x` (or guess `ENV~1`), and expect 404. Skip it when no short name exists.

### I2 (Important, tests): the "backslash" traversal cases never send a backslash
`packages/server/test/hub.test.ts:686` and `:688` are plain string literals with one backslash each. I checked the bytes: `5c 70` ("\p") and `5c 2e` ("\."). In JS/TS, `\p` and `\.` are identity escapes, so at runtime the strings are:
- `"/..\pokemap-ui-secret.txt"` -> `"/..pokemap-ui-secret.txt"`
- `"/assets\..\..\pokemap-ui-secret.txt"` -> `"/assets....pokemap-ui-secret.txt"`

Both are harmless names. The raw-backslash attack the test title names ("backslash") is never exercised. Only the `%5c` form at :687 is.

The code is still correct. The `\\` in the regex at `hub.ts:186` (bytes `5b 2f 5c 5c 3a 5c 30 5d`, i.e. `[/\\:\0]`) rejects a decoded backslash, and the realpath check covers it again. But the test is weaker than claimed. Fix: use ``String.raw`/..\pokemap-ui-secret.txt` `` (or `\\`) for both entries.

### I3 (Important, pre-existing, NOT a 1a regression): `GET //` crashes the hub process
`hub.ts:233`: `const url = new URL(req.url ?? "/", "http://localhost");` runs outside the handler's `try` (the try starts at :236). `new URL("//", "http://localhost")` throws `ERR_INVALID_URL` (verified). Node's HTTP parser accepts the request line `GET // HTTP/1.1` (verified: it reaches the request listener). A throw from the request listener is an uncaught exception, so the hub exits.

This runs before the cross-origin check, so any web page can kill the local hub with `fetch("http://127.0.0.1:5174//", {mode: "no-cors"})`. The line is unchanged from 1e57ccd:139, so it is outside this diff. I'm reporting it per the brief's "report unrelated bugs" rule. The `//pokemap-ui-secret.txt` case in the test passes only because `//<host>` parses. Fix in a follow-up: move the `new URL` inside the try, or catch it and answer 400.

### M1 (Minor, tests): parts of the spec are implemented but not pinned
Each item below was checked by reasoning about what would happen if that piece of logic were removed:
- `isFile()` at hub.ts:197: if removed, `/assets` goes to `readFile` on a directory, gets EISDIR, and the rejection handler at :213 still answers 404. The test passes either way. The rule is not pinned, but behaviour is the same.
- NUL in the regex: `/index.html%00.png` without the check gets `ERR_INVALID_ARG_VALUE` from `realpathSync`, which is caught and answered 404. `/%00/../...` is already stopped by its raw `..`. Not pinned, harmless.
- The `..` / `\` segment checks are backed by the realpath check, so removing either one alone leaves every listed attempt at 404. That is defense in depth, not a defect. The realpath check itself is pinned only by the junction test, which returns early if the link can't be created (fine on Windows, since junctions need no admin rights).
- Not asserted anywhere: the `allow: GET, HEAD` header on 405, `content-length`, `cache-control: no-cache`, nosniff on static error responses, `.mjs/.json/.svg/.png/.ico/.woff2/.woff/.txt/.map` types, the exact `/api` path (no slash) going to the API, the "not a directory" branch of req 1 (a file given as `uiDir`), and req 7's "nothing left running" (`current?.dispose()` at :385 on listen failure with `open`). HEAD sending no body passes regardless, because Node drops the body of a HEAD response itself.
- serve.ts has no tests: `--port` validation, `--no-ui`, positional-root skip, the extra stdout line. The row's verify command covers hub.test.ts only, so this is expected. Reviewed by reading only (below).

### M2 (Minor): absolute-form request targets get 404 from the UI
`GET http://127.0.0.1:<port>/index.html HTTP/1.1` reaches the handler with `req.url` in absolute form (verified). `hub.ts:172` answers 404 because the raw target does not start with `/`. That is safe and matches the "raw target" rule. The `/api` routes still accept absolute form through `URL`. The split is harmless; I'm noting it only for consistency.

## Requirement-by-requirement

1. `uiDir` option, error `no such UI directory <uiDir>` before listen (hub.ts:220-230). Met: `statSync` + `isDirectory` + `realpathSync`, all before `opts.open` and before listen. A file given as `uiDir` is refused through the same message.
2. Order and precedence (hub.ts:237-245): 403 and oversize checks run first, then the UI for anything that is not `/api` and not under `/api/`. Without `uiDir`, behaviour is unchanged. Met. `/api` precedence against `URL` normalisation: `/x/../api/hub` and `/api\hub` go to the API (the same routing as before 1a, nothing new exposed). `/api/../index.html` goes to the UI, where the raw `..` makes it 404. `/%61pi/hub` and `/api%2fhub` stay off the API and resolve to UI files or 404. No bypass in either direction.
3. GET/HEAD only. 405 with `allow` via `sendJson` (:164-167). Met.
4. Raw target, cut at `?`/`#`; `/` maps to index.html; empty segments 404; `decodeSegment` failure 400; the segment blacklist; `relative` containment against `uiReal` computed once; isFile; fs errors 404. All met as written (see I1 for the 8.3 gap). Windows probes, all 404 or contained: `CON`, `NUL`, `COM1`, `con.js` (ENOENT on Win11), trailing dot/space (`index.html.`, `index.html%20`, `index.html.%20.`; ENOENT, because realpath's lstat does not trim), ` .. ` (ENOENT), `::$DATA`, `C:`, `%3A` (blocked by `:`), `%2e%2e`, `%5c` (blocked). Case variants such as `/INDEX.HTML` serve the same in-folder file, which is acceptable. A junction pointing out of the folder gets 404 (pinned by the test). TOCTOU (a swap between the check and `readFile`) and hard links need a local attacker who can write in `dist`, so they are out of scope.
5. Content types, `content-length`, nosniff, no-cache, async `readFile`, read failure 404 (:150-213). Met, and the map matches the brief exactly.
6. Static errors go through `sendJson`. Met.
7. `port ?? 5174` kept. `once("error", reject)` around listen and removed on success; on failure `current?.dispose()` and rethrow (:376-388). Met. The un-listened server holds no handle.

serve.ts: `--port` accepts only `/^\d+$/` up to 65535 (ASCII `\d`, no `u` flag). A missing value, `-1`, `0x10` or `--no-ui` as the value gives the exact stderr message, exit code 1 and no stack, before `createHub`. `--no-ui` and the `dist/index.html` existence check are in place. `uiPath` resolves `../../ui/dist` from `src/serve.ts`, i.e. `packages/ui/dist`, which is correct. The positional root skips the value after `--port`. The status line format is unchanged, plus the extra line only when `uiDir` is set. Comments cover the raw URL and the `:` rule. Met. An EADDRINUSE at startup reaches the QR-F3 catch and prints one line.

## Mutation evidence
I ran no vitest, per the instructions. My reasoning on what each test pins:
- `startsWith(".")` is pinned by `/.env`.
- The `:` rule is pinned by `/index.html::$DATA` (on NTFS, removing it gives 200 with the index body).
- The realpath containment is pinned by the junction test.
- 405 is pinned by POST, PUT and DELETE on `/`.
- 400 is pinned by `/%` and `/%E0%A4%A`.
- `/api` precedence is pinned by the `api/hub` file test.
- The listen rejection is pinned by the EADDRINUSE test.
- `uiDir` existence is pinned by the missing-dir test.
- Not pinned: see M1.

Scratch reproduction script: `C:\Users\Serve\AppData\Local\Temp\claude\1d06becceb9d826f\824c33f0-60bc-4c5e-b5b4-7ad15cb52b1a\scratchpad\r1a\t.mjs`.
