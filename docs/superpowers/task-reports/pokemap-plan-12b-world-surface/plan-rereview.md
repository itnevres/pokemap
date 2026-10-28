**Approved with fixes** (0 Critical / 5 Important / 4 Minor). Plan 12b re-review, Claude Opus fallback (Codex astra at its limit). Read-only. The plan's line numbers refer to `4f535bd`. The code line numbers refer to `935d981` (the worktree code is identical).

## 1. Review-1 findings

- **I1 Resolved.** Plan :20-26 lists the P12-4e cases: WorldCanvas.test :357, :401, :487, :515, :574, :1299, :1664, :2264, :2282, :2301, and WorldCanvasContext :112, :464. It also lists P12-4m GBC :2001 and sets a rebase rule plus a Task 8 inventory (:165). I checked each cited line against the test it names. See N3 for a gap in the rule.
- **I2 Resolved.** Task 6 (:137) sets the P12-4r scope and P12-4s retry, and makes the adapter own `fetchWarps` (validation, `destEvent`/`destWarpId`). Tests and mutations are at :139 and :141. The claims match the code: GbcWorldCanvas.tsx:638-656 (scope, `mapName` check, `delete` on catch) and WorldCanvas.tsx:1032-1055 (loaded-on-fail, no retry), :1257-1283. See N4.
- **I3 Resolved for the uncontrolled path.** Task 1 (:60, :67). The claim is true: useStage.ts:47-48 reads the captured `zoom`, and GbcWorldCanvas.tsx:951-952 works inside the updater. See M-c.
- **I4 Resolved.** Task 4 (:108, :110, :112). Both claims are correct. `begin` comes before the first optimistic update: GBA WorldCanvas.tsx:1637 (before `setWorld` :1638) and :1655, GBC GbcWorldCanvas.tsx:1035 (before `setPlacementOverrides` :1036). `noop` on return: WorldCanvas.tsx:1709, :1721, GBC :1059. Cancel settlement and a real-ledger test are defined. See M-a.
- **I5 Resolved.** Task 6 :139 covers early rejection and :141 adds the `Promise.all`-reload-on-first-rejection mutation. This matches GBA WorldCanvas.tsx:1471-1500, which catches each member and reloads once after all settle.
- **I6 Resolved.** Task 1 is High with a reason (:53-55).
- **I7 Resolved.** :79 replaces the alias with a wrapper. I checked the arithmetic: GBC `zoomWorldAboutPivot` (GbcWorldCanvas.tsx:198-209) and `zoomAboutPivot` (canvas/view.ts:39-46) compute the same pan for next = `zoom*factor`. Identity and `fitted` are pinned by GbcWorldCanvas.test.tsx:251-262.
- **I8 Resolved.** Task 6 Step 3 (:141) has a matrix with P12-4d, P12-4q, P12-4r, P12-4s, P12-3 and P12-7. Task 5 :127 covers the P12-5 placeholder mutation.
- **M1 Resolved.** `fitFilter` anchored rule (:80) matches WorldCanvas.tsx:701-705. Its fixture and mutation are at :84 and :86.
- **M2 Resolved.** GBC bounds are unchanged (:23). :1488 passes unchanged and the delayed re-jump test is added (:25, :139).
- **M3 Resolved.** The signature adaptation is at :59 and the import order at :75. Baseline-red vs mutation-red is stated (:154). See N2: the authorized `useStage.test.tsx` edits are incomplete.
- **M4 Resolved.** The plan now lists the exact GBA status content (:161), which matches WorldCanvas.tsx:2029-2043.

## 2. New findings

**N1 Important: Task 1's M3 change breaks many existing map tests, and the plan forbids changing them.**
- Where: plan :62 and :67, against canvas/useRasterComposite.ts:72-75.
- Problem: the plan adds `img.complete && img.naturalWidth > 0` to `onImgLoad`. Existing tests set both values false/0 and then fire `load` to unlock the composite:
  - test/canvas/MapSurface.test.tsx:49-50
  - test/gba/GbaMapSurface.test.tsx:114-115
  - test/MapCanvas.test.tsx `mountReady` :207-211. jsdom's default here is `complete` false and `naturalWidth` 0, checked with jsdom in node.
- Failure scenario: every mountReady-based map test times out at `waitFor(drawImage)`. Step 2 allows only import changes, so the implementer either stalls or rewrites the mocks in many files outside the allowlist.
- Fix: in a real browser, a fired `load` already means the image decoded with size. So drop the `onLoad` check. Record M3 as a guard on the URL-change path only (already done at :67-70), and keep a test that a retained old-URL handler does not unlock the new URL. If the check stays, list every mock edit as an authorized change, with the reason.

**N2 Important: M4 (drop `captured` state) breaks `useStage.test.tsx` assertions that are not on the allowlist.**
- Where: plan :59 and :62.
- Problem: test/canvas/useStage.test.tsx:161, :191, :211 and :239 assert `host.stage.captured`. The returned `captured` field (useStage.ts:132, :194) goes away. The plan authorizes only :5 and :310-315, and Global Constraints :26 says any other changed test is a finding.
- Fix: authorize those four lines to read `host.stage.hasCapture()` with the same expected booleans. Also add `useStage.test.tsx` and its non-ruling reason (12a final review M4 and the deletion) to the :20-26 list.
- Note: Step 3's "one render fewer" is likely two fewer. `beginCapture` calls `setCaptured(held)` and `releaseCapture` calls `setCaptured(false)` on pointerup (useStage.ts:139, :151). Have the test state the measured count.

**N3 Important: the P12-4e rebase rule (:22) lets a test be weakened, or pass on a circular oracle, with nothing catching it.**
- (a) Circular oracle: "computed in the test from `computeFit`/`fitClusters`" takes the expected value from the code under test. A `fitClusters` bug that Task 2 missed would move a GBA test's expected coordinates along with it.
- (b) Vacuous tests: "fixture world chosen so the fit is the old view" can keep an assertion's text while making it empty. Example: :357 culling needs a placement outside the viewport after the fit. If the fixture change brings it into view, or deletes it, "not fetched" proves nothing.
- Fix:
  - Expected values are hand-derived literals. A production call may only cross-check them.
  - A fixture change keeps every placement's role (off-screen stays off-screen after the fit, a singleton stays a singleton, the drag target stays hit).
  - Each rebased test is shown red by a mutation of the logic it guards, listed in the Task 8 report.

**N4 Important: P12-4s retry has no "not before a view change" pin, so a hammering retry loop would pass every listed test.**
- Where: plan :137, :139, :141. Today's code: GbcWorldCanvas.tsx:638-656.
- Today's code is safe only by accident. The catch's `setWarpError` re-render leaves the effect deps unchanged (`visible` is memoized on world/pan/zoom/viewport, :624-636).
- Failure scenario: `WorldSurface` builds its visible list, or the revealed set (P12-4q), as a new array each render. Then failure, `delete`, alert render, new `visible`, refetch, failure again, with no end, for every failing map, against the hub.
- Why tests miss it: GbcWorldCanvas.test.tsx:85 cannot catch this, because its second attempt succeeds.
- Fix: in Task 6, a warp route that always rejects must show a fetch count still at 1 after the alert renders and a bounded `act` loop. Then one pan gives exactly 2. Add the mutation "retry on every render" (put `visible` in the deps without memoizing it).

**N5 Important: the in-context zoom cap claim is false, and the choice it hides is uncaught.**
- Where: plan :78.
- The two families do not share one cap rule today:
  - GBA: `Math.max(MAX_ZOOM, zoom)` (WorldCanvas.tsx:1450), so the cap stays at 16 px/tile in context.
  - GBC: `max(worldContext.maxWorldZoom(32), current)`, where `maxWorldZoom` is base×4 in context (useWorldContext.ts:160; GbcWorldCanvas.tsx:941). That gives 128 px/block in context.
- The plan says GBA's rule is "the same rule with the context max at today's value", but P12-4j (spec :34) says "the shared in-context cap".
  - Read as GBC's rule, GBA in context at 16 px/tile would wheel to 19.2. Today it stays at 16.
  - Read as GBA's rule, the cap is per family, which contradicts P12-4j's "shared".
- No test separates the two readings: WorldCanvasContext.test.tsx:279-306 tests only 64 px/tile in context and 16 outside context.
- Fix: state the shared rule as `max(maxWorldZoom(nativePx × scaleMax), current)`. Then GBA gains 64 in context under P12-4j. Add a GBA test that a wheel-in at 16 px/tile in context gives 19.2, with its mutation. If that reading is not intended, ask the user.

**M-a Minor: the cancel test has a hidden precondition.** Task 4 :110 expects "`serverShows` true at the next snapshot" after a cancel. That holds only with no earlier POST in flight for that map: `noop` waits on an in-flight moved version (placementLedger.ts:93-104). State the precondition, and add a case where the cancel follows an unresolved POST (stays pending until that POST resolves). Reverting positions on cancel is a reading of P12-4a ("applies nothing"). Name it as that reading in the plan.

**M-b Minor: P12-4r narrows GBA's warp fetching.** Today GBA fetches warps for every visible map whatever the toggle and zoom (WorldCanvas.tsx:1032-1036; comment: "turning the warp toggle on shows markers immediately"). Under GBC's scope it fetches only while Warps is on and at or above the LOD threshold. The spec's r-ruling text (:40) records only the gain. Add the narrowing, and move or rewrite the GBA comment.

**M-c Minor: two Task 1 test details.**
- The updater fix helps only the uncontrolled path. Controlled `updateView` applies `next` to `latest.current.view`, which refreshes only in a layout effect (useStage.ts:20-28), so batched events still collapse there. State that the world view is uncontrolled, or cover the controlled path too.
- Write the expected zoom as sequential `z*1.2*1.2`, not `z*1.44`. They differ in floating point (3 gives 4.3199… vs 4.32). Use `toBeCloseTo` for the in-then-out return to z.

**M-d Minor: a GBA fact could land in `canvas/`.** WorldCanvas.test.tsx:466-477 pins `computeFit`'s default bounds (GBA's, becoming 1/128..16). If `canvas/worldView.ts` keeps that default, a GBA fact sits in the shared module (:28). Keep the GBA default in the `WorldCanvas.tsx` re-export wrapper and make the shared `computeFit` require bounds.

## 3. Only the user may decide

- N5, if the reading is not the obvious one from P12-4j.
- M-b, an acknowledgement of the GBA narrowing that P12-4r implies.

Nothing else in the plan settles a user-level question without a ruling.
