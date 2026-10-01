# Task C1 spec-compliance review (lens legend row + real lists, GBA + GBC)

Reviewed `f0a61e8`, `734c20d`, `6330dc4` vs spec `5bf61ec`; report `dfb2691` treated as claims. HEAD `361744e` (docs only).

## Verdict: ✅ compliant

Every Design item is in place as written. U1 held. All 13 spec mutations red. 9 findings: 5 Low + 4 Info, all test gaps or cosmetic. None blocks merge.

## Design check (re-derived from code)
| Item | Status |
|---|---|
| `LensPanelSummary {emptyMapNames, unusedSpeciesNames}`; "interpolated, never hardcoded" doc kept | ✅ |
| `LensPanel({active,onChange})` toggles only; toggle-group markup unchanged | ✅ |
| `LensLegend` → `null` / `<LensLegendRow key={active}>`; `useState(false)`, no reset effect | ✅ |
| Root `div.world-canvas__legend-row[role=note]` holding title/body/method key/actions; copy reads `.length` | ✅ |
| Empty maps: `lens-panel__legend-action[aria-expanded]` "List them"/"Hide list", only when length>0; `ul.lens-panel__list[aria-label="Maps with no encounters"]` > `li > button.lens-panel__list-btn[type=button][disabled={!onJumpToMap}]`, payload order | ✅ |
| Unused species: "Show list"/"Hide list"; `ul.lens-panel__list.lens-panel__list--species[aria-label="Unused species"]` > `li.lens-panel__species > img[src=speciesIconUrl, alt="", 24x24, lazy] + span(displaySpeciesName)` | ✅ |
| `summary.ts` `iconUrl` renamed to exported `speciesIconUrl`, used internally; no second copy | ✅ |
| Component doc comment updated (row, caller owns the "no lens without legend" rule) | ✅ |
| Both canvases: `onJumpToMap?` prop documented; `<LensPanel active onChange/>` still inside the `coverageError ?` ternary; `{!coverageError && <LensLegend …/>}` right after toolbar `</div>`, before `.world-canvas__legend`; GBC passes `methodKey`/`legendCopy`; `GBC_LEGEND_COPY` retyped `LensPanelSummary` | ✅ |
| Both `focusEmptyMaps` + comment blocks deleted; no orphaned imports (`useCallback`/`componentOfPlacement`/`worldBoundsOf`/`computeFit`/`fitAllBounds`/`Placement`/`GBC_ZOOM_BOUNDS`/`emptyMapNames` all still used; typecheck clean) | ✅ |
| `App.tsx` world `WorldCanvas` `onJumpToMap={selectMap}`; dungeon `<WorldCanvas key="dungeon" mapFilter={mapFilter} />` gets none; `GbcApp.tsx` `onJumpToMap={selectMap}` | ✅ |
| CSS: `.lens-panel__legend {` deleted (only that selector); `.world-canvas__legend-row` = map-canvas__legend decls + `align-items:center` + `--text-xs`, no `position`; title/body margin 0; body `min-width:0`; `.lens-panel__list` / `-list-btn` (hover `--bg-hover`/`--text-primary`, `:disabled` `--text-muted` + `cursor:default`, ellipsis + `min-width:0`) / `.lens-panel__species` per spec; all tokens defined in `:root`; no `.btn` | ✅ (minor extras: SR-F8) |
| `DESIGN.md` "Coverage lens legend (Plan 6c C1)" note: row not popover, classes, list behaviour, entry jumps like a tree click | ✅ |

## U1: `git diff b4e08d3 -- packages/ui/test`
Edits to existing tests are exactly the table's:
- `GbcWorldCanvas.test.tsx`: F11 test deleted, 3 new tests in its place.
- `LensPanel.test.tsx`: 3 toggle tests (`summary` dropped). The legend tests "shows a legend…", "states the finding…", "renders whatever counts…", "the method lens's default key…" and both "GBC props" tests now render `LensLegend` with a `sum()` fixture; the unused `onChange` mocks are gone.
- Assertions unchanged. Every other test file only appends. No other existing-test edit. ✅

## Mutations (node byte-swap runner: anchor asserted ×1, original bytes restored and byte-compared, `git diff --name-only` checked == mutated set before/after each)
| ID | Change | Result | Red test(s) |
|---|---|---|---|
| W1 | GBA canvas drops `onJumpToMap` on LensLegend | RED | WorldCanvas "Empty maps: 'List them' lists coverage's own names in order and a click calls onJumpToMap" |
| W2 | GBA swaps the two arrays | RED | WorldCanvas: all 3 C1 tests |
| W3 | GBC drops `onJumpToMap` | RED | GbcWorldCanvas "Empty maps lens: 'List them' … calls onJumpToMap" |
| W4 | GBC swaps arrays | RED | GbcWorldCanvas: all 3 C1 tests |
| W5 | App omits `onJumpToMap={selectMap}` | RED | App "clicking an Empty maps list entry in World mode selects that map…" |
| W6 | GbcApp omits it | RED | GbcApp same-named test |
| W7 | GBA LensLegend moved into toolbar grow group | RED | WorldCanvas "the legend is a row directly after the toolbar…" |
| W8 | GBC same | RED | GbcWorldCanvas "the legend is a row directly after the toolbar…" |
| L1 | `key={active}` removed | RED | LensPanel "a list starts closed after every lens change" |
| L2 | raw species constants | RED | LensPanel species list + both canvas "Unused species" tests |
| L3 | empty-maps count reads `unusedSpeciesNames` | RED | LensPanel "states the finding…", "renders whatever counts…", "legendCopy override…" |
| L3b | unused count reads `emptyMapNames` | RED | "renders whatever counts…" |
| C1 | `position: absolute` on `.world-canvas__legend-row` | RED | styles "keeps the lens legend an in-flow row…" |
| X1 | map list `.sort()` | RED | LensPanel "List them toggles … in order"; WorldCanvas list test |
| X1b | species list `.sort()` | RED | LensPanel species list test |
| X2 | `aria-expanded` removed | RED | LensPanel list tests (both) |
| X3 | toggle → `setListOpen(true)` (Hide list never closes) | **GREEN** | none (SR-F3) |
| X4 | dungeon WorldCanvas gets `onJumpToMap={selectMap}` | **GREEN** | none (SR-F5) |
| X5 | img src not `speciesIconUrl` | RED | LensPanel species list test |
| X6 / X6b | canvas `active={lens ?? "level-curve"}` (row with no lens), GBA / GBC | **GREEN / GREEN** | none (SR-F2) |
| X7 / X7b | `!coverageError` gate → `true`, GBA / GBC | **GREEN / GREEN** | none (SR-F1) |
| X8 | `disabled={false}` | RED | LensPanel "without onJumpToMap every entry is disabled" |
| X8b | `disabled={true}` | RED | LensPanel click test + both canvas list tests |
| X9 / X9b | length>0 guard dropped (maps / species) | RED / RED | LensPanel "has no list button when the array is empty" |
| X10 | `role="note"` dropped | RED | LensPanel "shows a legend the moment a lens is turned on" |
| X11 | label never "Hide list" | RED | LensPanel list tests |
| X12 | GBC drops `methodKey` | RED | GbcWorldCanvas "the method lens's own legend key uses the GBC methodKey…" |
| X12b | GBC drops `legendCopy` | **GREEN** | none (SR-F9, pre-existing) |
| X13 / X13b | element inserted between toolbar and row | RED / RED | both "directly after the toolbar" tests |
| X14 | App passes `(n) => setSelected(n)` (no jump bump) | **GREEN** | none (SR-F4) |
| X14b | GbcApp passes `selectMapFromWorld` (no jump) | **GREEN** | none (SR-F4) |
| X15 | `.lens-panel__legend { position: absolute }` re-added | RED | styles test |
| X16 | maps-list gate drops `active === "empty-maps"` | **GREEN** | none (SR-F6) |

All 13 spec IDs (W1–W8, L1–L3, C1) present and red. No anchor misses, no restore mismatch, no contamination. Tree clean before and after; untracked `task-C1-quality-review.md` belongs to the other reviewer and was left alone.

## Findings
- **SR-F1 Low (test gap)**: `WorldCanvas.tsx` / `GbcWorldCanvas.tsx`, grep `{!coverageError && (`. The gate is unpinned (X7/X7b green), and it is reachable: the toggles render while coverage is still loading, so a lens can be on when the fetch then fails. Without the gate the row would show "0 maps have no encounters", the exact regression the toolbar's own "Review fix" comment describes. Fix: in each canvas test, a coverage fetch that rejects after a lens is clicked → `.world-canvas__legend-row` is null and the error text shows.
- **SR-F2 Low (test gap)**: the canvas wiring `active={lens}` for the null case is unpinned (X6/X6b green). Only `LensLegend` alone is tested. Fix: in each canvas test, after mount assert `document.querySelector(".world-canvas__legend-row")` is null; click the active lens off again, still null.
- **SR-F3 Low (test gap)**: `LensPanel.tsx`, grep `setListOpen((o) => !o)`. "Hide list" closing the list is never exercised (X3 green). Fix: in the "List them toggles…" test, click "Hide list", then expect no `ul` and `aria-expanded="false"`.
- **SR-F4 Low (test gap)**: App / GbcApp C1 tests pin only `aria-current` on the tree row, so wiring a non-jumping setter passes (X14/X14b green). Criterion 3's "view jumps there" rests on live verify only. Fix: also assert the jump side effect each app already tests for tree clicks (e.g. the canvas's jump-flash outline / centred pan). Otherwise the coordinator's live verify must explicitly check the camera moves.
- **SR-F5 Low (test gap)**: App.tsx, grep `<WorldCanvas key="dungeon"`. Spec'd "dungeon gets none → entries disabled" is unpinned (X4 green). Fix: an App test in Dungeon mode with an empty map in coverage → list entries `disabled`.
- **SR-F6 Info**: `LensPanel.tsx`, grep `listOpen && active === "empty-maps"`. Dropping the lens check (X16) shows an empty maps list under the species lens; not caught because the species test's `emptyMapNames` is `[]`. Fix: in "a list starts closed…" or the species test, open the species list with a non-empty map array → `queryByRole("list", {name: "Maps with no encounters"})` null.
- **SR-F7 Info (stale comments)**:
  - `GbcWorldCanvas.tsx`, grep `` `LensPanel`'s own `methodKey` `` / `` `LensPanel`'s own `legendCopy` `` (×4 refs): these props are now `LensLegend`'s.
  - `LensPanel.test.tsx`, grep `({ emptyMaps: 982, unusedSpecies: 12 })`: names the old summary shape.
  - Fix: reword to `LensLegend` / `sum(982, 12)`.
- **SR-F8 Info (undeclared CSS extras)**: `.world-canvas__legend-row` uses `gap: var(--space-1) var(--space-3)` (map-canvas__legend: `var(--space-3)`) and keeps `text-align: left` from the old popover. `.lens-panel { position: relative }` (the old popover anchor) is now purposeless. All harmless; the tighter row-gap is sensible. Fix optional: declare them, or drop `text-align` and the orphan `position: relative`.
- **SR-F9 Info (pre-existing)**: GBC canvas `legendCopy={GBC_LEGEND_COPY}` wiring is unpinned at canvas level (X12b green). This gap was already open at `b4e08d3`, where only LensPanel.test used that copy. Out of C1 scope; note for a later task.
- Not flagged: the WorldCanvas C1 tests use a local `WORLD2` (Alpha/Beta) instead of the file's default fixture names. This is equivalent and the payload order is non-alphabetical (`["Beta","Alpha"]`), which is good.

## Declared deviations judged
| Deviation | Judgement |
|---|---|
| Step-1 red not separately observed | Accept. Process only; the mutations prove the tests have teeth (all spec IDs red). |
| `.lens-panel__legend-key` column → wrapping row, margin 0 | Accept. Needed for the key to sit inline in a row; a column would stack the row tall. |
| `.lens-panel__species > span` ellipsis rule | Accept. It delivers the spec's `min-width: 0` on the long-text flex child intent. |
| WorldCanvas toolbar comment "LensPanel anyway" → "the lenses" | Accept. Accurate, comment only; keeps the comment true after the split. |

## Gate
- `npm test` (alone): **118 files, 1950 pass / 0 fail**, no flakes.
- `npm run typecheck`: clean (exit 0).
- `npx vite build` (packages/ui): OK, 310.82 kB JS / 41.38 kB CSS.
