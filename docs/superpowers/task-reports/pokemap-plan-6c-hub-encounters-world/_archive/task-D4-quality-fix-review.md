# D4 quality fix review — f2fa4fb

Read-only review of the repair commit against the two findings in `task-D4-quality-review.md`. No code edits or tests.

## Result

1. **P2 remains — the action is flipped by quadrant, not clamped to its rendered size.** `packages/ui/src/world/ConflictAction.tsx` now uses `right` when `action.x > viewport.w / 2` and `bottom` when `action.y > viewport.h / 2`. At `action.x === viewport.w / 2`, it still sets `left` to half the viewport; an action wider than the remaining half overflows and `.world-canvas__viewport { overflow: hidden }` clips the button. The same holds vertically at half height. For a 200 px viewport, a 130 px button at x=100 extends to 230 px. The added tests assert the chosen CSS property for far-edge points, not that the rendered popup fits. Clamp using the popup's measured dimensions, or position it with a guaranteed fit for all viewport sizes, and test the resulting bounding rectangle near both the midpoint and edges.

2. **Closed — PerfPlus write restoration now covers a rejected request after write.** `packages/server/test/gbcRoutes.test.ts` wraps each POST in `observedPost`/`observedRawPost`; each wrapper captures the current `world.json` bytes in its own `finally`, including when the awaited request rejects. The outer `finally` retains the read/byte-match guard before restoring the pretest bytes or absent file/directory state. No remaining instance of the reported capture gap is apparent in this test.
