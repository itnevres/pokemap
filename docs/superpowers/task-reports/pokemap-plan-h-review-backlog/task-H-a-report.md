# Task H-a report: `jsonBody` in `packages/server/src/http.ts`

Tier: Medium. Reason: new shared helper with a clear spec; any wrong answer fails a test automatically; no callers changed (H-b moves routes).

Files: `packages/server/src/http.ts` (+`jsonBody<T>(req, send, guard, shapeText, handler): Promise<void>`), `packages/server/test/http.test.ts` (+7 tests in `describe("jsonBody")`), `docs/superpowers/plans/plan-h-hardening.md` (Task H: requirement that the GBC `POST /api/world/placement` route gets the known-map check E2 added to GBA).

Behaviour (matches the hand-written copies): malformed JSON -> 400 `invalid JSON body: <msg>`; guard fails -> 400 `expected <shapeText>, got <raw body>`; `BodyTooLarge` -> 413 `request body too large`; handler throw (sync or async) -> console.error + 500 with message; empty body -> 400 (invalid JSON). No content-type check (the plan row asks for none; no route made one). The route that treats an empty body as `{}` (edit-session commit) keeps its own code.

Tests: valid, malformed, shape mismatch, empty, content-type ignored, 413 over the cap (chunked, cap+1 bytes), handler throw 500.

Verify (through the lock): typecheck clean; `http.test.ts` 31 passed (24 existing + 7 new).

Mutation checks: four mutants, each turned the `jsonBody` tests red (`-t jsonBody`): (1) malformed JSON no longer answers 400 (invalid-JSON test fails); (2) the shape guard removed (shape-mismatch test fails); (3) the `BodyTooLarge` -> 413 branch removed (413 test fails: 1 failed / 6 passed); (4) `return handler(parsed)` changed to a fire-and-forget call so a rejecting handler is lost (500 test fails plus an unhandled rejection). Baseline with `http.ts` restored: `http.test.ts` 31 passed. Script: conductor scratchpad `mut-ha.py`, run under the test lock.
