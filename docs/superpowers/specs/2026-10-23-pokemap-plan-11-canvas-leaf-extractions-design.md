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

- No visual or DOM change from an extraction: class names, `role`, `aria-*`, `data-testid`, text and element order stay as they are. The only DOM changes are P11-4's two accessible names and F11's reload-error alert.
- No new abstraction that one family alone uses. A run that differs in more than its inputs stays duplicated (say why in the task report).
- No new dependency.

## Baseline measurement (2026-10-23, `fb78949`)

Method as Plan 8 Task 8: code lines only (blank, comment-only and lone-bracket lines dropped, whitespace collapsed), then `difflib.SequenceMatcher(autojunk=False)`; "aligned" = identical lines in matching runs of 3 or more. The script is `docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/measure.py` (run: `python -I measure.py <gba> <gbc>` from `packages/ui/src`).

| Pair | code lines GBA / GBC | aligned in runs ≥3 | runs |
|---|---|---|---|
| `components/MapCanvas.tsx` / `gbc/GbcMapCanvas.tsx` | 535 / 545 | 263 | 37 |
| `components/WorldCanvas.tsx` / `gbc/GbcWorldCanvas.tsx` | 1218 / 909 | 302 | 48 |

## Extractions

Each entry is a whole symbol or block, named by where it starts at `fb78949` (GBA / GBC). The unit is the named symbol, not the raw matching run: the builder extracts it whole and nothing next to it. Module names are suggestions; the builder may rename within `shared/`.

### Map canvases

| # | Unit (whole symbol or block) | Starts at | Target |
|---|---|---|---|
| E1 | Controlled-view plumbing: `controlled`, `view = controlledView ?? ownView`, the whole `updateView` callback with `viewRef`/`onViewChangeRef` | 350-368 / 334-349 | `shared/useCanvasView.ts` |
| E2 | `applyZoom`, `centerPivot` and the whole non-passive wheel effect. Not `hoverAt` | 596-629 / 553-582 | same hook |
| E3 | Zoom group (`role="group"`, `aria-label="Zoom"`, `ZOOM_LEVELS`, `aria-pressed`, Fit) | 880 / 757 | `shared/CanvasZoomBar.tsx` |
| E4 | Overlay toggle group (`role="group"`, `aria-label="Overlays"`); the family passes its toggle list (GBA adds Elevation) | 896 / 767 | `shared/OverlayToggleGroup.tsx` |
| E5 | The `map-canvas__legend` element: frame and item markup; the family passes its items. Not the viewport or canvas markup after it | 916-958 / 784-828 | `shared/LegendBar.tsx` |
| E6 | Status-strip container only if it saves 3+ lines; the readouts stay per family | 982 / 853 | builder's call, recorded |

### World canvases

| # | Unit (whole symbol or block) | Starts at | Target |
|---|---|---|---|
| E7 | The `{lens && lensOverlayEntries.length > 0 && …}` block and the whole `lensOverlayEntries` memo (level-curve, empty-maps, method; `unused-species` skipped). Takes a rect function so GBC keeps its `rectByMap` memo. Not the spotlight JSX next to it | 2082, 1191 / 1380, 887 | `shared/LensOverlay.tsx` |
| E8 | The whole tile-version refetch effect (`seenTileVersionsRef`), including its cache deletes | 967 / 729 | `shared/useTileVersionRefetch.ts` |
| E9 | A pure function that builds the small (LOD) image from a loaded tile image: canvas creation, dimensions, the downscaled draw; tile size passed in (GBA `TILE_PX`, GBC `BLOCK_PX`). The `onload` handler, its cache insert and the composite-version bump stay in each canvas | 986 / 747 | `shared/worldTiles.ts` |
| E10 | `BADGE_SIZE` (GBA `:46`, GBC `:141`) and a pure conflict-badge centre function (`cx`, `cy` from placement, size, zoom, pan, offset). Badge iteration, filtering, `drawDiamond`, the ✓ text and hit-target recording stay in each redraw effect (P11-2). GBA's vertical-link triangle stays GBA's | 1431-1432 / 957-958 | `shared/worldBadges.ts` |
| E11 | Conflict-acceptance wiring around `useConflictAcceptance`. Tooltip texts differ today (GBA `WorldCanvas.tsx:1447`, GBC `conflictTooltipText` at `GbcWorldCanvas.tsx:261`), so each family keeps its own text. GBC's `mapFilter` skip stays GBC's | 387 / 546 | next to `useConflictAcceptance` |
| E12 | Only the `{context && <WorldContextOverlay …/>}` element with its `ContextMapFit.Provider` wrapper. Not the tooltip, context menu or conflict-error JSX around it | 2116 / 1436 | `shared/WorldContextOverlay.tsx` |

### Both pairs

| # | Unit | Starts at | Target |
|---|---|---|---|
| E13 | Named candidates, each extracted or kept with a reason in the task report: map auto-fit lifecycle (MapCanvas `:470` / GbcMapCanvas `:452`); world viewport measurement (WorldCanvas `:511` / GbcWorldCanvas `:588`); world Fit and zoom readout; warp and connection-line toggles; encounter-border mount; spotlight overlay; toolbar alerts. Then any other aligned run of 3+ lines outside the draw path that the measurement finds, in either pair | measured | per unit |

## Fixes (P11-3)

Each fix names its Plan 10b source item. Every fix gets a test that fails before it (record the red run) or, where that cannot be arranged, a mutation that the test catches.

### Placement saves (N1, Final fix)

Both families implement one reconciliation model (spec review I1-I3). Versions decide, never coordinates, so A→B→A is safe.

**The model, per map:**

- **Gesture version.** Each drag gesture that moves a map gets one new version `v` for that map when it starts moving it (GBA's per-mousemove bump at `WorldCanvas.tsx:1687` becomes one bump per gesture). A group move gives each member its own version.
- **Local position.** While a gesture or its save is unresolved, the canvas shows the local position for that map.
- **Outcomes.** A gesture ends in one of three ways:
  - *Moved:* it POSTs its position, tagged `v`. On success, `v` is *acknowledged*. On failure, `v` is *failed*.
  - *No-op* (it ends on its start tile, including an unchanged group member): it POSTs nothing. If a POST for that map is in flight, `v` takes that POST's outcome when it lands (acknowledged or failed). If none is in flight, `v` is *settled* at once.
  - A newer gesture on the same map supersedes `v`: `v`'s outcome no longer changes what the canvas shows.
- **Reconciliation.** Each world GET records, when it is issued, every map's latest version and its state. When the GET lands, a map shows the server position only if its latest version at landing time is the one recorded at issue and was already acknowledged, failed or settled then. Otherwise the local position stays. A failed or settled version whose map is absent from the server (a rail drop that failed) leaves the world on that landing.
- **After a failure** the save error shows at once and a world reload is issued. The map keeps its local position until that reload lands, then shows the server position (the rule above, so a gesture started after the failure keeps its own position). If the reload itself fails, the local position stays and F11's alert shows.

**Fixes:**

- **F1. GBC per-map versions** per the model, replacing `savedOverrides` / `settledOverrides`. Fixes N1 "a late GBC POST failure settles a newer in-flight edit".
- **F2. No-op gestures take the in-flight outcome (both families).** Fixes N1 "same-tile commit during an in-flight POST".
- **F3. Reconciliation by version (both families).** A GET issued before a save's acknowledgement never drops that save's local position. Fixes Final fix "an earlier GBC reload can briefly show the pre-save position".
- **F4. Pure updater.** No `setState` updater reads a ref; it reads values captured before the call. Fixes Final fix "GBC reads a ref inside a state updater".
- **F5. A failed save reverts (both families)** per "After a failure". Fixes Final fix "GBC local positions from a failed save persist"; GBA has the same gap.
- **F6. Tests** with deferred (manually resolved) fetches, both families: a late failure after a newer gesture; a no-op during an in-flight POST, with that POST succeeding and with it failing, then a later server-position change; a stale GET landing after an acknowledgement; A→B→A with B in flight; a gesture started between a failure and its reload; a failed rollback reload; unchanged members of a GBA group move (N1 "no tests cover").

### World view wiring (T7b)

- **F7. One refresh per commit.** A placement commit of N maps (GBA group move) makes one visibility refresh, not N. The canvas reports the saved names once (for example `onPlacementsSaved(names)`); the adapter marks each and refreshes once. The canvas's own world reload stays one per commit, as today. Tests are at adapter level: every acknowledged name is marked, failed names are not, one visibility refresh and one canvas reload per commit, for full success, partial failure (refresh for the acknowledged names only) and total failure (no visibility refresh). T7b "coalesce".
- **F8. Shift-drag tests** pin the saved-placement callback on a Shift-drag move in both families. T7b.
- **F9. GBA dungeon view marks placements.** GBA `renderDungeon` (`gba/adapter.tsx:138`) passes the saved-placement callback, so a dungeon-mode placement un-greys the tree row, as GBC does. T7b.
- **F10. Dead wiring removed.** GBC `renderDungeon`'s `onLayoutChanged={reloadWorld}` goes (the shell's world fetch is disabled in Dungeon mode). GBA's dungeon view does not gain one. T7b.
- **F11. A failed reload keeps the canvas (both families).** When a world is already shown, a failed reload keeps the world data and canvas interactive, and shows its error as a `role="alert"` with a Dismiss button, next to and in the same markup as the existing save-error alert (GBA `WorldCanvas.tsx:2129`, GBC `GbcWorldCanvas.tsx:1292`). The alert clears on Dismiss or on the next successful load. The "Could not load the world" placeholder is only for a first load that fails. This is the one DOM change outside P11-4 (anti-goals). Tests: load → failed reload → canvas still pans and drags → dismiss; and load → failed reload → successful reload clears the alert; separately from a failed first load. T7b "a failed GBC world reload blanks the canvas".
- **F12. No toggle flicker (both families).** Each click gets a toggle generation `g` and sets the pending value. A POST outcome for a generation older than the latest is ignored. For the latest generation: on failure, pending clears at once (the switch shows the server value) and the error shows, and a world reload is issued (it clears nothing, since pending is already null; it shows the value an ignored older success may have set; Task 6 review ruling); on success, a world reload is issued, and pending clears only when a GET issued after that success lands. No other world response clears pending. If that reload fails, pending stays (it matches what the server accepted) and F11's alert shows. Tests with deferred fetches: two successes resolving in order and reversed; older failure with newer pending; latest failure after an older success; an unrelated GET landing between the last POST and its reload; a failed final reload. T7b.
- T7b "no red-first run captured" is a Plan 10b process note: nothing to build. F1-F12 each record their own red run.

### Defects (Final fix)

- **F13.** The symbol-failure `incomplete` entry (`server/src/projectSymbols.ts:31`) names the project relative to its root (`file: "."`), and its reason has the absolute root stripped. No absolute path reaches the banner.

## Collision names (P11-4)

- GBA toolbar Collision tool button: accessible name "Collision tool". Its visible label and `title` stay.
- Overlay toggle, both families (shared `OverlayToggleGroup`): accessible name "Show collision overlay", `aria-pressed` kept. GBC gets the same name, since the group is shared.
- Tests that scope by the "Tools" group to tell the two apart query by name instead. Known sites to migrate (spec review M3): `test/Toolbar.test.tsx:36`, `:121`, `:134`, `:142-146`; `test/MapCanvas.test.tsx:295`, `:336`, `:713`; `test/gbc/GbcMapCanvas.test.tsx:357`, `:458`, `:508`. Where a test checks name, visible text and `title` together, split the name assertion from the unchanged text and `title` assertions. `test/gbc/ToolbarGbc.test.tsx:19` (no Collision tool in GBC) queries the new name so it still proves absence.

## Constraints

- **Canvas tests pass unchanged** except where an F-item or P11-4 changes them; each such test change is listed in the task report with its reason.
- Extraction tasks come before fix tasks, and each extraction task is a pure move: its diff changes no test.
- Shared modules follow `packages/ui/DESIGN.md` "Shared modules"; add the new ones there.
- Gate per the session brief (4 workers), typecheck and UI build before every commit touching `packages/`.

## Acceptance

1. The measurement re-run at the end: every remaining aligned run of 3+ lines is draw path (P11-2) or listed with a reason. Before/after numbers recorded.
2. Gate passes with the test count at or above the baseline 3,455 / 0 fail / 216 files; typecheck and UI build pass.
3. F1-F13 each have a test (red run or mutation recorded). High-risk mutation checks, one at a time, each failing a test: F2 no-op settles at once; F3 reconcile by coordinates instead of version; F5 skip the post-failure ownership check (newer gesture clobbered); F12 any world response clears pending; F12 a failed latest POST keeps pending.
4. Live check in the real app, both families (headless Playwright is fine): zoom buttons, wheel zoom, overlay toggles and legend, lens overlays, a Shift-drag placement and a group move (one visibility GET), a dungeon-mode placement in GBA, the dungeon switch double-toggle, the two Collision names. GBA subject and PerfPlus left as found (manifest hashes unchanged, no `.pokemap` in PerfPlus).
5. Separate spec and quality reviews per task (Opus-tier, per CLAUDE.md), and a final review.

## Left to the builder

- Module and prop names inside `shared/`.
- Whether E6 is worth it (recorded either way).
- How F7 reports names (one callback with an array, or batching in the adapter), as long as one commit makes one refresh.
- Where the version bookkeeping lives (a shared hook is preferred if both families fit it without per-family branches).

## Review record

- **Spec review (Codex gpt-6-astra, 2026-10-23):** 0 Critical, 6 Important, 4 Minor; every finding checked against the code and accepted. I1-I3 (placement settlement conflated, no-op inheritance, F5 timing) → the reconciliation model; I4 → F12 generations; I5 → E9/E10 limited to pure helpers; I6 → F11 exempted from the anti-goal and specified; M1 → whole-symbol units; M2 → E13 covers both pairs with named candidates; M3 → test inventory under P11-4; M4 → F7 adapter-level tests.
