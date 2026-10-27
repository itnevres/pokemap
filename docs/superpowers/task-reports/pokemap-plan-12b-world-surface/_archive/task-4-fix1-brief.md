# Task 4 fix round 1

Edit only `src/canvas/useWorldDrag.ts` and `test/canvas/useWorldDrag.test.tsx` (paths from `packages/ui`). Do not change any existing test's assertions; ADD tests. Keep the file's style (terse comments, existing harness helpers in the test file).

Findings (from `task-4-spec-review.md` and `task-4-quality-review.md`):

1. Rounding unpinned. Add a map-drag test and a group-drag test whose hand-derived positions round UPWARD (fraction >= .5) and one that lands on NEGATIVE coordinates (e.g. -1.6 rounds to -2, -2.5 rounds to -2 with `Math.round`). Assert both the optimistic `movePlacements` positions and the committed positions. Put the derivation in a comment (harness: 10 screen px per native unit, `toWorld = (sx, sy) => ({ x: sx / 10, y: sy / 10 })`). `Math.floor` instead of `Math.round` must fail these tests.

2. Marquee axis unpinned. Add two marquee tests: dragged right-and-UP (x1 > x0, y1 < y0) selects only fully contained maps; dragged left-and-DOWN (x1 < x0, y1 > y0) also selects partially intersecting maps. Use candidates where containment vs intersection gives different answers. Choosing the rule by `y1 > y0` instead of `x1 > x0` must fail.

3. Unmount leaves begun versions pending. In the hook add an unmount cleanup:
   ```ts
   // Unmount mid-gesture settles it like a cancel: begun maps revert and their versions noop, so none stays pending.
   const cancelRef = useRef(cancel);
   cancelRef.current = cancel;
   useEffect(() => () => cancelRef.current(), []);
   ```
   (import `useEffect`; place after `cancel` is defined). Tests: start a map drag, move once (begun), unmount → `noop` was called with that version, `ledger.serverShows(map, ledger.snapshot())` is true, and `movePlacements` received the start position; same for a group drag (every member). Unmount with no gesture calls nothing. Use the real `createPlacementLedger()` kept outside the hook.

Verify (conductor runs it): from the repo root `npx vitest run packages/ui/test/canvas/useWorldDrag.test.tsx`, all pass. Do not commit.
