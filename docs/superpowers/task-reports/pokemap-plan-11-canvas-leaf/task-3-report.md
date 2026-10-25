# Task 3 report: Collision accessible names (P11-4)

Tier: Low (two attributes and test query updates; a wrong name fails a test). Implementer: Claude inline (under 10 minutes of tool calls; a brief would cost more), logged in the ledger.

## Change

- `components/Toolbar.tsx`: `TOOL_ACCESSIBLE_NAME = { collision: "Collision tool" }` sets the tool button's `aria-label`; visible label and `title` stay `Collision` / `Collision (C)`.
- `shared/OverlayToggleGroup.tsx`: `TOGGLE_ACCESSIBLE_NAME = { collision: "Show collision overlay" }` sets the overlay toggle's `aria-label` (both families, through the shared group); `aria-pressed` kept.

## Test changes (each for P11-4)

| File | Change |
|---|---|
| `test/Toolbar.test.tsx` | tool-name loop and two availability tests query "Collision tool"; the icon/label/tooltip test splits the name query from the unchanged `title` and text assertions |
| `test/gbc/ToolbarGbc.test.tsx` | absence check queries "Collision tool" (still proves GBC has no Collision tool) |
| `test/MapCanvas.test.tsx` | overlay loop and three toggle clicks/asserts query "Show collision overlay" |
| `test/gbc/GbcMapCanvas.test.tsx` | overlay loop and two toggle clicks query "Show collision overlay" |
| `test/App.test.tsx` | five Tools-group-scoped queries now query "Collision tool" by name (unused `within` import dropped) |

The text-content assertions on the overlay group (`["Grid", "Collision", ...]`) and the legend items are unchanged.

## Red run

Tests first, before the two attributes: 5 files, 20 failed / 152 passed (Toolbar 4, MapCanvas 3, GbcMapCanvas 3, App 10; ToolbarGbc's absence check passes either way). After: 172/172.

## Gate

3,455 pass / 0 fail / 216 files; typecheck and UI build pass.
