# Task 10 review (spec + quality, merged) -- 782cb77..d4fada7

Verdict: Spec PASS. Quality APPROVED. Critical 0 / Important 0 / minor 2.

## Named risks
1. `afterEach(() => vi.unstubAllGlobals())` in MetatilePalette.test.tsx: NOT dropped. Merged into the new afterEach (adds localStorage.clear and scrollIntoView restore, keeps unstubAllGlobals). Import line widened only. OK.
2. Moved GBA App hover tests: pass for the right reason. Mutation-checked (below). Both set a local fixture so block 1 has rendered palette id 1 (PALLET_TOWN primaryCount 4 renders 0x0-0x3), click Fit (zoom 1, pan 0), hover (40,20). The first also asserts a same-map re-click clears the highlight via onSelected alone (MapCanvas's mapName reset does not fire), the second also exercises a real Route1 switch in one waitFor. Cause of the old-describe failure: not diagnosed. The old describe ("world click ... C2") has no describe-level hooks (only file-level afterEach unstubAllGlobals); its withViewport helper restores clientWidth/Height in finally. Likely a leaked-state / ordering effect from earlier tests in that describe, so a latent isolation weakness in that describe is plausible but unproven. Not a defect of this task.
3. Mutations (npx vitest run packages/ui/test/App.test.tsx, reverted, git status clean of tracked changes): removing the onHoverMetatile call in MapCanvas -> 2 App tests fail; making onSelected a no-op -> 2 App tests fail. Baseline 34/34 pass.
4. cellRefs callback ref: inline ref is re-invoked each render (null then el), so the Map ends correct; cells unmounted by search filtering are deleted, so no stale element is scrolled. A highlighted id filtered out simply does not scroll (correct). Effect deps [highlightId, follow] match GBC; turning follow back on scrolls to the current highlight (reasonable).

## Other checks
- R4: one hook, one switch, key pokemap.palette.followHover, get/set both in try/catch, default on; both palettes use it; scroll gated on follow.
- R2: onHoverMetatile driven by `hover` state via ref-mirror effect; canvas rendering/hit-testing untouched. Edit-state lifetimes unchanged. onSelected is the single clear point; onEnterContext untouched per spec.
- Root.test absence assertions: grep for "Follow hover" in tests finds only the two palette test files; no queryBy...toBeNull conflicts.
- Removed test lines: 3 total, all import/cleanup lines with reasons; no test bodies dropped.

## Minor
- m1: App.test.tsx ends with a stray blank line inside the last describe (diff hunk at EOF); harmless, tidy on next touch.
- m2: Follow-hover state is per palette instance (read once at mount); two palettes never coexist, but a toggle in one family is only seen by the other after remount. Acceptable per "remembered" wording.
