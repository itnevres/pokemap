# Plan 11: canvas leaf extractions (design)

Written 2026-10-23 from `master` `fb78949`, on branch `plan-11-canvas-leaf`. Roadmap: `plans/2026-10-14-pokemap-roadmap-unified-ui.md`, "Plan 11: canvas leaf extractions", brainstorming rulings P11-1 to P11-4. Decisions D1-D18 are binding and are not re-opened here. **Tier: High** (P11-3 brings in async-ordering fixes).

## Intent

Take every run of code the two map canvases and the two world canvases still share, outside the draw path, into `packages/ui/src/shared/`, so a later change lands once. On the way, fix the Plan 10b deferred world-canvas minors (groups T7b, Final fix, N1), which sit in the code being moved, and give GBA's two "Collision" buttons distinct accessible names.

## Goals

1. **Extractions (P11-1).** Each run listed under "Extractions" lives once in `shared/` and both canvases use it.
2. **D9 boundary (P11-2).** Composite-version and redraw effects, LOD draw code, hit-testing, and the stroke handlers around `chain.start` stay in the family canvases for Plan 12.
3. **Plan 10b minors (P11-3).** Every item under "Fixes" is fixed and pinned by a test.
4. **Collision names (P11-4).** The GBA toolbar's Collision tool button is named "Collision tool"; the canvas overlay toggle is named "Show collision overlay" (both families, through the shared toggle group). Visible text stays "Collision".

## Non-goals

- The render-pipeline core (Plan 12): one draw loop over `geometry` plus family drawers.
- Plan 10b deferred minors outside T7b, Final fix and N1 (T1, T4, T5, T6, T7a, T8 groups). They stay in the Plan 10b spec's list.
- Per-family content that only looks alike: GBA's Elevation toggle and legend, GBA's vertical-link (dive/emerge) badges, GBC's Wall/Water legend split and time-of-day encounter note, the two status strips' readouts.
- Everything the session brief lists as out of scope: ledger F-5, undo for saves, crash-mid-swap durability, GBC CLI indicator commands, `issues-5-6-warp-popups`.

## Anti-goals

- No visual or DOM change from an extraction: class names, `role`, `aria-*`, `data-testid`, text and element order stay as they are. The only DOM changes are P11-4's two accessible names.
- No new abstraction that one family alone uses. A run that differs in more than its inputs stays duplicated (say why in the task report).
- No new dependency.

## Baseline measurement (2026-10-23, `fb78949`)

Method as Plan 8 Task 8: code lines only (blank, comment-only and lone-bracket lines dropped, whitespace collapsed), then `difflib.SequenceMatcher(autojunk=False)`; "aligned" = identical lines in matching runs of 3 or more. The script is `docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/measure.py` (run: `python -I measure.py <gba> <gbc>` from `packages/ui/src`).

| Pair | code lines GBA / GBC | aligned in runs ≥3 | runs |
|---|---|---|---|
| `components/MapCanvas.tsx` / `gbc/GbcMapCanvas.tsx` | 535 / 545 | 263 | 37 |
| `components/WorldCanvas.tsx` / `gbc/GbcWorldCanvas.tsx` | 1218 / 909 | 302 | 48 |

## Extractions

Line numbers are at `fb78949` (GBA / GBC), checked by grep; the builder re-checks them in Task 1. Module names are suggestions; the builder may rename within `shared/`.

### Map canvases

| # | Run | Lines | Target |
|---|---|---|---|
| E1 | Controlled-view plumbing: `controlled`, `view = controlledView ?? ownView`, `updateView` with `viewRef`/`onViewChangeRef` | 350-361 / 334-342 | `shared/useCanvasView.ts` |
| E2 | `applyZoom`, `centerPivot`, the native non-passive wheel handler | 596-634 / 553-587 | same hook |
| E3 | Zoom group (`role="group"`, `aria-label="Zoom"`, `ZOOM_LEVELS`, `aria-pressed`, Fit) | 880-895 / 757-766 | `shared/CanvasZoomBar.tsx` |
| E4 | Overlay toggle group (`role="group"`, `aria-label="Overlays"`); the family passes its toggle list (GBA adds Elevation) | 896-915 / 767-783 | `shared/OverlayToggleGroup.tsx` |
| E5 | Legend bar frame and item markup (`map-canvas__legend-item`, swatch); the family passes its items | 916-981 / 784-852 | `shared/LegendBar.tsx` |
| E6 | Status-strip container only if it saves 3+ lines; the readouts stay per family | 982-1000 / 853-870 | builder's call, recorded |

### World canvases

| # | Run | Lines | Target |
|---|---|---|---|
| E7 | Lens overlay JSX and `lensOverlayEntries` (level-curve, empty-maps, method; `unused-species` skipped). Takes a rect function so GBC keeps its `rectByMap` memo | 2082-2115, 1191-1202 / 1380-1413, 887-895 | `shared/LensOverlay.tsx` |
| E8 | Tile-version refetch (`seenTileVersionsRef` effect) | 967-977 / 729-739 | `shared/useTileVersionRefetch.ts` |
| E9 | Small-tile (LOD) cache build in the image `onload`; tile size passed in (GBA `TILE_PX`, GBC `BLOCK_PX`) | 986-994 / 747-755 | `shared/worldTiles.ts` |
| E10 | Badge geometry: `BADGE_SIZE` and the conflict-diamond centre. GBA's vertical-link triangle stays GBA's | 1432-1439 / 958-965 | `shared/worldBadges.ts` |
| E11 | Conflict-acceptance wiring around `useConflictAcceptance`, including the tooltip text: GBC's `conflictTooltipText` (`GbcWorldCanvas.tsx:261`) moves to `shared/` and GBA uses it if its text is identical (else both keep theirs, recorded). GBC's `mapFilter` skip stays GBC's | 387-406 / 546-565 | next to `useConflictAcceptance` |
| E12 | `WorldContextOverlay` mount with the `ContextMapFit.Provider` wrapper | 2116-2128 / 1436-1448 | `shared/WorldContextOverlay.tsx` |
| E13 | Any other aligned run of 3+ lines outside the draw path that the Task 1 measurement finds (world Fit/zoom readout, warp and line toggles, encounter-border mount, spotlight overlay, toolbar alerts) | measured | builder lists each one in the task report: extracted, or kept with a reason |

## Fixes (P11-3)

Each fix names its Plan 10b source item. Every fix gets a test that fails before it (record the red run) or, where that cannot be arranged, a mutation that the test catches.

### Placement saves (N1, Final fix)

- **F1. Per-map edit versions in GBC.** GBC captures a per-map edit version at each drag, like GBA's `placementEdits` / `savedPlacementEdits`. A POST's success or failure settles only its own version or older. Fixes N1 "a late GBC POST failure settles a newer in-flight edit".
- **F2. A no-op commit does not settle an in-flight edit (both families).** A drag that ends on its start tile settles only its own version. While a POST for that map is in flight, the map's saved version is left for that POST to settle. Fixes N1 "same-tile commit during an in-flight POST".
- **F3. An override drops when the server shows it.** GBC drops a local placement override once a loaded world has that map at the override's position (or the override is settled), not when the last saved position matches. A reload that answers before a later save lands no longer shows the pre-save position. Fixes Final fix "an earlier GBC reload can briefly show the pre-save position".
- **F4. Pure updater.** The GBC override filter reads no ref inside its `setState` updater; it reads a snapshot taken before the call. Fixes Final fix "reads a ref inside a state updater".
- **F5. A failed save reverts (both families).** When a placement POST fails and no newer edit of that map exists, the map returns to its server position at once (a reload in both families), and the save error shows. Fixes Final fix "GBC local positions from a failed save persist"; GBA has the same gap.
- **F6. Tests** for both N1 races in both families, and for the settling of unchanged members of a GBA group move (N1 "no tests cover").

### World view wiring (T7b)

- **F7. One refresh per commit.** A placement commit of N maps (GBA group move) makes one visibility refresh, not N. The canvas reports the saved names once (for example `onPlacementsSaved(names)`); the adapter marks each and refreshes once. T7b "coalesce".
- **F8. Shift-drag tests** pin the saved-placement callback on a Shift-drag move in both families. T7b.
- **F9. GBA dungeon view marks placements.** GBA `renderDungeon` (`gba/adapter.tsx:138`) passes the saved-placement callback, so a dungeon-mode placement un-greys the tree row, as GBC does. T7b.
- **F10. Dead wiring removed.** GBC `renderDungeon`'s `onLayoutChanged={reloadWorld}` goes (the shell's world fetch is disabled in Dungeon mode). GBA's dungeon view does not gain one. T7b.
- **F11. A failed reload keeps the canvas (both families).** When a world is already shown, a failed reload shows its error as a dismissible toolbar alert and the canvas stays usable. The "Could not load the world" placeholder is only for a first load that fails. T7b "a failed GBC world reload blanks the canvas".
- **F12. No toggle flicker (both families).** The dungeon switch keeps its pending value while any toggle POST is in flight; a reload that lands between two toggles no longer flips it back. T7b.
- T7b "no red-first run captured" is a Plan 10b process note: nothing to build. F1-F12 each record their own red run.

### Defects (Final fix)

- **F13.** The symbol-failure `incomplete` entry (`server/src/projectSymbols.ts:31`) names the project relative to its root (`file: "."`), and its reason has the absolute root stripped. No absolute path reaches the banner.

## Collision names (P11-4)

- GBA toolbar Collision tool button: accessible name "Collision tool". Its visible label and `title` stay.
- Overlay toggle, both families (shared `OverlayToggleGroup`): accessible name "Show collision overlay", `aria-pressed` kept. GBC gets the same name, since the group is shared.
- Tests that scope by the "Tools" group to tell the two apart query by name instead.

## Constraints

- **Canvas tests pass unchanged** except where an F-item or P11-4 changes them; each such test change is listed in the task report with its reason.
- Extraction tasks come before fix tasks, and each extraction task is a pure move: its diff changes no test.
- Shared modules follow `packages/ui/DESIGN.md` "Shared modules"; add the new ones there.
- Gate per the session brief (4 workers), typecheck and UI build before every commit touching `packages/`.

## Acceptance

1. The measurement re-run at the end: every remaining aligned run of 3+ lines is draw path (P11-2) or listed with a reason. Before/after numbers recorded.
2. Gate passes with the test count at or above the baseline 3,455 / 0 fail / 216 files; typecheck and UI build pass.
3. F1-F13 each have a test (red run or mutation recorded). High-risk mutation checks: undo F1, F2, F3 and F12 one at a time; their tests fail.
4. Live check in the real app, both families (headless Playwright is fine): zoom buttons, wheel zoom, overlay toggles and legend, lens overlays, a Shift-drag placement and a group move (one visibility GET), a dungeon-mode placement in GBA, the dungeon switch double-toggle, the two Collision names. GBA subject and PerfPlus left as found (manifest hashes unchanged, no `.pokemap` in PerfPlus).
5. Separate spec and quality reviews per task (Opus-tier, per CLAUDE.md), and a final review.

## Left to the builder

- Module and prop names inside `shared/`.
- Whether E6 is worth it (recorded either way).
- How F7 reports names (one callback with an array, or batching in the adapter), as long as one commit makes one refresh.
- How F5 reverts (reload, or restore the last server position locally), as long as the map shows its server position once the error shows.
