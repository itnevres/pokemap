# Task C1 executed spec: lens legend row + real lists (both families)

Plan §C1, criteria 3 and 4. **U1:** both families. `LensPanel` is shared, so its tests change for both;
every existing test you edit or delete is named in the report with its reason (table below is the
expected set). Cite `WorldCanvas.tsx` by grep anchor, never by line number.

## Ground truth (measured 2026-10-01 at `b4e08d3`)

- `components/LensPanel.tsx` (142 lines): `LensPanelSummary = { emptyMaps: number; unusedSpecies: number }`
  (counts only). `LensPanel({ active, onChange, summary, onListEmptyMaps?, methodKey?, legendCopy? })`
  renders the 4 toggles **and** the legend (`.lens-panel__legend`, `role="note"`) in one root. The
  empty-maps legend's "List them" button calls `onListEmptyMaps`. Unused species has no list at all.
- Count sources: both canvases pass `coverageData?.mapsWithoutEncounters.length ?? 0` and
  `coverageData?.unusedSpecies.length ?? 0`. The payloads **do** carry both arrays:
  - GBA `/api/coverage` = core `coverage()` (`core/src/analyse/coverage.ts`: `mapsWithoutEncounters: string[]`,
    `unusedSpecies: string[]`). Live on the subject: 982 empty maps (all 982 have world placements),
    730 unused species (`SPECIES_ABOMASNOW`, …).
  - GBC `/api/coverage` = `gbcCoverage()` (`core/src/gbc/analyse/atlas.ts`), same two arrays, guarded by
    `isGbcCoveragePayload` (`gbc/guards.ts`, already checks both are string arrays). PerfPlus: 266 empty,
    70 unused (`CELEBI`, …; pinned in `atlas.test.ts`).
- `focusEmptyMaps` exists twice:
  - GBA `components/WorldCanvas.tsx`, grep `const focusEmptyMaps = useCallback` (plus the long comment
    above it). Fits the empty maps that sit in a multi-map component. **No test pins it** (grep
    `list them` in `test/WorldCanvas.test.tsx`: 0 hits).
  - GBC `gbc/GbcWorldCanvas.tsx`, grep `const focusEmptyMaps = useCallback`. Pinned by exactly one test,
    `test/gbc/GbcWorldCanvas.test.tsx` "'List them' fits the empty maps inside their own multi-map
    component, with an exact zoom/pan (F11)".
- Where the legend renders today: inside the toolbar's `world-canvas__toolbar-group--grow` group, as an
  absolute popover (`.lens-panel__legend`: `position: absolute; z-index: 6; top: calc(100% + space-2);
  right: 0; width: 280px`). It drops into the viewport's top-right corner, where `EncounterBorder`'s own
  `Encounters` toggle sits (`.encounter-border__control`: absolute top/right `--space-3` inside
  `.world-canvas__viewport`). **Measured live, GBA world, Empty maps lens on:** at 1280 and at 1024 px
  wide, `document.elementFromPoint` at the toggle's centre returns `.lens-panel__legend-body`. The
  toolbar does not overflow at either width (`scrollWidth === clientWidth`), so no `flex-wrap` change.
- `.world-canvas` is a column flex; the toolbar, then the static `.world-canvas__legend` row
  (Conflict/Dive/Emerge), then `.world-canvas__body`. `.map-canvas__legend` is the row style to copy.
- Jumping already exists app-side: `App.tsx` `selectMap(name)` (tree click: dirty confirm, `setSelected`,
  bumps `selectVersion`; WorldCanvas gets `jumpToMap={selected} jumpToken={selectVersion}`), and
  `GbcApp.tsx` `selectMap(name)` (sets `selected` + `jumpTarget`, bumps `selectVersion`). Both canvases'
  jump effects centre the map and flash the outline; GBA's also reveals a placed-but-hidden map.
- Species helpers: `encounters/summary.ts` has `displaySpeciesName(species)` (exported; strips
  `SPECIES_`, official-name table, else Title Case) and a module-private
  `iconUrl = (s) => /api/species/${encodeURIComponent(s)}/icon.png` (same route for both families).
- `test/styles.test.ts` parses the sheet with lightningcss and regex-matches rules
  (`/\.species-spotlight\s*\{[^}]*position:\s*relative/`).

## Design (binding)

### 1. `LensPanel.tsx`: split toggles from legend
- `LensPanelSummary` becomes `{ emptyMapNames: string[]; unusedSpeciesNames: string[] }`. The counts are
  their `.length`s. Keep the doc comments' "interpolated, never hardcoded" point.
- `LensPanel({ active, onChange })`: the toggles only (`summary`, `onListEmptyMaps`, `methodKey`,
  `legendCopy` leave it). Markup of the toggle group unchanged.
- New export `LensLegend({ active, summary, onJumpToMap?, methodKey?, legendCopy? })`, same file, reusing
  `LENS_LABEL`/`LEGEND_COPY`/`METHOD_LENS_KEY`:
  - `active === null` → renders `null`.
  - Root: `<div className="world-canvas__legend-row" role="note">` containing the existing
    `lens-panel__legend-title`, `lens-panel__legend-body`, the method key (unchanged), and the actions.
  - `LEGEND_COPY` strings unchanged except the counts read `s.emptyMapNames.length` /
    `s.unusedSpeciesNames.length`.
  - List state: `LensLegend` returns `active === null ? null : <LensLegendRow key={active} … />`, and the
    private `LensLegendRow` holds `const [listOpen, setListOpen] = useState(false)`. The `key` remounts
    the row on every lens change, so a list always starts closed (lens switch, or off then on). No
    reset effect (RESUME Phase B lesson: a reset effect runs a render late).
  - Empty maps (only when `emptyMapNames.length > 0`): `<button className="lens-panel__legend-action"
    aria-expanded={listOpen}>` reading "List them" / "Hide list". When open:
    `<ul className="lens-panel__list" aria-label="Maps with no encounters">`, one
    `<li><button type="button" className="lens-panel__list-btn" disabled={!onJumpToMap}
    onClick={() => onJumpToMap?.(name)}>{name}</button></li>` per name, in payload order.
  - Unused species (only when `unusedSpeciesNames.length > 0`): same action button reading "Show list" /
    "Hide list". When open: `<ul className="lens-panel__list lens-panel__list--species"
    aria-label="Unused species">`, one `<li className="lens-panel__species"><img src={speciesIconUrl(s)}
    alt="" width={24} height={24} loading="lazy" /><span>{displaySpeciesName(s)}</span></li>` per
    species, in payload order. Not buttons: there is nothing to jump to.
  - Export the URL helper from `encounters/summary.ts` as `speciesIconUrl` (rename the private `iconUrl`
    and use it internally). Don't write a second copy.
- Update the component doc comment: the legend is now a row the canvas renders, not this component's
  own popover; the "no lens active without its legend" rule is now the caller's (both canvases render
  `LensLegend` with the same `lens` state they give `LensPanel`).

### 2. Both canvases (`WorldCanvas.tsx`, `GbcWorldCanvas.tsx`)
- New optional prop `onJumpToMap?: (name: string) => void`, documented: "a lens list entry was clicked;
  the app selects the map and jumps there (tree-click path)".
- In the toolbar: `<LensPanel active={lens} onChange={setLens} />` (still inside the `coverageError ?`
  ternary, so a coverage failure still hides the toggles).
- Directly after the toolbar `</div>` and before `.world-canvas__legend`:
  `{!coverageError && <LensLegend active={lens} summary={{ emptyMapNames: coverageData?.mapsWithoutEncounters ?? [], unusedSpeciesNames: coverageData?.unusedSpecies ?? [] }} onJumpToMap={onJumpToMap} />}`
  (GBC also passes `methodKey={GBC_METHOD_LENS_KEY} legendCopy={GBC_LEGEND_COPY}`; retype
  `GBC_LEGEND_COPY` with `LensPanelSummary`).
- Delete both `focusEmptyMaps` callbacks with their comment blocks, and any import/helper that becomes
  unused only because of that deletion (typecheck tells you). Nothing else in the canvases changes.

### 3. Apps
- `App.tsx`: the World-mode `<WorldCanvas key="world" …>` gets `onJumpToMap={selectMap}`. The dungeon
  `WorldCanvas` gets nothing (its list entries render disabled: a world jump means nothing inside a
  dungeon view; this replaces the old known-wrong world-wide fit there).
- `GbcApp.tsx`: `<GbcWorldCanvas … onJumpToMap={selectMap} />`.

### 4. CSS (`styles.css`) and `DESIGN.md`
- Delete the `.lens-panel__legend` popover rule (only that exact selector; the `-title`/`-body`/`-key`/
  `-item`/`-swatch`/`-action` rules stay). Add `.world-canvas__legend-row` with `.map-canvas__legend`'s
  declarations (`flex: 0 0 auto; display: flex; flex-wrap: wrap; gap; padding; background:
  var(--bg-panel); border-bottom; color: var(--text-secondary)`) plus `align-items: center` and
  `font-size: var(--text-xs)` (the legend is prose, so one step larger than the swatch row's 2xs),
  **in flow: no `position`**. Title/body/key/action sit inline; title and body
  margins become 0.
- `.lens-panel__legend-body` and any element with long text get `min-width: 0` (flex children).
- `.lens-panel__list`: `flex: 1 0 100%; max-height: 40vh; overflow-y: auto; margin: 0; padding: 0;
  list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:
  var(--space-1)`. `.lens-panel__list-btn`: full-width, left-aligned, transparent, `--border` 1px,
  `--text-secondary`, hover `--bg-hover`/`--text-primary`, `:disabled` muted with `cursor: default`,
  `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
  `.lens-panel__species`: inline-flex, `align-items: center`, `gap: var(--space-1)`, `min-width: 0`.
  Real tokens only (see `:root`); no `.btn`.
- `DESIGN.md`: a short "Coverage lens legend" note: the legend is a row below the world toolbar
  (`world-canvas__legend-row`, styled like `map-canvas__legend`), never a popover, so it covers nothing;
  the lists, their classes, and that a list entry jumps like a tree click.

## TDD steps (commit each green step)
1. `LensPanel.test.tsx` first (red), then `LensPanel.tsx` + `speciesIconUrl` export. New tests:
   - `LensLegend` renders nothing with `active={null}`;
   - "List them" has `aria-expanded="false"`, then the list shows **exactly** the fixture names in
     order (`["Route1", "PetalburgCity_Gym", "Interior9"]` → the buttons' text, `toEqual`), and the
     button reads "Hide list" with `aria-expanded="true"`;
   - clicking the second entry calls `onJumpToMap` once with `"PetalburgCity_Gym"`;
   - without `onJumpToMap` every entry is `.disabled === true`;
   - unused species `["SPECIES_MR_MIME", "CELEBI"]` → "Show list" → names `["Mr. Mime", "Celebi"]` and
     `img.getAttribute("src")` `/api/species/SPECIES_MR_MIME/icon.png`, `/api/species/CELEBI/icon.png`;
   - per-lens list state: open the empty-maps list, rerender with `active="unused-species"` → the
     species list is closed ("Show list", no `ul`), rerender back to `"empty-maps"` → the map list is
     closed too ("List them", no `ul`);
   - no list button when the array is empty.
   Existing tests: adapt to the split and the new summary shape (see the table). Commit.
2. Canvases + apps. New tests (each through the canvas or app, not the component alone; RESUME B3
   lesson):
   - `WorldCanvas.test.tsx` (GBA): coverage fixture with 2 of the file's own placed map names in
     `mapsWithoutEncounters` and `["SPECIES_MR_MIME"]` in `unusedSpecies` (a per-test fetch override;
     don't edit the shared default mock). Empty maps lens → "List them" → exact names; clicking one
     calls the `onJumpToMap` prop spy with it. Unused species → "Mr. Mime". Structure:
     `document.querySelector(".world-canvas__toolbar")!.nextElementSibling` is the
     `.world-canvas__legend-row`, and the row is not inside `.world-canvas__toolbar` or
     `.world-canvas__viewport` (`closest(...) === null`).
   - `GbcWorldCanvas.test.tsx`: the same three, with `mapsWithoutEncounters: ["MapA"]` and
     `unusedSpecies: ["CELEBI"]` → "Celebi".
   - `App.test.tsx` (GBA): in World mode, open the Empty maps lens, "List them", click an entry → that
     map's tree row has `aria-current="true"`.
   - `GbcApp.test.tsx`: the same.
   Delete the F11 test and both `focusEmptyMaps`. Commit.
3. CSS + `styles.test.ts`: a test that `.world-canvas__legend-row`'s rule exists and has no
   `position:` declaration, and that no `.lens-panel__legend {` rule remains. `DESIGN.md`. Commit.
4. Gate: `npm test` with output captured to a file (known load-only flakes: `gbcRoutes` `/api/where`
   DUNSPARCE timeout; `GbcApp` "palette highlight resets…"; rerun one alone before calling it a
   regression), `npm run typecheck`, `npx vite build` in `packages/ui`. Report
   `git diff b4e08d3 --stat -- packages/ui/test`.

## Existing tests expected to change (name each actual one in the report)
| File | Test | Pinned | Change and reason |
|---|---|---|---|
| `gbc/GbcWorldCanvas.test.tsx` | "'List them' fits the empty maps inside their own multi-map component, with an exact zoom/pan (F11)" | GBC `focusEmptyMaps`: landmass filter, zoom 31%→63%, MapA's tint rect | **Deleted**: the plan replaces the fit with a list. Replaced by the step-2 GBC list tests |
| `LensPanel.test.tsx` | "starts with every lens off", "only one lens is active at a time", "clicking the already-active lens's own button turns it off" | toggles | `summary` prop removed from `LensPanel` (the split). Assertions unchanged |
| `LensPanel.test.tsx` | "shows a legend the moment a lens is turned on", "states the finding in plain words with a next action", "renders whatever counts it is given…", "the method lens's default key…", both "GBC props" tests | legend copy, counts, method key, overrides | Render `LensLegend` (the legend left `LensPanel`); fixtures carry name arrays of the same lengths (982/12, 5/3; build them with a small `names(n)` helper). Assertions unchanged |
| GBA `focusEmptyMaps` | none | nothing | Deleted code, no test (measured) |

Any other existing-test edit is a deviation: stop and report it instead.

## Mutations the reviewers will run (wiring first, B3 lesson)
- W1 `WorldCanvas` doesn't pass `onJumpToMap` to `LensLegend` → GBA canvas list-click test red.
- W2 `WorldCanvas` passes `unusedSpecies` as `emptyMapNames` (swap) → GBA exact-names test red.
- W3/W4 the same two in `GbcWorldCanvas` → GBC canvas tests red.
- W5 `App.tsx` omits `onJumpToMap={selectMap}` → App test red. W6 the same in `GbcApp.tsx`.
- W7 `LensLegend` moved back inside the toolbar's grow group (GBA) → row-structure test red. W8 GBC.
- L1 the `key={active}` on `LensLegendRow` removed (list state survives a lens change) → per-lens list
  test red.
- L2 the species list shows raw constants (no `displaySpeciesName`) → names test red.
- L3 a count reads the wrong array → "renders whatever counts…" red.
- C1 `.world-canvas__legend-row { position: absolute }` → `styles.test.ts` red.

## Live verify (coordinator, after review): criteria 3 and 4, both families
Empty maps "List them" → click a far entry → the view jumps there and the tree row is current; unused
species shows names (and icons). With a lens legend open, `elementFromPoint` at the `Encounters`
toggle's centre returns the toggle, at 1280 and 1024 px, with `scrollWidth === clientWidth`.

## Report
`task-C1-implementer.md`: commits; test counts; gate; the existing-test table filled with the real
edits; deviations.
