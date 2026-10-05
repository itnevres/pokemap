# D4 spec fix review

**Verdict: F1 and F2 closed; one narrow F3 test correction remains on `f2fa4fb`.** Review was limited to `git show`/`git diff` of the repair, affected surrounding tests, and implementer report. No source mutation, test execution, or external filesystem write occurred.

## F1 — closed

In `packages/server/test/gbcRoutes.test.ts`, both `observedPost` and `observedRawPost` capture the post-request sidecar bytes in their own `finally`. Every acknowledgement POST, including malformed JSON, malformed shape, and unknown key, now passes through these wrappers before its assertion executes. Therefore bypassing the unknown-key check can no longer leave `observed.lastWritten` null when the 404 assertion fails after a write. Outer cleanup compares the current file against those captured bytes before restoring the initial contents or removing the newly created file; initially absent empty directories are removed. Existing bytes are not rewritten when already equal. The coordinator's M5 replay should still independently confirm the stated real-corpus restoration result.

## F2 — closed

The shared hook exposes `acceptedKeys`; both draw effects now depend on that array rather than only `acceptedCount`. The same-count response replacement consequently regenerates badge colors, check glyphs, tooltips, and hit records. Both new tests start with the second key accepted, respond with the first key accepted, clear the previous glyph spy, and assert the first glyph plus reversed per-badge action labels while total acceptance remains 1. These witnesses directly exercise the previously stale membership path.

## F3 — mostly closed; remaining correction

The GBC success test now remounts with the same persistent fetch mock and actually unaccepts after reloading. Both families assert accepted tooltip content and run right-button down/move/up before opening the action. GBC asserts no selection callback, no outline, and no placement POST before unmount. GBA observes current mock placements and forbidden placement requests. The unchanged badge coordinates after the move sequence also demonstrate that the view did not pan. GBA now exercises HTTP 503 failure; GBC exercises a rejected network promise, with visible errors and retained acknowledgement in each case.

**Remaining F3:** in `packages/ui/test/WorldCanvas.test.tsx`, test `independently acknowledges two same-map badges by right-click, keeps placement, and survives remount`, the final `expect(reloaded.canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline")).toHaveLength(0)` checks a newly mounted canvas. The original instance's selection is discarded by `mounted.unmount()`, so this assertion cannot prove that the original right-click preserved selection. Assert against `canvas`/`mounted.container` before unmount, preferably immediately after the right-button sequence. This is a relocation of the existing intended assertion; no new production behavior is requested.

The production repair resolves the reported state/render bug. Approval remains conditional only on that precise evidence correction plus the coordinator's final required mutation and live-verification gates.
