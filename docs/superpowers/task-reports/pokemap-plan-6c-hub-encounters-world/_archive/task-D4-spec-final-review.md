# D4 final spec review — residual F3

**PASS for the requested narrow review of `1c49c53`.** Used `git show` only to inspect the GBA selection-assertion relocation; no source mutation or tests ran.

In `packages/ui/test/WorldCanvas.test.tsx`, `independently acknowledges two same-map badges by right-click, keeps placement, and survives remount` now checks the original `canvas.parentElement` for selection outlines immediately after the right-button down/move/up sequence. The vacuous check against the newly mounted `reloaded.canvas` is removed. A selection caused by that original sequence is now observable before unmount discards the state.

This closes the sole residual F3 item from `task-D4-spec-fix-review.md`; F1 and F2 were already closed there against `f2fa4fb`. No open finding remains from this spec review. The same commit also contains action-position work outside this narrow re-review; its independent quality review and the coordinator's final mutation/live gates retain their own scope.
