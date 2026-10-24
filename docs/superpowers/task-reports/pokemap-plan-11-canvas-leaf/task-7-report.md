# Task 7 report: world wiring (F7-F10)

Tier: Medium (callback wiring across adapters; wrong counts fail tests). Tests: Claude wrote them first. Implementer hops: Codex `gpt-5.6-terra` failed (usage limit until 5:44 PM); Aider Laguna S 2.1 failed (hit its output limit rewriting whole files, no diff); then Anthropic direct, inline. Reason: the brief already held every edit (12 one-line changes), so finishing inline took less than ten minutes.

## Changes

- F7: `WorldCanvas` and `GbcWorldCanvas` prop `onPlacementSaved(name)` becomes `onPlacementsSaved(names)`. GBA calls it once per commit with the acknowledged names, and not at all when none was acknowledged. GBC calls it with `[map]` (its commits are single-map). Both adapters' world views mark each name and refresh once (GBA `refreshVisibility()`, GBC `reloadWorld()`). The canvas's own reload is unchanged: one per commit.
- F9: GBA `renderDungeon` passes `onPlacementsSaved`, which marks each name. A dungeon-mode placement now un-greys the row in World mode.
- F10: removed GBC `renderDungeon`'s `onLayoutChanged={reloadWorld}`. Typecheck passes and nothing else passed it.

## Tests

New file `test/shell/placementCommit.test.tsx` (adapter level, `FamilyApp` with the family adapter, `markManualPlacement` recorded through a wrapping adapter):
- F7, GBA group move of three (Ctrl-select A, B, C, then Shift-drag): all succeed → 3 marked, 1 refresh, 2 GETs (canvas + visibility); one fails → 2 marked, 1 refresh, 2 GETs; all fail → 0 marked, 0 refreshes, 1 GET (canvas only).
- F8, both families: a Shift-drag move marks the map once, with 2 GETs.
- F9, GBA: a rail drop in Dungeon mode marks Hut, and its World row is no longer greyed.

Ruling (the count): React batches same-tick `refresh()` calls (`useWorldVisibility` bumps a generation state), so the old code's per-name refresh already made one visibility GET. A GET count cannot fail before the fix or under the "refresh per name" mutation. The test therefore wraps `useWorldVisibility` (`vi.mock`, delegating to the real hook) and counts `refresh()` calls. It asserts the GET counts as well. Since the old per-name refreshes only cost extra re-renders, the 10b "coalesce" item was a call-count defect, not a network one.

Changed existing tests (prop rename, F7): `test/shell/worldParity.test.tsx` "onPlacementsSaved" pair (expects `["Hut"]`); `test/world/placementResync.test.tsx` resync case (prop renamed; asserts the saved name array).

Red run (old code, new tests): 3 failed / 3 passed. Failures: "all succeed" (refresh calls 3, expected 1); "one fails" (2, expected 1); F9 (marked `[]`). Passing on old code: "all fail" and the two F8 Shift-drag pins.

## Mutation

Refresh per name (GBA adapter `names.forEach((n) => { mark(n); refreshVisibility(); })`): 2 failed (all succeed 3≠1, one fails 2≠1). Byte-restored.

## Gate

3,526 pass / 218 files (the run also picked up Task 8's uncommitted red test: 2 failed in `server/test/projectSymbols.test.ts`, nothing else). Typecheck and UI build pass.
