# E3 coordinator record

E3 ran under the Claude Code coordinator, 2026-10-05. The executed spec is `task-E3-spec.md` (`8a0e209`).

## Rounds

- **Implementer (Sonnet):**
  - `f9fd072`: menu component;
  - `a0d0806`: both canvases, hook slimmed, `ConflictAction` deleted and its pins ported;
  - `5e15f7b`: App `openMapFromWorld`;
  - `527d64f`: DESIGN.
- **Coordinator rulings on the implementer's concerns:**
  - C1 `keepOpen` and C2 the window Escape listener: accepted, because unchanged D4 tests force them.
  - C3: equivalent, accepted.
  - C4: **measured live**. In Chromium 154 on Windows, the ContextMenu key's `contextmenu` still fires on keyup, at the canvas centre with `button: -1`, even when the keydown is `preventDefault`ed. That made C4 a real bug.
- **Reviews:**
  - spec (Sonnet): PASS, with test gaps F1, F2 and F4; I1 accepted; F3 accepted as code-verified;
  - quality (Sonnet): CHANGES_REQUIRED, with P1-1 (= C4), P2-1, P2-2 and P3-1..P3-10.
- **Fix round, same implementer, `e64196a`:**
  - the shared `useWorldContextMenu` hook, with a one-shot keyboard-echo guard (a 1 s window, re-armed by any canvas pointerdown);
  - `width: max-content`, `onCloseRef`, Tab closes, `aria-label`, the menu-id check, the GBA `mapFilter` guard, `--text-secondary` hint;
  - the F1/F2/F4 tests.
- **Quality re-review (Sonnet): APPROVED.** Its N-1 (a DESIGN token line) was fixed by the coordinator.
- **Existing-test edits:** only the 8 named D4 tests, selectors only (button→menuitem role, the conflict-action class→`.world-context-menu`). `ConflictAction.test.tsx` was deleted, with its pins ported verbatim to `WorldContextMenu.test.tsx`. The fix round was additions only.

## Coordinator mutation rerun on `faa8ca5`

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-phase-d-coordinator/e3-mutations.mjs`. Same method as before:
- an unmutated green baseline for every witness;
- each anchor asserted exactly once;
- in-memory restore, then a byte compare;
- the requested IDs cross-checked against the reported IDs.

| ID | Mutation | Witness | Result |
|---|---|---|---|
| E3-M1 | GBC Edit here enabled | GBC `right-click on a map shows Open in Map view and a disabled Edit here…` | RED |
| E3-M2 | GBA Shift-double-click branch → `if (false)` | GBA `…double-click on a map opens it in Map view without ever POSTing…` | RED |
| E3-M3 | outside-pointerdown listener removed | menu `a pointerdown outside closes…` | RED |
| E3-M4 | arrows include disabled items | menu `ArrowDown/ArrowUp cycle…` | RED |
| E3-M5 | keyboard open with ≥1 selected | GBA `the keyboard opens nothing with zero or two…` | RED |
| E3-M6 | `toggle` swallows the failure | D4 `shows a malformed accept response…` | RED |
| E3-M7 | App ignores the `changeSelection` result | `AppWorldContextMenu` `a dirty session with a cancelled confirm…` | RED |
| E3-X-echo-gba / -gbc | the keyboard open never arms the echo guard | `native contextmenu that follows a keyboard open` (3 + 3) | RED / RED |
| E3-X-rearm | pointerdown doesn't disarm | GBA `a real right-click after a keyboard open is not swallowed…` | RED |

10 requested, 10 reported, none missing. The tree was clean afterwards.

## Live (Chromium, Vite dev 5183 → hub 5184, GBA mirror)

- **Mouse right-click** on Route111 shows the menu `[Open in Map view]` with focus on the item. Escape closes it.
- **Keyboard open, off-centre map.** Route112 was selected, with the canvas centre elsewhere. Pressing the ContextMenu key produced a native echo `contextmenu` with `button: -1` at (534,372). The menu **stayed** at Route112's centre (189.7, 247.4), with focus on its item. That is the guard working in a real browser.
- **A mouse right-click afterwards** opens normally.
- **"Open in Map view"** switches to Map mode with `.app__status` = Route111.
- GBC was not live-checked in E3; that is deferred to E4/F1. GBC behaviour is pinned by tests and mutations E3-M1 and echo-gbc.
