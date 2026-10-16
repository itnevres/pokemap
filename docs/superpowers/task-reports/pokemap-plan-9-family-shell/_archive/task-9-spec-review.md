# Task 9 spec-compliance review (5e5bccc..4c2abe1)

Verdict: Spec PASS. Critical 0, Important 0, minor 2.

## Compliance
- Listener, shortcutGuard.ts, tests match the brief verbatim; keys P R B I S C, Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z all per spec; handled keys preventDefault; unhandled paths do not.
- shortcutGuard.ts holds the shared rules (defaultPrevented, text target, aria-modal) and exports shortcutBlocked/isTextTarget for R5 F key. Letter-modifier, absent/disabled tool, and undo/redo availability rules live in Toolbar (tool-specific); F reuse only needs the shared three plus its own modifier check - acceptable per spec ("F with any modifier is ignored" is R5's own rule).
- StrictMode test uses `reactStrictMode: true`; no jest-dom matchers.
- Review Focus 1: App.test integration test fires keyDown on the rail search box (aria not pressed), then window (pressed). Fails if isTextTarget removed (mutation below). Focus 2: aria-modal test covers letter and Ctrl+Z; fails if rule removed.
- Gate per implementer: 2745 pass / 174 files (one flaky GbcApp hover test on run 1, passes in isolation and run 2; unrelated).

## Mutation checks (each applied temporarily, vitest ToolbarShortcuts + App.test, then reverted)
| Rule | Mutation | Result |
|---|---|---|
| defaultPrevented | drop `e.defaultPrevented ||` | killed ("already-prevented key is ignored") |
| input/textarea/select/contenteditable | drop isTextTarget | killed (unit + GBA search-box integration) |
| aria-modal | drop querySelector clause | killed |
| letter with any modifier | delete `if (mod || altKey || shiftKey) return` | killed |
| tool disabled | drop availableTools check | killed |
| Undo/Redo unavailable | drop canUndo/canRedo check | killed |
| tool absent (not in `tools`) | search over all six kinds instead of `tools` | SURVIVES |
| Alt on Ctrl+Z | drop `!e.altKey` | survives |
| Ctrl+Shift+Y not redo | drop `!e.shiftKey` on y | survives |

## Findings
- minor 1: "absent tool" rule has no independent test. In the test, `c` is absent from `tools` AND absent from `availableTools: ["rect"]`, so the disabled check masks it. Fix: availableTools: ALL with tools lacking collision, expect `c` ignored.
- minor 2: Alt+Ctrl+Z and Ctrl+Shift+Y exclusions are implementation extras beyond the spec list and untested; harmless.

Tree left as found: tracked files restored from backup, git status shows only untracked report files.
