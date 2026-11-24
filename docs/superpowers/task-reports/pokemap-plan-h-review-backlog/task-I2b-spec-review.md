# Task I2b spec-compliance review (Opus)

Verdict: **PASS**. 0 Critical, 0 Important, 3 Minor.

Range `origin/master..HEAD` (fae8afd move, fd86ee7 docs, 94840fe comment re-points). I read the diff, the whole new `gbaEditRoutes.ts` wrapper, `gbaRouteContext.ts`, the new `index.ts` handler (lines 76-393), and `origin/master:packages/server/src/index.ts`. I ran no vitest, typecheck or build, as the brief asked. The typecheck PASS on fae8afd is the implementer's claim (fd86ee7), and I did not re-run it.

## 1. Moved text vs origin/master (my own diff)

I extracted old `index.ts:389-403` (`createEventMatch`), a blank line, and old `index.ts:417-1040` (paint/begin through the Indicator update route, ending just before `return send(404 ...)`). I compared them with `gbaEditRoutes.ts:60-699` using plain `diff`, with no whitespace stripping. Both sides are 640 lines. The only differences:

- `:66` `disposed` -> `ctx.disposed` (event/create readBody callback). Expected.
- `:328` `allMapsCache = undefined` -> `ctx.allMapsCache = undefined` (commit route). Expected.
- Two comment edits in the discard route (old diff lines 192-193 and 209, `gbaEditRoutes.ts` near the discard route). These come from 94840fe, which re-points `editSessions.ts`'s `close()` to `sessionStore.ts`. The I2a spec review explicitly asked for this re-point. I checked that the new text is accurate. `sessionStore.ts:8-10` says dropping an open session "is always safe", `:28` uses the phrase "always safe to drop", and `close` is `sessions.delete(mapName)` (`:52`). The edits are allowed, not drift.

The indentation is identical: the IIFE body sits at the same 6-space depth as the old `try {` body. `validateStampAndOrigin` (old `:85-104`) moved byte-identical to `gbaEditRoutes.ts:23-42`. No other file uses it. The GBC file only mentions it in a comment.

**B3/B4 preserved.** The moved text is byte-identical, so the following are all unchanged: `eventSlot(...).original` index-space use in the move route (`:372-379`), event/delete (`:439-448`, including `dropPendingInsert`/`dropOwnedScripts` on `slot.insert.owns`), and the Indicator update (`:666-671`). The same holds for `owns` stamping on sign add (`:589`), the rehash of `owns.appends` (`:608-609`) and Indicator add (`:686`). `/event/create`'s own stamping is in `addEventRoutes.ts`, which this change does not touch.

## 2. Route order and mount position

- **Old chain:** editGate -> blockEdits -> createEventMatch -> gbaReadRoute -> sidecarRoute -> [paint ... Indicator update] -> 404.
- **New chain:** editGate -> blockEdits -> gbaReadRoute -> sidecarRoute -> gbaEditRoute (createEventMatch first, then the rest in their old order) -> 404 (`index.ts:350-386`).

The only reordering is `createEventMatch` (POST `/api/edit/<seg>/event/create`), which now runs after gbaReadRoute and sidecarRoute. I checked that this is safe:

- **gbaReadRoutes.ts.** Every matcher is anchored on `/api/project|groups|defects|map|render|metatile|species|encounters|warps|coverage|where|world` (`:41-353`). The `handleOptions` block, and its `syncOverlay()` side effect, runs only for `req.method === "GET"` (`:36-40`). A POST to event/create gets no side effect and no match there.
- **sidecarRoutes.ts.** It matches only `/api/world/...` and `/api/dungeons...` (`:105-204`).
- **blockEdits.** It matches only `/block`, `/block/preview` and `/block/(check|apply)` under `/api/edit/<seg>/`. It ran before createEventMatch in the old chain too.
- **editGate.** It is unchanged and still runs first.

Every path reaches the same handler as before.

The `fellThrough` IIFE keeps the semantics:
- Every `return` in the moved text leaves before `fellThrough = true` (`:700`), so the wrapper returns true and `handle` returns.
- A matched route that does not return (none found) falls through to the 404, exactly as before.
- A synchronous throw propagates to `handle`'s `try/catch` (`index.ts:387`), as before.

**Construction order.** `gbaEditRoutes(...)` runs at `index.ts:312`. Everything it destructures is declared earlier:
- `EVENT_KINDS` at `:178`
- `signFailure`/`indicatorFailure` at `:195-208`
- `signPlan` and `indicatorParagraphs` (function declarations) at `:209-231`
- `sendSession` at `:246`
- `handleEventOp` at `:292`
- `let disposed` at `:308`

There is no TDZ risk, because the destructure in `gbaEditRoutes.ts:51` reads neither `disposed` nor `allMapsCache`.

## 3. Stale-closure check

The destructured members are `project, symbols, addEvents, editSessions, syncOverlay, overlayStamp, editEntryFor, pngCache, signFailure, indicatorFailure, indicatorParagraphs, signPlan, sendSession, handleEventOp, getAllMapsForWarpScan, EVENT_KINDS`. Each is a `const` or a function declaration that is never reassigned in `index.ts`, so none of them can go stale.

- **The two `let`s.** The only reassigned `let`s that the moved text reads are `disposed` (reassigned in `dispose()`, `index.ts:443`) and `allMapsCache` (`:175`). Both go through live accessors (`index.ts:315-316`).
  - The setter writes `index.ts`'s own `allMapsCache`, which `getAllMapsForWarpScan` (`:176`) refills, so the commit's reset is seen by the next delete. The `allMapsCache` reset is guarded by `test/mapCacheAfterSave.test.ts:129`. Line `:56` primes the cache before the commit. A setter that wrote a copied property instead would leave the cache stale, and line `:129`'s `toContainEqual` would fail. This is reasoned from the test, not run.
- **Other `let`s.** The other `let`s (`worldCache`, `encountersCache`, `coverageCache`, `speciesCache`) are not referenced in `gbaEditRoutes.ts`. Neither are `overlayState`, `hooks`, `root` or `blockEdits`; I grepped for them. The only `root` reads are through `project.paths.root`.
- **`disposed` re-check after readBody.** It exists only in event/create (`:66`), exactly as in the old code. The other async routes never had one, which is the pre-existing ponytail at `index.ts:324-333`, so nothing was lost or added.

## 4. Tests and behaviour

`git diff --name-only origin/master..HEAD` shows no file under any `test/` directory: no test was edited. Apart from the two accessor rewrites, which have the same semantics, the code changes are import moves, the `GbaEditRouteContext` type and the mount. I found no behaviour change.

## 5. Dead code and imports in index.ts

For each imported name, I checked that it occurs in non-import, non-`//` code. Nothing is unused in `index.ts` or `gbaEditRoutes.ts`. `readBody`, `BodyTooLarge` and `eventFailure` appear in `index.ts` only in comments, and their imports were correctly removed. `validateStampAndOrigin` is gone from `index.ts`. No pass-through wrappers were added beyond the IIFE, which is the same pattern I1 used.

## Findings

**Minor 1: the plan's "route table" shape and the "index.ts holds the loop" acceptance are not met.**
- **Where:** `plan-h-hardening.md:154` (I2b row: "as a route table"), trap 23 (`:58`: "copies that shape", i.e. the GBC table) and Task I acceptance (`:420`: "`index.ts` holds context construction and the loop").
- **What was built:** `gbaEditRoutes.ts:52-702` is the verbatim if-chain inside a `fellThrough` IIFE, and `index.ts:350-386` is still an if-chain with the editGate and the blockEdits PNG adapter.
- **Why it is not a FAIL here:** the brief for this pass demands a pure move with order and comments unchanged, which a table rewrite would violate, and I1 set this precedent and passed.
- **Failure scenario:** none at runtime. The risk is that the plan claims a shape the code does not have, and a later plan (3 / 4c / 2b, which edit "the route module Plan H Task I leaves") assumes a table.
- **Recommendation:** record the ruling, a verbatim-IIFE now with the table deferred, in the plan or RESUME.

**Minor 2: the impl notes are stale against the final tree.**
- `task-I2b-impl-notes.md:39` says "The two comments naming editSessions.ts's close() are untouched", but 94840fe changed them.
- `:65` (deviation 3) says the `// Plan H I1:` comment above the read mount was left stale, but fae8afd rewrote it (`index.ts:370-371`, now accurate).
- This is documentation only.

**Minor 3: a comment in index.ts now points at code in another file, and the `disposed` getter has no mutation guard.**
- `index.ts:325` says "A POST route below awaits `readBody(req)`", but those routes now live in `gbaEditRoutes.ts`. This is wording only.
- Separately, I found no test that drives `POST /event/create` through a disposed handler mid-`readBody`. Replacing `get disposed() { return disposed; }` with a plain `disposed: false` snapshot at `index.ts:315` would likely go uncaught. The `hub.test.ts:515-517` and `:544` 503 checks hit the synchronous guard at `index.ts:320`, not `:66`.
- The getter is correct by inspection, and this is a pre-existing coverage gap, not a regression.

## Mutation evidence

I ran no mutations, because tests are not allowed under the gate lock. I reasoned through the following instead:

- **`allMapsCache` setter.** It is guarded by `mapCacheAfterSave.test.ts:129`, as described in section 3.
- **Route-order mutations**, such as mounting `gbaEditRoute` before `blockEdits`. The paths are disjoint, so the tests would not fail, and no wrong answer is possible either.
- **`disposed` getter.** No guard was found (Minor 3).
