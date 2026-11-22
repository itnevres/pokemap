# Plan H Task E (E1+E2) -- quality / correctness review

Range: `6de71e3..a477e87` (worktree `plan-h-server-e2`). Reviewer read the full diff and the changed code; did not run vitest, typecheck or builds (per the brief). Instead it ran three standalone Node 24 probes that import the real `packages/server/src/http.ts` (scratchpad `probe1.mjs`, `probe2.mjs`, `probe3.mjs`). Their results are quoted below.

The plan-h-server-e2 worktree was write-protected from the reviewer session, so this report lives at the same relative path in worktree `overnight-standby-5-8438fc`.

**Verdict: CHANGES.** The declared-length 413 does not reach any client that actually sends its body (I1). The tests cannot see this because every 413 test sends zero body bytes. The route-level `BodyTooLarge` -> 413 branches (about 20) have no test (I2). One new hub test runs close to the 5 s vitest timeout (I3).

## Important

### I1. `refuseOversize` turns the 413 into ECONNRESET for every real uploader
`packages/server/src/http.ts:83-90`, and the index.ts comment at `index.ts:338-342` that says "a chunked oversize body gets the same answer"

`res.setHeader("connection","close")` plus `res.once("finish", () => req.destroy())` closes the socket while the client is still uploading. The unread bytes in the kernel receive buffer turn the close into a TCP RST, and the client throws away the 413 it has already received.

Probe2 used `fetch(url, { method: "POST", body: new Uint8Array(17 MiB) })` (what the UI and any normal client do), 5 tries per variant:

| server variant | 17 MiB | 64 MiB |
|---|---|---|
| current `refuseOversize` | `ECONNRESET` x5 | `ECONNRESET` x5 |
| `connection: close` header only, no `req.destroy` | `ECONNRESET` x5 | `ECONNRESET` x5 |
| plain `sendJson(413)`, keep-alive | `413` x5 | `413` x5 |

With `http.request` writing 4 MiB of a declared 16 MiB+1 body (probe1), the result was also `ECONNRESET`.

So the S3 acceptance ("answers 413 before any route runs") only holds when the client declares a length and then sends nothing. That is exactly what `http.test.ts`, `hub.test.ts:291`, `gbcRoutes.test.ts` (E1b) and `world.test.ts:290` do. A UI `fetch` that posts an oversize body gets a generic "fetch failed" instead of `{ error: "request body too large" }`.

Fix options:
- (a) Drop the forced close and let Node drain or discard the body. Memory stays bounded and the streaming cap is unaffected; the cost is upload bandwidth.
- (b) Keep the close, but first drain until a byte or time budget runs out (for example `req.resume()`, then destroy on a timer or after N MiB).
- (c) Accept the reset and change the doc comments and the acceptance text to say so.

Whichever is chosen, add a test that writes real body bytes. The doc comment "close only once the response has been sent" is also wrong: `finish` means "handed to the OS", not "received by the peer".

### I2. No test reaches any route-level `BodyTooLarge` -> 413 branch
The new `if (e instanceof BodyTooLarge) return send(413, ...)` lines are in:
- index.ts: 13 readBody chains
- gbcRoutes.ts: 5
- gbcEditRoutes.ts:528
- blockEditRoutes.ts:146
- hub.ts:240

The only chunked-oversize test is `http.test.ts`, which calls `readBody` directly with `max = 8` against a bare server. Nothing sends a chunked body over 16 MiB to a real route. The `MAX_BODY_BYTES` mention in `world.test.ts` is in a test title only.

Surviving mutation: delete the `BodyTooLarge` line in the `/api/world/placement` catch (`index.ts`, the `.catch` after the placement `.then`). A chunked 17 MiB POST then answers `500 {"error":"request body too large"}` and logs a stack trace, and every test still passes. The same holds for each of the other branches.

These branches are the only 413 path a client can actually see today (see I1; the streaming path keeps the connection alive and probe1 delivered its 413). Add one route-level chunked test for each handler family (GBA index, GBC gbcRoutes, gbcEditRoutes, blockEditRoutes, hub). Each test needs a cap override or a streamed 16 MiB+1 body, and should assert status 413 plus no sidecar write.

### I3. `hub.test.ts:318` (403 with oversize content-length) holds the server open for about 4 s
The 403 path does not read the body and does not destroy the request. The server keeps waiting for 16 MiB of body that never arrives. `hub.close()` is just `http.close()` (`hub.ts:282`), and `http.close()` closes idle connections only, so it waits for the client agent's keep-alive socket timeout.

Probe1 reproduced the same shape (403, no destroy): the response took 7 ms and `server.close()` took 4009 ms. The test therefore uses about 4 s of vitest's default 5 s `testTimeout` (the root `vitest.config.ts` sets none). It is a flake candidate under serial runs on a loaded machine.

Fix: give the request `agent: false` (or `Connection: close`) in `rawRequest` for this case, or call `http.closeAllConnections()` in `hub.close`.

## Minor

- **M1. Weak or vacuous side-effect assertions in the oversize tests.** `hub.test.ts:291` ("without changing the current project"), the `gbcRoutes.test.ts` E1b sidecar test and `world.test.ts:290` ("without creating or changing world.json") send no body. Even with `refuseOversize` removed, nothing could be written: the route would wait forever for the body. The mutation "remove `refuseOversize` from index.ts" is caught only by a hang, after 300 s because of the world test's timeout, not by an assertion.

  **Weakest test: `hub.test.ts:291`.** `current` is `null` before and after whatever happens, so the side-effect half can never fail. The mutation "drop `res.once("finish", () => req.destroy())`" survives every test.

  Suggested fix: add a per-request timeout (for example 2 s) to `oversizePost` so the mutation fails quickly, and assert the `connection: close` header (or whatever I1 settles on).

- **M2. `Array.isArray(parsed)` in the placement guard has no test that would fail without it** (`index.ts`, placement guard, and the GBC twin). The `"[]"` case still answers 400 without it because `placement.map` is `undefined`. It is harmless as defence in depth, but the test case `"[]"` does not pin it.

- **M3. Wrong rationale comment** at `index.ts:765`: "`manualPlacements["__proto__"] = ...` mutates Object.prototype". Verified in Node: it replaces only `manualPlacements`'s own `[[Prototype]]`. `({}).x` stays `undefined`, and `JSON.stringify` drops it. The real harm is a silent 200 `{ok:true}` that persists nothing. The known-map check is still right, but the comment overstates the risk.

  The GBC twin (`gbcRoutes.ts`, `/api/world/placement`, around line 568) has no known-map check, so on GBC `__proto__` still answers 200 and persists nothing, and unknown names are persisted. This is a parity gap; flag it for the backlog if it is out of E scope.

- **M4. Stale doc lines in `http.ts:56-61` (the `decodeSegment` doc).** "Every `:name`-style route below calls this": no routes are below it in `http.ts`. "The GBA handler in index.ts moves to this in Plan H task E2": E2 is now done. The readBody doc ("`/api/world/placement` is the first POST route... Exported (Plan 6c A1) so hub.ts...") is history copied in from `index.ts`. It is accurate, but it now describes another file's past.

- **M5. Error-body regressions vs master (status changes are improvements).**
  - GBA `POST /api/edit/:name/event/create` with a malformed escape changed from `400 {error:"malformed map name", code:"BAD_OPTION"}` to `400 {error:"malformed percent-escape in path"}` with no `code` (around `index.ts:369`). No UI or test consumer of that `code` exists for the malformed case; the `BAD_OPTION` tests in `addEventRoutes.test.ts` are about form refusals. It is still a contract drift.
  - GBA and GBC now word the same refusal differently: GBA says "malformed percent-escape in path", GBC says "malformed map name <raw>". Unifying them is optional.
  - `/api/species/:s/icon.png` changed from 404 to 400 for a decoded name outside `^\w+$`. That is fine, because the UI only sends `encodeURIComponent(SPECIES_*)` (`ui/src/encounters/summary.ts:130`).

- **M6. "decodeSegment at every site" is not literally true.** `addEventRoutes.ts:219` still calls `decodeURIComponent`. It is inside a try, so the result is a 400 via `eventFailure`, not a 500. That is acceptable, but the commit message overclaims.

- **M7. The streaming-cap 413 does not close the connection.** After `BodyTooLarge` the stream stays in flowing mode with no listeners, so Node reads and discards the rest of the upload on a keep-alive connection. Memory is fine because `chunks` is cleared and the closures are released. An endless chunked upload is bounded only by Node's default `requestTimeout` (300 s). This is acceptable for a localhost tool; consider it when resolving I1.

## Checked and found OK

- **readBody settles exactly once.** `cleanup()` removes its own three listeners before reject or resolve. A late `end` or `error` cannot reach the promise, and a promise settles only once anyway. `chunks.length = 0` frees the buffers, and the chunk that crosses the cap is never pushed.
- **No crash when `IncomingMessage` errors after cleanup.** Node emits `error` only when a listener is attached (`_http_incoming` onError).
- **A client abort mid-body rejects.** Probe3 got `rejected:aborted`; it does not hang.
- **Cap boundary is correct:** `bytes > max`, so exactly `max` bytes pass. The `http.test.ts` 8/9-byte and `€€€` cases pin this, and they catch the `>=` mutation and byte-versus-char confusion.
- **`declaresOversizeBody`:** NaN, negative, missing and multi-value content-length either fall through to the streaming cap or are rejected by llhttp before the handler runs (non-digit, conflicting duplicates, CL+TE). `Number(...) > MAX` never throws.
- **`req.destroy()` on an already-closed socket is idempotent and does not throw.**
- **Ordering is correct:** hub 403 (cross-origin) comes before 413 (pinned by `hub.test.ts:318`, which fails if swapped). Project-handler `disposed` 503 comes before 413. Hub `refuseOversize` comes before forwarding, so the project handler's second check is unreachable under the hub but kept for standalone `createServer`.
- **Every readBody call site has a `.catch`:**
  - index.ts: 13 call sites, 13 catches with a `BodyTooLarge` branch
  - gbcRoutes: 5 and 5
  - gbcEditRoutes: the `run()` catch
  - blockEditRoutes: `.catch(fail)`, and `fail` has the branch
  - hub: 1 and 1

  No rejection reaches the outer synchronous try/catch. Every `decodeSegment` `undefined` returns a 400 before any route work.
- **No test writes to subject repos.** The world tests use the `mkdtemp` fixture and restore the sidecar. The GBC E1b test only reads `GBC_SUBJECT_ROOT/.pokemap/world.json`.
- **The `isCrossOriginRequest` move is verbatim** with its full rationale comment, and the `http.test.ts` table adds `null` origin, `%` and `[` edge cases. The `decodeMapName` rationale moved into `decodeSegment` and lost only the now-false "index.ts keeps 500" sentence.
- **`world.test.ts` placement test rewrite (synthetic name -> Route101 with exact `{...auto, x, y, manual}`) is sound.** The old placeholder-branch coverage lives in `core/test/world/sidecar.test.ts`.
