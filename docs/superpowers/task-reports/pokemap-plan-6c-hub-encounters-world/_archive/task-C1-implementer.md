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

# Fix round (coordinator items 1-11, base `8ac538c`)

Commits: 4c62196 (component + LensPanel tests), 84cc393 (canvases + canvas tests), 787d1bb + b6e6e50 (app tests), 49afdc2 (CSS/comments/DESIGN.md). Red-proofs: new tests run against old behaviour (in-memory mutation by byte-swap script, original bytes restored, tree clean after each) or, where old code already failed them, the pre-fix run.

| # | item | commit | tests | red-proof |
|---|---|---|---|---|
| 1 | `summary: LensPanelSummary \| null`; null -> title + "Loading coverage…", no counts/buttons/key; canvases pass `coverageData ? {…} : null` | 4c62196, 84cc393 | LensPanel "a null summary (coverage not loaded)…"; WorldCanvas + GbcWorldCanvas "while coverage is still loading, a lens shows 'Loading coverage…'…" | LensPanel: red pre-fix (TypeError on null). Canvases: `: null` -> `: {[],[]}` => both canvas tests red |
| 2 | `!coverageError` gate pinned | 84cc393 | both canvases "a coverage failure after a lens was clicked removes the legend row and shows the error" | gate -> `true &&`: red in both |
| 3 | no row without a lens | 84cc393 | both canvases "no legend row until a lens is on, and none again once it is turned off" | `active={lens ?? "level-curve"}`: red in both |
| 4 | Hide list closes | 4c62196 | LensPanel "List them toggles…" and "unused species list shows…" extended (Hide list -> no `ul`, `aria-expanded="false"`, label back to List them / Show list) | `setListOpen(true)` (X3): both red |
| 5 | list jump asserts the canvas jump | 787d1bb, b6e6e50 | App + GbcApp list-entry tests: `.world-canvas__jump-highlight` present; App also first tree-clicks Route1 so the second jump must remount the token-keyed highlight (a first jump alone fires on token 0 even without a bump, so the first version missed X14) | X14 (App `setSelected(n)`): first version GREEN, fixed, then red; X14b (GbcApp `selectMapFromWorld`): red |
| 6 | no `onJumpToMap` -> no List them button; `disabled` attr + `:disabled` CSS dropped | 4c62196, 787d1bb, 49afdc2 | LensPanel "without onJumpToMap there is no List them button (nothing to jump to)" (replaces my "…every entry is disabled"); App "in Dungeon mode (no jump target) the Empty maps lens offers no List them button" | pre-fix red (button existed); X4 (dungeon canvas gets `onJumpToMap`): red |
| 7 | species lens never shows maps list | 4c62196 | LensPanel "the species lens never shows the maps list, even with empty maps present" | X16 (drop `active === "empty-maps"` on maps list): red |
| 8 | plurals | 4c62196 | LensPanel "singular counts read 'map has' / 'species appears'; other counts keep the plural copy" (1/1/0); canvas row tests now match `/1 map has/` | pre-fix red (`1 maps have`) |
| 9 | `title` on map button + species span; `img {flex: 0 0 auto}`; `aria-label="Coverage lens legend"`; `text-align: left` dropped; `.lens-panel{position:relative}` dropped (grep: nothing anchors to it, only toggles inside) | 4c62196, 49afdc2 | LensPanel "map entries carry the full name as a title", species test title assertion, "the legend row is a named note" | pre-fix red (all three); CSS items untested (no behaviour test) |
| 10 | stale comments -> LensLegend: GbcWorldCanvas (4 refs), `gbc/guards.ts`, `gbc/hooks/useGbcCoverage.ts`, WorldCanvas unused-species tint note, styles.css key comment, LensPanel.test comment | 4c62196, 49afdc2 | n/a | n/a |
| 11 | GBC level-curve row shows GBC copy | 84cc393 | GbcWorldCanvas "the level-curve lens row carries GBC's own legend copy…" | `legendCopy` dropped at canvas: red |

Also: DESIGN.md updated (hide-not-disable, loading, title, plurals). Species singular copy: "1 species appears in no encounter table. It may still be a gift, static or trade." (n≠1 byte-identical to before.)

Full suite: **118 files, 1963 pass / 0 fail** (1950 + 13: LensPanel +5, WorldCanvas +3, GbcWorldCanvas +4, App +1; disabled->hidden swap is net 0). `npm run typecheck` clean; `npx vite build` OK (311.07 kB js / 41.29 kB css).

## Existing-test edits this round (pre-existing = not added in C1)
| file | test | change | reason |
|---|---|---|---|
| LensPanel.test.tsx | "states the finding in plain words with a next action" | **added `onJumpToMap={() => {}}`**; assertions unchanged | beyond the expected comment-only: it asserts the "List them" button with no handler, which decision 6 now hides. Unavoidable consequence; flagging as a deviation |
| LensPanel.test.tsx | comment above "renders whatever counts…" | `({ emptyMaps: 982, unusedSpecies: 12 })` -> `` (`sum(982, 12)`) `` | item 10 (comment only) |
Everything else touched this round is a C1-added test (title/null/plural assertions, my "disabled" test replaced, `/1 maps have/` -> `/1 map has/`, `onJumpToMap` added to my own list tests).

Concerns: copy "Click to list them." in the empty-maps legend still shows in the dungeon view where there is no list action (n≠1 copy must stay exact per item 8); say so if you want it conditional.
