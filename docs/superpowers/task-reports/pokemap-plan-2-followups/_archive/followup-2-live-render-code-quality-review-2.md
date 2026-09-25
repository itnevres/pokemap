# Follow-up 2: live render -- code-quality re-review (round 2)

Re-review of the targeted fix for 1 Important + 1 Minor from round 1
(`followup-2-live-render-code-quality-review.md`). Commit under review:
`b3d2df8` (on top of `e4dafd7`). Verified independently, not from the
implementer's report alone.

## Verified

- **Important (test teeth) -- fixed, verified by direct re-derivation.**
  Temporarily re-deleted the `if (skipNextBumpRef.current) {...}` guard
  block in `MapCanvas.tsx` (lines 292-295), ran
  `npx vitest run packages/ui/test/MapCanvas.test.tsx`: the `v=` test now
  fails exactly as claimed -- `expected '1' to be '0'` at the `await new
  Promise(...300ms); expect(versionOf()).toBe("0")` assertion (line 428).
  Restored the guard via `git checkout --`, confirmed 27/27 green again,
  3x consecutive re-runs, no flake. The added `300ms` wait genuinely
  discriminates now: without it, a scheduled-but-unfired debounced bump and
  a truly-swallowed tick both read `"0"` immediately after rerender; the
  wait forces the debounce timer (`200ms`) to either fire or stay
  suppressed before the assertion.
- **Minor #3 (`setPaintVersion(0)` removal) -- confirmed done, rest of
  effect intact.** `grep -n setPaintVersion` shows only the `useState(0)`
  init and the debounced-bump `setTimeout` callback; the reset call is
  gone. Read the full `[mapName]` effect (`MapCanvas.tsx:272-288`):
  `skipNextBumpRef.current = true` (arming) and the
  `paintVersionTimerRef` clear-and-null (cancelling any pending debounced
  bump from the map just left) are both untouched. `paintVersion` is now a
  monotonic, never-reset counter, as intended -- matches the argument that
  `mapName` already forces a URL/path change on any real switch, so the
  reset bought nothing and only made "same URL -> same content" true by
  accident (no ETag on either render branch today).
- **Commit scope** (`git show --stat b3d2df8`): exactly 3 files --
  `MapCanvas.tsx` (+10/-1), `useEditSession.ts` (+10/-4, comment-only:
  reread the diff, confirmed no logic/behavior change, just replacing a
  false claim about the reseed-race window with an honest one),
  `MapCanvas.test.tsx` (+18/-8: the 300ms wait plus a corrected comment
  about why real timers are used in this specific test, not because fake
  timers wouldn't work here). Matches the implementer report's addendum 2
  exactly, including which optional items (Minor #2, #4) were taken and
  which (#5) was explicitly skipped.
- **Regression / full suite:**
  - `MapCanvas.test.tsx` alone: 27/27 pass, 3 consecutive runs, no flake.
  - Full monorepo `npx vitest run`: **685/685 pass, 73/73 files.**
  - `npm run typecheck`: clean, no errors.
  - Working tree left clean after the teeth-proof (`git status --porcelain`
    shows only the pre-existing untracked review docs, no drift in
    `MapCanvas.tsx`).

## Issues

#### Critical / Important / Minor

None found. Both items from round 1 are fixed and independently
re-verified; no new issues surfaced in this round's files.

## Assessment

**Ready to merge?** Yes

**Reasoning:** Both findings from the prior code-quality pass are
genuinely fixed, not just claimed fixed -- the test-teeth claim was
re-derived from scratch (guard removed -> test fails on the exact
assertion and value reported; guard restored -> green), not taken on the
report's word. The `setPaintVersion(0)` deletion is minimal and scoped
exactly as requested, leaving the rest of the map-switch effect
untouched. Commit touches only the 3 expected files, all comment/test
changes are low-risk, full suite and typecheck are clean, and the
targeted test itself is flake-free across repeated runs.
