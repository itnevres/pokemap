# Task C1 implementer report (lens legend row + real lists, GBA + GBC)

STATUS: DONE. Base `5bf61ec` (spec) on `b4e08d3` baseline. Nothing pushed.

## Commits
| sha | subject |
|---|---|
| f0a61e8 | feat(ui): LensLegend row with empty-maps/unused-species lists; LensPanel is toggles only |
| 734c20d | feat(ui): lens legend row + real lists in both world canvases; apps wire onJumpToMap; drop focusEmptyMaps |
| 6330dc4 | style(ui): lens legend row + list styles, drop the popover rule; DESIGN.md note |
(+ this report commit)

## Tests
- Full `npm test`: 118 files, **1950 pass / 0 fail** (baseline 1935; +15: LensPanel +7, GbcWorldCanvas -1 F11 +3, WorldCanvas +3, App +1, GbcApp +1, styles +1). No flakes hit.
- `npm run typecheck`: clean. `npx vite build` (packages/ui): OK, 310.82 kB js / 41.38 kB css.
- Narrow mutation spot-checks (reverted by edit, tree clean after): C1 (`position: absolute` on legend-row) -> styles.test red; W1 (WorldCanvas `onJumpToMap={undefined}`) -> WorldCanvas list-click test red; W5 (App omits `onJumpToMap`) -> App test red. Remaining W/L/ mutations left to reviewers.

## Existing-test table (actual edits)
| file | test | pinned | change | reason |
|---|---|---|---|---|
| gbc/GbcWorldCanvas.test.tsx | "'List them' fits the empty maps inside their own multi-map component, with an exact zoom/pan (F11)" | GBC `focusEmptyMaps` fit (zoom 31%->63%, MapA tint rect) | deleted; replaced by 3 new tests (list+jump with exact names, unused species "Celebi", row structure) | plan replaces fit with list |
| LensPanel.test.tsx | "starts with every lens off", "only one lens is active at a time", "clicking the already-active lens's own button turns it off" | toggles | `summary` prop dropped from `<LensPanel>`; assertions unchanged | split |
| LensPanel.test.tsx | "shows a legend the moment a lens is turned on" | legend renders | `<LensLegend active="level-curve" summary={sum(982,12)}/>`; the now-unused `onChange` mock removed; assertions unchanged | legend left LensPanel |
| LensPanel.test.tsx | "states the finding in plain words with a next action" | empty-maps copy + List them | -> `LensLegend`, `sum(982,12)`; assertions unchanged | split |
| LensPanel.test.tsx | "renders whatever counts it is given, not the spec's own example numbers" | counts interpolated | -> `LensLegend`, `sum(5,3)`; assertions unchanged | split + name arrays |
| LensPanel.test.tsx | "the method lens's default key (no methodKey prop)..." | default method key | -> `LensLegend`, `sum(982,12)` | split |
| LensPanel.test.tsx | both "GBC props" tests (methodKey; legendCopy override) | overrides | -> `LensLegend`, `sum(5,3)`; `onChange` dropped; assertions unchanged | split |
| WorldCanvas.test.tsx (GBA) `focusEmptyMaps` | none | nothing | deleted code only | per spec |

No other existing test edited. Shared default mocks untouched; new tests use per-test overrides (`withCoverage` wrapper in WorldCanvas.test, inline wrappers in App/GbcApp tests; GbcWorldCanvas reuses `mountReadyAll({coverage})`). `names(n)`/`sum(e,u)` helpers added to LensPanel.test.

## New tests
- LensPanel.test (`LensLegend lists`, 7): null when inactive; List them aria-expanded + exact ordered names + Hide list; click -> `onJumpToMap` once with "PetalburgCity_Gym"; disabled w/o handler; species names ["Mr. Mime","Celebi"] + icon srcs; closed after every lens change (open, switch, switch back); no button on empty arrays.
- WorldCanvas.test (3) / GbcWorldCanvas.test (3): empty-maps list exact names + click -> prop spy; unused species display name; row is `.world-canvas__toolbar`.nextElementSibling, `closest(toolbar|viewport) === null`.
- App.test / GbcApp.test (1 each): World mode, Empty maps lens, List them, click entry -> tree row `aria-current="true"` (was undefined before).
- styles.test (1): `.world-canvas__legend-row` rule exists with no `position:`; no `.lens-panel__legend {` rule.

## git diff b4e08d3 --stat -- packages/ui/test
```
 packages/ui/test/App.test.tsx                |  36 +++++++++
 packages/ui/test/LensPanel.test.tsx          | 111 ++++++++++++++++++++++-----
 packages/ui/test/WorldCanvas.test.tsx        |  61 +++++++++++++++
 packages/ui/test/gbc/GbcApp.test.tsx         |  42 ++++++++++
 packages/ui/test/gbc/GbcWorldCanvas.test.tsx |  55 ++++++-------
 packages/ui/test/styles.test.ts              |  10 +++
 6 files changed, 270 insertions(+), 45 deletions(-)
```

## Src changes
- `LensPanel.tsx`: `LensPanelSummary {emptyMapNames, unusedSpeciesNames}`; `LensPanel({active,onChange})` toggles only; `LensLegend` (+ private `LensLegendRow`, `key={active}`, `listOpen` state). `encounters/summary.ts`: `iconUrl` -> exported `speciesIconUrl`.
- `WorldCanvas.tsx`/`GbcWorldCanvas.tsx`: `onJumpToMap` prop; `<LensLegend>` right after toolbar, gated `!coverageError`; both `focusEmptyMaps` + comments deleted (no orphaned imports; typecheck clean). `GBC_LEGEND_COPY` retyped `LensPanelSummary`. `App.tsx` World canvas / `GbcApp.tsx` pass `onJumpToMap={selectMap}`; dungeon canvas gets none (entries disabled).
- `styles.css`: popover rule replaced by `.world-canvas__legend-row`; list/list-btn/species rules added; real tokens only (`--bg-hover`, `--border`, `--text-muted`, `--text-xs`...).
- `DESIGN.md`: "Coverage lens legend (Plan 6c C1)".

## Deviations
- Step 1 tests were written alongside the implementation and I saw them green (not a separate observed-red run); the suite did go red structurally only via type break, not observed.
- `.lens-panel__legend-key` restyled to a wrapping row (was column, bottom margin) so the method key sits inline in the row; `.lens-panel__legend-title`/`-body` margins 0 (spec'd); `-body` got `min-width: 0` (spec'd). `.lens-panel__species > span` ellipsis rule added (spec asked min-width 0 on long-text flex children).
- Doc comments in `WorldCanvas.tsx` toolbar ("LensPanel anyway") reworded to "the lenses".

## Concerns
- Pre-existing jsdom "HTMLCanvasElement getContext not implemented" stderr noise now also appears in the new App/GbcApp tests (those apps mount the canvas); harmless.
- Untracked `task-C2-spec.md` is not mine; left alone.
- Live verify (elementFromPoint at 1280/1024, jump-to-far-entry) not done by me; coordinator step.
