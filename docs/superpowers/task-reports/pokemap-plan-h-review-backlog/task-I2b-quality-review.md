# Task I2b quality review (code quality and correctness only)

Range: `origin/master..HEAD` (fae8afd, fd86ee7, 94840fe), `packages/server/src`.
Reviewer: Claude Opus. No vitest, typecheck or build was run, per the brief (a gate holds the machine lock). Every finding below comes from reading the code.

## Verdict: PASS

No Critical or Important findings. Five Minor findings: stale comments and one gap in test coverage.

## What I verified independently

**Verbatim move.** I took the lines removed from index.ts, stripped indentation, and diffed them against gbaEditRoutes.ts:60-699. The only differences outside the import block and the hoisted `validateStampAndOrigin` are these:
- index.ts `if (disposed)` became gbaEditRoutes.ts:66 `if (ctx.disposed)`.
- `allMapsCache = undefined` became gbaEditRoutes.ts:328 `ctx.allMapsCache = undefined`.
- The two `close()` comments were re-pointed (gbaEditRoutes.ts:251-252, 268).
- One I1 comment line in index.ts was reworded.

No route logic changed.

**(1) The `fellThrough` wrapper.** I walked every matched branch (19 routes). Each one ends on a `return` on every path:
- `return send(...)`
- `return void readBody(...)` (createEvent)
- `return readBody(...)` (paint/apply, commit, the event move/add/delete routes, sign put/resolve, Indicator add/update)
- `return sendSession(...)`
- `try { return ... } catch { return ... }` (plan, Indicator suggest, Indicator at, sign at)

The wrapper ignores the return value. It only checks whether line 700 `fellThrough = true` was reached, so the async routes with no `void` behave the same as the `return void` route.
- No matched branch falls off its `if` body, so no matched path can reach line 700 and also trigger the final 404. That rules out a double response.
- No unmatched path skips line 700, so nothing is reported handled without a response. That rules out a hung request.
- A synchronous throw inside the IIFE skips both line 700 and line 702 and unwinds into index.ts:387 (`brokenPathBody` gives 409, anything else 500). Examples: `refuseBrokenLayout` at :468, `editEntryFor` throwing in paint/begin, paint/end or undo, and `entry.stack.undo`. This matches the old chain.
- Async rejections are handled by each route's own `.catch`, which is unchanged.
- A throw inside a `.catch` handler (for example `send` after headers were sent) was already an unhandled rejection in the old code, so the move did not change it.

**Route order.** The only route whose position changed is POST `/api/edit/<name>/event/create`. It used to run before `gbaReadRoute` and `sidecarRoute`; now it runs after both (index.ts:372, 379, 384). I checked that no route in either module can match this path and method:
- Every read-route regex is anchored to `/api/{project,groups,defects,map,render,metatile,species,encounters,warps,coverage,where,world}` (gbaReadRoutes.ts:41-353).
- The read routes' `syncOverlay()` / `handleOptions` block only runs for GET (gbaReadRoutes.ts:36).
- The sidecar paths are `/api/world/...` and `/api/dungeons...` (sidecarRoutes.ts:105-203).

The D25 `editGate` and `blockEdits` still run first. All other edit routes already sat after the read and sidecar mounts, so their order did not change.

**(2) and (3) Accessors and closure staleness.** `ctx` is a single object literal built once at index.ts:312-317. `get disposed()` closes over the `let disposed` and is read live through `ctx.disposed` inside the `readBody().then` continuation (gbaEditRoutes.ts:66), so a `dispose()` that lands mid-body is seen. The setter on `allMapsCache` writes the `let` in index.ts. `getAllMapsForWarpScan` (index.ts:176) reads that same `let` through `??=`, so the commit reset and the warp-delete refill stay consistent.

Every other value in the destructuring at gbaEditRoutes.ts:51 is a `const` or a function declaration in `createProjectHandler`. I checked every declaration from index.ts:79 to 308, and none of them is reassigned, so the destructured copies cannot go stale. `dispose()` only reassigns `disposed`.

**(4) Types.** `GbaEditRouteContext` (gbaRouteContext.ts:50-71) has no `any`. The hand-written `signPlan`, `sendSession` and `handleEventOp` signatures are checked structurally where index.ts:312 passes them in. Typecheck passing on the final tree was recorded in fd86ee7; I did not re-run it.

**Unused imports.** I counted the uses of every import in gbaEditRoutes.ts and of every import index.ts still has after the trim. Each is used at least once. The removed imports (`BodyTooLarge`, `readBody`, `eventFailure`, `paintCells`, ...) have no remaining uses in index.ts.

## Findings

### M1 (Minor): the wrapper comment describes forms that do not occur in this file, and `res` is unused
At gbaEditRoutes.ts:53-57, the comment was copied from gbaReadRoutes.ts. It says the moved text answers with `return res.end(...)` and bare `return`, but neither form appears anywhere in gbaEditRoutes.ts. The `res` parameter (line 52) is never used either.
- **Failure scenario:** a reader trusts the comment and assumes some edit route writes `res` directly (for example a PNG). They then think a later refactor that swaps `send` for another sender would be incomplete, or that removing `res` is unsafe.
- **Fix:** trim the comment to `return send(...)` / `return readBody(...)` / `return sendSession(...)`. Either keep `res` with a note that the signature matches the read routes, or rename it `_res`.

### M2 (Minor): index.ts comments still point "below" at code that moved to gbaEditRoutes.ts
- **index.ts:166:** "Same staleness caveat as the commit route's own comment below". The commit route is now in gbaEditRoutes.ts:285-344. The comment body at :166-174 was also already wrong before I2b: since Task G, the commit route does reset this cache (gbaEditRoutes.ts:328), so a later delete does not use pre-commit warps.
- **index.ts:243-244:** "the event-op routes below".
- **index.ts:284:** "all three event routes below".
- **index.ts:325 and :338:** "A POST route below awaits readBody", "every readBody rejection path below". These now live in gbaEditRoutes.ts.

**Failure scenario:** a maintainer reads :166-174, concludes that `allMapsCache` is never invalidated after a commit, and either adds a redundant invalidation or removes the reset at gbaEditRoutes.ts:328 as "not part of the design".

**Fix:** point these comments at gbaEditRoutes.ts, and correct the :166 paragraph to say the commit route resets the cache.

### M3 (Minor): no test would catch a stale `disposed` read in the moved createEvent continuation
The only "project closed" assertion is hub.test.ts:517 and :544. Both send a fresh GET `/api/project` to an already-disposed handler, which hits the synchronous guard at index.ts:320. Nothing drives POST `/api/edit/<name>/event/create` with `dispose()` landing between the headers and the end of the body.
- **Failure scenario:** a future edit destructures `disposed` into the `const { ... } = ctx` at gbaEditRoutes.ts:51. That is exactly the mistake the accessor exists to prevent. The copy is then always `false`, so after a hub swap mid-request, `addEvents.create` writes into a torn-down store and answers 200. The suite stays green.

The same applies to the `get disposed()` accessor being turned into a plain `disposed: disposed` property at index.ts:315.

The `allMapsCache` setter, by contrast, is guarded by mapCacheAfterSave.test.ts. Its beforeAll primes the cache at :56 before the commit, and its test at :129 reads the scan afterwards. That test is corpus-gated (`skipIf(!hasProject)`).

**Fix:** optionally add a test that opens a request, sends headers plus a partial body, calls `dispose()`, finishes the body, and expects 503. Otherwise record this as an accepted gap. It matches the existing "ponytail" F3 note at index.ts:324-333.

### M4 (Minor): the I1 comment and the new I2b comment repeat the same disjointness argument
- **index.ts:368-371:** "The option-lookup block used to run after `createEventMatch` (now in gbaEditRoutes.ts)".
- **index.ts:381-383:** makes the same disjointness argument again.

Both are accurate. Together they still leave the reader to work out that the order is now back to how it was before I1 (options lookup first, createEvent later).

**Fix:** keep one short note, for example at :381: "createEvent now runs after the read and sidecar routes; disjoint paths, see ...".

### M5 (Minor): `GbaEditRouteContext` duplicates types that could be derived
- **gbaRouteContext.ts:37-42, 51-71:** `SignPlanBody`, the `allMapsCache` element type (written twice, here and at index.ts:175), and the `signFailure`/`indicatorFailure` return shapes are restated by hand instead of derived from index.ts.

Structural checking at the call site catches a mismatch in what index.ts provides. But a new field added to `signPlan(...).body` or to a refusal would not show up in the interface's type. Runtime is unaffected, because the whole object is still sent.

The doc comment at :46-48 says "Every member is a `const`". `signPlan`, `indicatorParagraphs` and `handleEventOp` are function declarations. That is harmless, but "never reassigned" is the accurate claim.

**Fix:** none needed. This is noted for whoever next touches the context types.

## Mutation evidence
The implementer's report was not examined for mutations, and the brief forbids running vitest, so I did not execute any mutations. From reading the tests, these are the guards for I2b's two non-verbatim edits:
- **`ctx.allMapsCache = undefined` (gbaEditRoutes.ts:328):** if it became a no-op, mapCacheAfterSave.test.ts:129 would fail, because `warpRenumberWarnings` would miss the warp added and saved at :62. If the setter were dropped from index.ts:316, assigning to a getter-only property throws a TypeError in strict ESM. The commit would then answer 500 and beforeAll:66 would fail.
- **`ctx.disposed` (gbaEditRoutes.ts:66):** no test guards this; see M3.
- **The `fellThrough` wrapper:** if line 700 were removed, every non-edit path would return true and no 404 would be sent (requests would hang). If line 702 were negated, every edit route would get a second response from the 404. Any route test catches either mutation, for example paintRoutes/eventRoutes and every unknown-path 404 test.
