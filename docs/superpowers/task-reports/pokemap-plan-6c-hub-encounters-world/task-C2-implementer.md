# Task C2 implementer report: tree reveal on world selection (both families)

Base `3f1668a`. Branch `plan-6c-hub-encounters-world`, local only.

## Commits
| sha | subject |
|---|---|
| 417e00f | feat(ui): MapTree expands the selected map's group and scrolls its row into view (+ setup.ts stub, 7 MapTree tests) |
| 32f67a7 | feat(ui): WorldCanvas onSelectMap fires on a plain single click that hits a map (+4 tests) |
| 74b1d6a | feat(ui): GBA world click selects the map in the tree via changeSelection, not a jump (App.tsx + 4 tests) |
| d104cf4 | test(ui): App world click after a tree jump selects without re-jumping (+1 test) |
| 649b59b | test(ui): GbcApp world click highlights and scrolls its tree row (+1 test) |
| (this) | docs: Task C2 implementer report |

Source changes: `MapTree.tsx` (effect per spec, verbatim), `WorldCanvas.tsx` (prop + `if (hit) onSelectMap?.(hit.map)` after the early returns), `App.tsx` (`jumpTarget`, `changeSelection`/`selectMap`/`selectMapFromWorld`, `jumpToMap={jumpTarget}`, `onSelectMap`; C1's `onJumpToMap={selectMap}` kept). `GbcApp.tsx` unchanged. No CSS, no fetch.

## Anchors re-checked vs HEAD 3f1668a
All held (MapTree structure, `onCanvasClick`, `appliedJumpTokenRef`, GbcApp `jumpTarget`/`selectMapFromWorld`, `selectMap` body). No design drift.

## New tests and red-proof (all by in-memory mutation or red-before-impl, restored by edit; no git undo used)
MapTree (7, `MapTree: scroll the selected row into view`):
| test | red under |
|---|---|
| selection change: once, `{block:"nearest"}`, on the row | pre-impl (0 calls); T2 `block:"start"` |
| mount with selection: once, on that row | pre-impl |
| same selection + new-equal `data`: no new call | pre-impl (0 calls on mount); T4 no deps |
| typing in filter: no call | T1 deps `[selected, filter]`; T4 |
| filter focused + new selection: no call, activeElement stays filter | T5 focus guard removed |
| collapsed group re-opened, call on its row | pre-impl; T3 no `group.open = true` |
| selected map hidden by filter: no call, no throw | T6 `if (!row) return` removed (throws) |

WorldCanvas (4, `WorldCanvas: onSelectMap`): plain click on A then B -> once each with name (G1 red); shift/ctrl click -> none (G2 call-before-early-return red); empty space -> none (red under `onSelectMap?.(hit ? hit.map : "")`); drag ending over a map -> none (red with `dragMovedRef` guard removed, and under G2).

App (5, `App -- world click selects the map in the tree`):
| test | red under |
|---|---|
| canvas click: row `aria-current`, `scrollIntoView` on that row, no jump highlight, readout stays `6%` | G3 `jumpToMap={selected}`; G4b (jumpTarget set); G6 |
| canvas click after tree jump: new map selected, no fresh jump highlight (node same or faded), `63%` kept | G4a (selectVersion bump only; was SURVIVING the first test, hence this test); G6 |
| dirty: world click on other map -> `confirm` once, cancel keeps original row | G5 skip guard; G6 |
| dirty: confirm true -> row switches | pre-impl (confirm 0 calls) |
| dirty: re-click already-selected -> no confirm | G5b `name !== selected` removed |

"Tree click in World mode still jumps": already pinned by the C1 App test (tree click Route1 -> `.world-canvas__jump-highlight`); not duplicated.
GbcApp (1): canvas click -> tree row `aria-current`, `scrollIntoView` on that row with `{block:"nearest"}`; red under G7 (`onSelectMap` not passed).

Fixture notes: WorldCanvas never auto-fits on load (fresh view zoom 1 = `6%`); entering World mode with a map selected jumps on mount (zoom 10 = `63%`). App tests use those instead of the GBC test's fit math. Dirty tests use a 200x100 viewport so PalletTown (jumped, fills x [50,150)) and Route1 (world x 11, visible at [160,200)) are both hittable; world overridden per-test via a `/api/world` wrapper (no shared mock edited).

## Counts and gate
- Base 1,963 pass / 118 files; now 1,980 pass / 0 fail / 118 files (+17 = 7+4+5+1). Narrow runs: MapTree 20, WorldCanvas 74, App 24, GbcApp 24, all pass.
- First full run: 1 fail, `WorldCanvas > jump to map > pans/zooms to the given map's real placement when jumpToken changes` (`jumpOutline` null at the synchronous read after `waitFor(clearRect)`). Test does not use `onSelectMap`; 3 solo reruns pass; full rerun 1,980/1,980. Load-only flake, pre-existing (the same file's comment on the 2026-09-30 highlight flake); not in the known list given, so flagging it.
- `npm run typecheck` clean. `npx vite build` (packages/ui) OK (61 modules, 311 kB js).

## Existing tests touched
- `setup.ts` +2 lines: `Element.prototype.scrollIntoView ??= () => {};` + comment (infrastructure, as the spec names).
- No existing test body edited. One existing non-body line changed: `MapTree.test.tsx` vitest import line gains `beforeEach, afterEach` (the 1 removed line below). Any alternative would have been importing them elsewhere; flagging as the only non-addition.
- `git diff 3f1668a --stat -- packages/ui/test`: App.test.tsx +194, MapTree.test.tsx +67/-1, WorldCanvas.test.tsx +63, gbc/GbcApp.test.tsx +42, setup.ts +2 (368 ins, 1 del). Removed lines in existing test files: 1 (the import above).
- `GbcApp.test.tsx` / `GbcMetatilePalette.test.tsx` per-file `scrollIntoView` stubs untouched; they still work (their save/restore now captures the setup no-op).

## Deviations
- App test count 5 not 3 (added the re-jump test for G4a; dirty cases split into 3). WorldCanvas/MapTree as specced.
- `selectMap` keeps the old ordering effect-wise (setSelected, then resets, then jumpTarget/selectVersion); setters called side by side, none nested. `selectVersion` bump moved after the resets (same batch, no behaviour change).

## Behaviour notes / concerns
- GBA: after a world click only (jumpTarget still null), switching Map -> World no longer jumps to the selected map on entry (before, no world click existed, so n/a). A tree-click selection still jumps on entry. Intended by the F1 design; mirrors GBC.
- A world click while the tree filter has focus does not scroll (spec focus guard); the row is still highlighted.
- Live verify (criterion 5, both families) left to coordinator per spec.
- Untracked files none created; working tree clean after commit.
