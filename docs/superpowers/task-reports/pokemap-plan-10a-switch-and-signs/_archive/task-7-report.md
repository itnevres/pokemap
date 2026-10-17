# Task 7 implementer report

Status: implemented, not committed.

Changes:
- Added Sign toolbar tool, G shortcut, icon, capabilities, non-paint canvas pick callbacks, and both-family editor wiring.
- Added shared SignEditor with empty, other-event, editable, read-only, hand-edited, refusal, Escape, linked-mode preview, Place, Update, Overwrite, and Free text paths.
- Added SaveDialog linked-sign notices with Refresh and Unlink actions followed by plan reload; plans without signNotices remain accepted.
- Added focused SignEditor, Toolbar, and SaveDialog tests and updated DESIGN.md.

Verification:
- RED attempt: `node node_modules/vitest/vitest.mjs run packages/ui/test/shared/SignEditor.test.tsx packages/ui/test/Toolbar.test.tsx packages/ui/test/SaveDialog.test.tsx` could not start in this restricted worktree: esbuild reported `Cannot read directory "../../../../../../..": Access is denied` while loading vitest.config.ts. No test result was produced.
- PASS: `npm.cmd run typecheck`.
- PASS: `npm.cmd run build -w @pokemap/ui`.
- PASS: `git diff --check`.

Concern: the required root Vitest command is blocked by this environment's filesystem sandbox; rerun it outside the sandbox. GBC session responses are applied through a small public hook seam so staged sign edits immediately update its dirty/undo state.

## Fix round 1

Root cause: SignEditor is an anchored popover, but declared `aria-modal="true"`. The shared Toolbar shortcut guard intentionally blocks all shortcuts when any modal is present, so the editor suppressed `P` selection. It now remains a labelled dialog without modal semantics.

Expected contract-pin updates, and no other assertion changes:
- `packages/ui/test/MapEditingWorkspace.test.tsx`: include `onSignPick` in the canvas prop-key list.
- `packages/ui/test/gbc/ToolbarGbc.test.tsx`: update the GBA default tool-button count from 6 to 7.
- `packages/ui/test/shell/adapter.test.ts`: add `signTool: true` to both GBA and GBC capability pins.
- `packages/ui/test/shell/adapter.test.ts`: append `sign` to `ALL_TOOLS` and the GBC `toolsFor` order expectation.

Verification: `npm.cmd run typecheck` passed; `git diff --check` passed. Per task instruction, Vitest was not run in this sandbox.

## Fix round 2

- Restored `aria-modal="true"` on SignEditor. The reported App P-key failure was not caused by this dialog: `signPick` starts null and both hosts mount SignEditor only after a sign-tile pick, while `App.test.tsx:636-648` never selects Sign or clicks a canvas tile. Task 7 adds only the non-colliding `G` mapping (`TOOL_KEY.sign`), and the existing test setup performs Testing Library cleanup after each test. The prior attribution to the modal was therefore false; there is no Task 7 P-key collision to fix.
- Anchors now use the clicked 16px tile rectangle after pan, zoom, and canvas CSS scale in both map canvases. The editor receives the current host's object-event occupancy and displays the required S9a note.
- The preview now word-wraps at 18 columns, preserves explicit lines, and inserts a blank line between paragraph pages. Expanded editor coverage exercises editable Update, both forced hand-edited paths, Escape, the occupancy note, and the modal attribute. The GBC toolbar test consumes `GBC_TOOLS` from the real host wiring and asserts Sign is present.
- `npm.cmd run typecheck` and `git diff --check` passed. Vitest was not run in this sandbox as instructed. No commit made.
