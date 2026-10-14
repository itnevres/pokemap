# Plan 8 final whole-branch review

Reviewer: Opus, read-only. Range `3f9f8ce..58e7287` (51 commits). Only `packages/ui` changed. There are no server, core, CLI or dependency changes, which meets the global constraints.

Method: I read all 8 `src/shared/*` modules in full; both edit-session family hooks; `GbcApp.leave` and `App.leave`/`select`; the visit reset in `useMapEditing` and in `GbcMapEditing`; the stroke-chain consumers in both canvases (registration and start/queue/finish sites); `useMapLayout`; the GBC `paint/end` route; and the 3 discard-ordering tests. I also checked the pre-Task-5 GBA `useEditSession` at `d37959e` for behaviour parity.

Other checks:
- A script scanned every new or changed test file for `it(` blocks with no `expect`/`assert`. It found none.
- Deleted test lines: only the R3-authorised `resetForMapChange` lines.
- I did not run any suites. The gate result (2,703 / 0) is accepted as given.

## Strengths

- **`useStrokeChain`.** It is a faithful extraction of B1.
  - There is one tail promise.
  - Visit retirement happens in a layout-effect cleanup, which ends a begun stroke on its captured session.
  - `report` cannot throw, so the I1/M3 hole is closed.
  - It survives StrictMode: the memo has empty deps and refs are shared, so a double mount/cleanup only re-mints the visit.
- **`useEditSessionCore`.**
  - The view is derived from map + seed identity at render, so no reset-effect window exists.
  - Tickets order replies.
  - The R4 `forMap` guard on discard's `setStored(null)` is correct and strictly narrower than before.
  - GBA's old reset effect cleared on `[mapName, initialBlocks, initialMap]`, and the derived `live` check reproduces exactly that set of triggers. So GBA parity holds, including the documented load-window clobber (see Minor 2).
- **`useVisit`.**
  - The render-phase `setVisit` is the sanctioned "adjust state during render" pattern.
  - Both consumers call it in the same component as the state they reset, so React keeps those render-phase updates.
  - `isCurrent` compares committed object identity, so A→B→A retires correctly, and StrictMode's cleanup/re-run restores it.
- **`useContextEditing`.**
  - M5 works: the exit decision waits for `strokeSettled()` and is then taken on the next render's `isDirty`, not on the old closure.
  - A stale request is dropped by `exitRequested` identity.
  - Tile versions bump only for the map that was committed.
- **`useWorldContext`.**
  - The snap-once guard is a ref, so StrictMode is safe.
  - The capture-phase Escape listener is attached only while in context.
  - M6 is fixed: step goes from the nearest level strictly beyond.
- **Tests.**
  - 2,419 test lines were added and only the authorised R3 lines were removed.
  - Every named fix has witnesses in both families or a ruled exception.
  - Mutation evidence exists for each task.
- **DESIGN.md "Shared modules (Plan 8)".** It matches the code: 8 modules plus `useGuardedFetch`, and each row's consumers are correct. The list of what stays per-family matches the Task 7 stop-rule finding.

## Flagged ruling: T5 GBC-App ordering failures (ledger line 112)

**The ruling holds. This is test timing only, not an ordering regression.**

The product cannot reorder, for these reasons:
- `GbcApp.leave` (`gbc/GbcApp.tsx:119-123`) is `session.discard().then(go)`.
- Core `discard` (`shared/useEditSessionCore.ts:64-70`) awaits the discard response before it returns.
- `go` only calls `setSelected`.
- The new map's `GET /api/map/<name>` is issued by `useGbcMap(selected)` from a passive effect. That effect can only run after the render that follows `setSelected`.

So the GET is causally after the discard POST resolves. A reversed order would show up as a GET index *smaller* than the discard index but ≥ 0. The observed tell is `expected N to be less than -1`, which means the GET was not issued yet.

What causes the race:
- All 3 tests (`GbcAppWorldGuard.test.tsx:100`, `:116`; `GbcAppEditing.test.tsx:92`) wait for `.app__status` to read the new name.
- `app__status` renders `selected` (`GbcApp.tsx:270`). It flips in the commit of the `setSelected` render.
- That update comes from a promise continuation outside `act`. React therefore commits it in a scheduler task and flushes passive effects (the fetch) in a later task.
- `waitFor`'s MutationObserver fires on the commit, before the effect runs.
- Under load the gap between those two tasks widens.

Task 5 plausibly made this more frequent by adding render work (the seed `useMemo` and the core's derivations). The mechanism itself is independent of Task 5. The latest gate passed with 0 failures, but a test that fails 3 of 4 times under load is gate debt. See Important 1.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

1. **Three discard-ordering tests race the GET they compare against.**
   - Files: `packages/ui/test/gbc/GbcAppWorldGuard.test.tsx:96-100`, `:114-116`; `packages/ui/test/gbc/GbcAppEditing.test.tsx:89-92`.
   - Problem: each test asserts `discardAt < calls.indexOf("GET /api/map/OlivinePort")` right after waiting only for `selected` to render. The GET is issued one scheduler task later, so the right-hand side can be -1.
   - Why it matters: the gate becomes load-sensitive. The next full run under load fails for no product reason, and a "known flake" habit hides a real ordering regression later.
   - Fix (test-only, about 1 line per test): before comparing, `await waitFor(() => expect(calls).toContain("GET /api/map/OlivinePort"))`, then keep the `<` assertion. It still kills a reversed order.

### Minor (Nice to Have)

1. **A discard can be overtaken by queued stroke links that it does not wait for.** Pre-existing, not a Plan 8 regression.
   - File: `packages/ui/src/gbc/GbcApp.tsx:122`; also the GBA Toolbar discard.
   - Problem: `leave` posts `/discard` immediately. A stroke whose `apply`/`end` links are still queued (slow network, user clicks the tree right after mouseup) keeps running, because the visit only retires after `go()`.
   - Effect: an `apply` that lands after the discard re-opens a dirty server session (`store.open`) that the client believes is discarded.
   - Why mention it now: Plan 8 added the exact tool for this. `strokeSettled().then(() => session.discard())` in `leave` would close it.
   - Recommendation: file a follow-up. Do not block the merge, because this was not named in the plan.
2. **The GBA load-window clobber is still there, and its explanation was deleted.**
   - File: `packages/ui/src/hooks/useEditSession.ts` (doc comment). At `d37959e`, lines 209-233 documented this gap.
   - Problem: a paint made between a map switch and B's layout landing is wiped when the seed changes, which also drops `isDirty` while the server session stays dirty. Behaviour is unchanged from before Plan 8, but the doc comment that recorded this real gap was removed in Task 5.
   - Fix: restore a 2-line note on the core's seed check, or in `useEditSession`.
3. **The deferred minors below.** See triage. None needs fixing before merge.

## Ledger triage

No ledger line contains "parked". Every "Ruling:" line was read. The rulings are either process rulings (no code effect) or named behaviour decisions with stated costs. Of the named decisions, I re-checked against the code: T1 R2 (GBA begin-less drag no longer paints), T5 R3 (GBA adopts GBC's guard), T6 R6 (GBA error banner retires on visit), and T7 R3/R4. Each is implemented as ruled and witnessed. **All rulings stand.**

Line 112 is covered above: it stands, plus Important 1.

Deferred minors:

| Ledger line | Item | Fix before merge? |
|---|---|---|
| 42 (T1) | Stale `pendingPaintRef`/`dragStartRef` comments; garbled `endActiveStroke` doc | No. Comment-only; fold into the next touch of the canvases. |
| 43 (T1) | Render-phase `onErrorRef` write; redundant `.then`; test hygiene (double flush, 40 ms real timer) | No. The ref write is the standard latest-ref pattern and harmless. |
| 49 (T1) | Spec-review Minors 3-4 (retire-before-begin untested) | No. `useStrokeChain.test.tsx:151` now covers retire with a failed begin. Residual risk is low. |
| 67 / 69 (T2) | Dead GBC `contextView` destructure; `[...].reverse()`; no-op test wrapper; no `placement: null` double-click test; no Escape-listener-removed test | No. Style or test gaps on code that `if (!inContext) return` plus the cleanup make obviously correct. |
| 80 (T3) | Registry duplicated; `SettledChain` type repeated | **Already resolved** by Task 7 R2 (`useStrokeChainRegistry`, `SettledChain`). The rest (lost comments, unused imports, stderr) can stay deferred. |
| 82 (T3) | Copied test headers; no StrictMode/unregister test for the chain Set | Unregister is now covered (Task 7 M3 mutant killed by the registry test). The rest stays deferred. |
| 87 (T3) | "No SaveDialog" negatives after a single act flush | No. The overlay assertion kills the stated mutant. |
| 102 (T4) | Doc one-liners lost the coverage-cache note; lineage comments read backwards; no "no refetch on rerender" pin | No. The rerender loop risk is real only with an inline guard, and the GBA wrappers use a module-level `unguarded`. Worth a 1-line test later. |
| 114 (T5) | `mapName === null` vs `!mapName`; core interface lacks R4 contract docs | No. No caller passes `""`: `selected` is `null` or a real name in both Apps. |
| 118 (T5) | Q2 unconditional `setStored(null)` | **Resolved** by T7 R4 (`useEditSessionCore.ts:69`). |
| 118 (T5) | Q2 seq-bump half | No (see the R4 residual below). |
| 118 (T5) | Q3 render-phase `latest` write | No. Pre-existing pattern; safe because it is read only in async callbacks. |
| 118 (T5) | Q4b `readServerError` family flag | No. One boolean; acceptable. |
| 118 (T5) | Q5 ticketless `applyExternalMapUpdate` racing an older ticketed reply | No. The reply is older, so at worst the sign marker hides until the next edit (self-heals). Narrow. |
| 137 (T6) | `resetForMapChange` redundant; fixed `clientX 200` | **Resolved** by T7 R3 (deleted). The `clientX` item is cosmetic. |
| 150 (T7) | m1 lost the "tool/collision persist" note | Partly moot: `useMapEditing.ts:227-229` still says the stamp is cleared only on a map switch, and the renamed test pins that tool and collision persist. Fine. |
| 150 (T7) | m2 one `it`; m3 unused param | No. |
| 150 (T7) | m4 same-name re-select no longer clears selection/stamp | No. Better UX; the visit didn't change. Record it as an accepted behaviour change. |
| 150 (T7) | R4 residual: `seq.applied = issued` drops a new map's reply issued during the discard await | No. `GbcApp` switches only after discard resolves. The GBA case needs a map switch plus a paint inside the discard RTT, and it self-heals on the next reply. |

## Cross-module interactions checked (no finding)

- **Stroke chain ↔ context exit.**
  - `requestExit` waits on every registered chain.
  - Chains register and unregister in an effect keyed on stable identities (memo with `[]`, `useCallback` with `[]`), so StrictMode's add→delete→add leaves exactly one entry.
  - A canvas unmounting mid-stroke is unregistered, but its retire-end is still appended to its own tail. Nothing awaits it after unmount, which is correct: there is no exit decision left to gate.
- **Stroke chain ↔ edit-session core.**
  - The chain captures the session object at `start`.
  - Core `post` identity changes with the seed, but a captured stroke keeps posting to its own map, and its replies are dropped by ticket map/seed once the view moves on.
  - The retired end on GBC hits `paint/end` → `store.open`, which can create an empty clean session for a discarded map. It is not dirty, so this is harmless.
- **Visit guard ↔ edit session.**
  - `useVisit` and the core both key on `mapName`.
  - GBA's same-name re-click changes neither, and it changes no layout fetch either: `useMapLayout` is keyed on the name.
- **Begin failure.**
  - `finish` still posts `end` for an owned, un-begun stroke. This is intentional and tested at `useStrokeChain.test.tsx:193`.
  - The server's `paint/end` is idempotent. The begin error is reported once.

## Declined to judge

- GBA `leave` confirms but does not POST discard, unlike GBC. This is pre-existing, and DESIGN.md records it as a real per-family difference (Task 7 stop rule).
- GBA canvas `onError` is a no-op, so GBA paint errors stay silent. This is pre-existing, and T1 ruling line 31 rules that adding error UI would be an unnamed behaviour change.
- Task 7 was reduced and Task 8 (canvas unification) was not done. Both are user decisions, recorded at ledger lines 140-142 and in the plan.
- Visual and live behaviour: I relied on the Task 5/6/7 live-smoke records and did not re-run a browser.
- The full-suite pass count: per instructions I relied on the coordinator gate (2,703 / 0, 171 files).

## Recommendations

- Apply Important 1 (3 lines of test).
- Open a follow-up issue for Minor 1. It is a natural first consumer of `strokeSettled` outside context exit.
- Restore the GBA load-window note (Minor 2) when next touching `useEditSession.ts`.

## Assessment

**Ready to merge? With fixes.**

**Reasoning:** The shared modules are correct, StrictMode-safe and well witnessed, and they introduce no unnamed product regression. The T5 ordering failures are a provable test race, not a product reorder. Make the 3 affected assertions wait for the GET they compare against before merging, so the gate is not load-sensitive. Everything else can stay deferred.

Counts: Critical 0 / Important 1 / Minor 2 (plus 26 deferred ledger minors, none blocking).
