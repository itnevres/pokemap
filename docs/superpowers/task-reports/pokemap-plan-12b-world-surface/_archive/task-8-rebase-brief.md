# Plan 12b Task 8, pass 2 brief: rebase the failing tests (High)

You are the implementer, continuing Task 8 in this worktree. Your pass-1 code and notes are here (`task-8-impl-notes.md`). Do not run vitest, npm, or vite (sandbox). The conductor runs everything. Do not commit. **Do not edit any file under `packages/ui/src/`** in this pass; if a failure looks like a production bug rather than a fixture shift, list it in your notes instead of rebasing it.

## What changed since pass 1

1. **User amendment to P12-4m (2026-10-27, binding):** the jump no longer fills 60%. Both families jump with GBA's old fill: the map fills the limiting viewport dimension, clamped to the zoom range. The conductor set `JUMP_FILL_FRACTION = 1` in `canvas/worldView.ts`. Read the amended P12-4m text in `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (line 34; the spec in the main checkout carries it, the copy here may not).
2. The conductor ran every UI test against your wrapper. Inventory: `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-8-inventory.md` (96 failing tests, each with first error and line).
3. Diagnostic the conductor ran: with the first-load fit forced to the old default view (zoom 1, pan 0), only these existing tests still failed: the P12-4j bound (`WorldCanvas.test.tsx` "computeFit's zoomBounds parameter..."), the P12-4m jump rect (`WorldCanvas.test.tsx` "pans/zooms to the given map's real placement"), the P12-4c case "Ctrl+double-click and a plain double-click on a map do not open it", and the jump-readout tests now fixed by the amendment. **So every other failing GBA test (App*, AppContext*, WorldCanvas*.test.tsx) fails only because of the P12-4e first-load fit.**

## Rulings that allow each change (cite one per changed test in your notes)

- **P12-4e (GBA first-load fit).** Rebase rule (plan Global Constraints): keep every behavioural assertion. Either re-derive coordinates / expected zoom from the fitted view as hand-derived literals (derivation in an adjacent comment; a production call may only cross-check, never supply them), or change the fixture world so the fit is the old view. A fixture change keeps every placement's role (an off-screen map stays off-screen after the fit, a singleton stays a singleton, a drag or hit target stays hit). Prefer one shared fixture adjustment per describe block or helper over editing dozens of literals, where it keeps the roles. A test that cannot keep its assertions this way: do not change it; list it.
- **P12-4m amended (jump fills).** GBA tests that pin the old 100% jump keep their expectations (they should now pass; if not, list them). Tests that pinned 60% change to the full fill: `canvas/worldView.test.ts`, `canvas/WorldSurface.test.tsx`, `gbc/GbcWorldCanvas.test.tsx`, `gbc/GbcApp.test.tsx`, `gbc/GbcAppContext.test.tsx`, `gbc/GbcWorldCanvasSurface.test.tsx`, and your own `WorldCanvasSurface.test.tsx` P12-4m case. Re-derive each expected value by hand with fraction 1 and the clamp (zoom = min(max, max(min, min(vw/w, vh/h))), then centred). Update test titles and comments that say 60% / "about 60%" / "not the full 100%". Pure `jumpFit` tests that pass an explicit `fraction` argument keep testing that argument (the scale-before-clamp case should keep an explicit `0.6` argument so the clamp-order guarantee stays pinned); only default-fraction expectations change. `worldView.test.ts` constant pin becomes `1`. Your `WorldCanvasSurface.test.tsx` P12-4m case becomes a preservation test (GBA's old fill, now in both families): name it so.
- **P12-4j:** `WorldCanvas.test.tsx` default-minimum bound becomes 1/128 px per tile (scale 1/2048 x 16 = 0.0078125); keep its explicit-bounds assertions.
- **P12-4c:** `WorldCanvas.test.tsx` "Ctrl+double-click and a plain double-click on a map do not open it" (and the plan's `:1728` case if it fails): with no Edit-here handler a plain double-click now opens Map view; Ctrl stays suppressed. Keep every other assertion.

## Rules

- Only the tests in the inventory may change, plus titles/comments of the jump tests above. No other test edit. Never delete a test or an assertion; never loosen a matcher (`toBe` to `toBeTruthy`, exact to `toContain`, etc.) to make a test pass.
- Every new literal has its hand derivation in an adjacent comment.
- Style: CRLF, UTF-8 no BOM, lines ≤ 140 chars, one statement per line.

## Deliverable

Edited tests, and append to `task-8-impl-notes.md` a section "Pass 2 rebase inventory": a table with one row per inventory test (file:line, ruling, rebase: literals or fixture change, one line on the derivation), plus a list of any test you could not rebase and why, and any failure you believe is a production bug.
