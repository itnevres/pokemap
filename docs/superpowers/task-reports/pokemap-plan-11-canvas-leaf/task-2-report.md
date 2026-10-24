# Task 2 report: world canvas extractions

Tier: Medium (pure move; the unchanged canvas tests catch a wrong move). Implementer: Codex gpt-5.6-terra in a scratch worktree (Aider skipped: >3 files); the first hop died on a network outage ("workspace routing discovery timed out") and the retry ran clean. Diff moved by patch. Claude then edited inline (small; a brief would cost more): removed a pass-through `WorldEncounterBorder` wrapper Codex added (it only forwarded props to the already-shared `EncounterBorder`), moved the context-menu rationale comments Codex left orphaned into `useConflictAcceptanceMenu`, restored the full lens and viewport "why" comments, removed imports left unused, and extracted the identical runs the first `--all` pass still showed (switches, lens legend, conflict legend/tooltip/toast, level colours, singleton sizes, fit centring).

## What moved

| Unit | Shared home |
|---|---|
| E7 lens entries memo and lens JSX | `shared/LensOverlay.tsx`: `useLensOverlayEntries` (family passes a `rectFor`; GBA builds it from zoom/pan/size, GBC looks up `rectByMap`), `LensOverlay` |
| E8 tile-version refetch | `shared/useTileVersionRefetch.ts` |
| E9 small (LOD) image | `shared/worldTiles.ts` `buildSmallTile(image, width, height, tilePx, scale)`; `onload`, cache insert and composite bump stay in each canvas |
| E10 badge size and centre | `shared/worldBadges.ts` `BADGE_SIZE`, `conflictBadgeCenter`; iteration, filters, `drawDiamond`, ✓ text and hit targets stay in each redraw effect |
| E11 conflict-acceptance wiring | `world/useConflictAcceptance.ts` `useConflictAcceptanceMenu` (acceptance, context menu, "Edit here" ref and snap/menu points); tooltip text and GBC's `mapFilter` skip stay per family |
| E12 context mount | `shared/WorldContextOverlay.tsx` `WorldContextOverlayMount` (with the `ContextMapFit.Provider` wrapper) |
| E13 viewport measurement | `shared/useViewportMeasure.ts` |
| E13 spotlight overlay JSX | `shared/SpotlightOverlay.tsx` (the `spotlightByMap` memo stays: see rulings) |
| E13 toolbar alerts, lens picker, lens legend | `shared/WorldLensControls.tsx`: `EncounterFetchAlert`, `WorldLensControl`, `WorldLensLegend` (GBC passes its method key and legend copy) |
| E13 warp and connection-line toggles | `world/DungeonAutoLayoutSwitch.tsx` `WorldToolbarSwitch` (the Dungeon switch now uses it too); GBC's warp-error clear stays in its `onToggle` |
| E13 conflict legend items, badge tooltip, conflict-error toast | `shared/WorldConflictOverlays.tsx`: `ConflictLegendItems`, `ConflictTooltip`, `ConflictErrorToast` |
| E13 fit centring, singleton sizes, level colours | `components/WorldCanvas.tsx` (next to `computeFit`, which GBC already imports): `centredFit` (also used by GBC `jumpFit`), `singletonSizes`, `themedLevelColorMap` |

`packages/ui/DESIGN.md` "Shared modules" (Plan 11 table) lists each. `git diff --stat -- packages/ui/test` is empty. No DOM change: same class names, roles, `aria-*`, text and element order (switch labels now render as `{label} {on ? "on" : "off"}`, same text content).

## E13 named candidates

| Candidate | Ruling |
|---|---|
| Viewport measurement (`:511` / `:588`) | Extracted (`useViewportMeasure`) |
| Fit and zoom readout | Kept: GBA's group is a zoom readout (per-tile units) plus Fit; GBC's is Fit alone, first in the toolbar. The shared lines are the 3-line Fit button |
| Warp and connection-line toggles | Extracted (`WorldToolbarSwitch`) |
| Encounter-border mount | Kept: already the shared `EncounterBorder`; the call site passes per-family inputs only (lod threshold, band, GBC time). A wrapper would only forward props |
| Spotlight overlay | JSX extracted (`SpotlightOverlay`); `spotlightByMap` kept: GBA skips hits with no `mapName` and types differ (`SpeciesHit` vs `GbcSpeciesHit`) |
| Toolbar alerts | Encounter alert and coverage error extracted; GBA's layout/save alerts and GBC's dungeon-layout, save and warp alerts differ in text and placement |

## Measurement (`measure.py`, world pair)

| | code lines GBA / GBC | aligned (runs ≥3) | runs |
|---|---|---|---|
| Before (`fb78949`, unchanged at `8974831`) | 1218 / 909 | 302 | 48 |
| After Codex | 1131 / 824 | 222 | 44 |
| Final | 1083 / 780 | 184 | 40 |

## Rulings: every remaining run (final, `--all`; lines GBA / GBC)

| Run | Lines | Ruling |
|---|---|---|
| Imports | 22-32 / 25-35 | Each canvas's own declarations |
| `ImageCacheEntry`, `TooltipInfo`, props fields, `containerRef`/state declarations | 127-140 / 371-388, 203-206 / 402-405, 368-376 / 448-455, 387-390 / 476-479, 436-441 / 526-537 | Each canvas's own declarations |
| Image-load effect body around `buildSmallTile` | 951-956 / 696-701, 958-961 / 702-705, 963-965 / 707-709 | Kept per P11-2/E9: the `onload`, cache insert and composite bump stay; render URL differs (GBC adds `?time=` and the effect depends on `time`) |
| Encounter-fetch effect | 983-988 / 731-736, 994-1008 / 742-758 | Differs beyond inputs: URL, payload guard (`isGbaEncountersPayload` vs GBC's), payload field and summariser (`methods`/`summariseGba` vs `sources`/`summariseGbc`) |
| Encounter-border entries and cache reads | 1070-1072 / 798-800, 1074-1077 / 802-805 | Draw-side geometry per family (GBA `sizeOfPlacement`, GBC block rects) feeding `EncounterBorder` |
| `spotlightByMap` loop | 1170-1176 / 843-849 | See E13 spotlight: GBA skips unnamed hits; different hit types |
| Redraw effect, image blits, badge loop, redraw deps | 1323-1329 / 856-862, 1333-1335 / 866-868, 1339-1345 / 871-877, 1366-1368 / 883-885, 1374-1380 / 890-896, 1404-1408 / 914-918, 1412-1414 / 923-925 | Draw path (P11-2) |
| Wheel effect | 1426-1431 / 932-937, 1439-1441 / 941-943 | Differs beyond inputs: GBA `setZoom`/`setPan` with its in-context cap; GBC `setView` with `zoomWorldAboutPivot` and `zoomBoundsFor`. Plan 12 territory (view model) |
| Pointer handlers: double-click, `onMouseMove` hover hit-test, drag commit, `onMouseUp`, context-menu hit-test, keyboard box | 1507-1510 / 989-992, 1613-1616 / 998-1001, 1670-1683 / 1016-1028, 1686-1692 / 1032-1035, 1731-1734 / 1039-1042, 1794-1800 / 1092-1098, 1811-1814 / 1117-1120 | Hit-test and stroke/drag handlers (P11-2) |
| `return (` and section/toolbar wrapper | 1843-1845 / 1184-1186, 1882-1885 / 1232-1235 | JSX scaffolding around family-specific children |
| Fit button | 1866-1869 / 1188-1191 | See E13 Fit: the groups differ (GBA readout) |
| Load-error / loading placeholder | 1888-1892 / 1238-1242 | Kept: Task 6 (F11) rewrites this rendering in both families (reload error becomes an alert); extract it there if it stays identical |
| `<canvas>` handler props, selection/jump-highlight `div` | 1897-1899 / 1248-1250, 1937-1939 / 1296-1298 | Call-site inputs (family handlers) and family selection geometry (GBA screen rects, GBC placement rects × zoom) |
| Overlay mounts (`WorldContextOverlayMount`, `ConflictTooltip`, `WorldContextMenu`, `ConflictErrorToast`) | 1972-1975 / 1303-1306 | Call sites of the shared components |
| Body close, status strip spans | 1989-1992 / 1307-1309, 2007-2010 / 1314-1317, 2013-2017 / 1319-1323 | Status-strip readouts stay per family (spec non-goal; GBA hover shows component and Shift+drag hint) |

## Gate

Codex diff alone (main checkout, 4 workers): 3,455 pass / 0 fail / 216 files. Final: see the ledger line for the commit.
