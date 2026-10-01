# Task B4 executed spec: encounters in the map view (both families)

Plan §B4. **U1:** both families. **U4:** in the map view, where there is no layout, a side is blocked when
the map has a connection on it. Builds on B1 (`encounters/summary.ts`), B2 (`encounters/borderSide.ts`:
`borderSideFromConnections`, `gbaDirToCompass`, `BORDER_BAND`) and B3 (`components/EncounterBorder.tsx`,
`encounters/guards.ts` `isGbaEncountersPayload`; GBC's `isGbcEncountersPayload` is in `gbc/guards.ts`).
Read those files first; use their real exports. B1-B3 records are in `_archive/` (B3's fix round made
`+N` a focusable button with its own tooltip, and a dimmed sprite's `aria-label` reads
"<name>, not encountered at <time>"; DESIGN.md's "Encounter border" section deliberately does not yet
say the map views mount it: B4 adds that line).

## Ground truth (measured 2026-10-01)

- `EncounterBorder` props today: `{ entries, zoom /* screen px per world unit */, lodZoom, band /* world
  units */, time? }`. It owns its own `Encounters` toggle (`aria-pressed`) and legend (`role="note"`),
  off by default. That suits the world views, where the toggle floats over the viewport. In the map view
  the plan puts the toggle **in the canvas's Overlays group**, so the component needs a controlled mode.
- `components/MapCanvas.tsx` (GBA, 961 lines):
  - `Toggles` state (`NO_TOGGLES`) is reset to all-off on every `mapName` change (grep
    `setToggles(NO_TOGGLES)`).
  - Overlays group `<div className="map-canvas__toggles" role="group" aria-label="Overlays">` holds
    Grid / Collision / Elevation / Events.
  - `anyOverlay` drives **both** the overlay recomposite and the `.map-canvas__legend` row.
  - The image is drawn at `(pan.x, pan.y)`, size `pixelWidth*zoom × pixelHeight*zoom`. `pixelWidth`
    includes one ring of border metatiles (`BORDER_RINGS = 1`), and zoom ∈ {1,2,4} is screen px per
    native px. One world unit (metatile) = 16 native px.
  - `fit()` picks the largest level whose `pixelWidth*level`/`pixelHeight*level` fits the viewport and
    centres the image.
  - `data.map.connections: Array<{ map, offset, direction: "up"|"down"|"left"|"right"|"dive"|"emerge" }>`.
  - Also rendered read-only by `WarpDestinationModal` (`<MapCanvas mapName data />`).
  - **Do not touch** `applyZoom`/`setZoom`/`setPan`: the StrictMode zoom bug (follow-up D1) is fixed in
    E1, not here. `fit()` only sets zoom and pan side by side; extend it the same way.
- `gbc/GbcMapCanvas.tsx` (543 lines):
  - single `view = { zoom, pan }` state;
  - `BORDER_RINGS = 1`; one world unit (block) = 32 native px;
  - `fit()` calls `setView({ zoom, pan })`;
  - same Overlays group with Grid / Collision / Events;
  - same per-map toggle reset;
  - takes `time`;
  - `data.map.connections[].direction` is already compass (`north|south|east|west`).
- `.map-canvas__viewport` is `position: relative; overflow: hidden` (styles.css), so the border mounts
  inside it, as in the world view.
- Existing tests reach the toggles by accessible name (e.g. `MapCanvas.test.tsx` "every overlay toggle
  starts off…"). Adding a fifth button breaks none of them. **B4 expects zero existing-test edits;** any
  you need must be named with a reason.

## Design (binding)

### 1. `EncounterBorder` controlled mode
- Add `enabled?: boolean`.
  - `undefined` (world views) → unchanged: it owns the toggle and the legend.
  - Defined → it renders **no toggle and no legend**; `enabled` alone decides whether
    strips/badges/tooltips render. The caller owns the toggle and the legend.
- The tooltip-clear `useLayoutEffect` keys on the effective enabled value.
- Tests (in `EncounterBorder.test.tsx`):
  - `enabled={true}` renders the strip with no click, and no `Encounters` button exists;
  - `enabled={false}` renders nothing;
  - flipping `enabled` true→false clears an open tooltip.

### 2. Shared fetch hook `packages/ui/src/encounters/useMapEncounterSummaries.ts`
```ts
export function useMapEncounterSummaries(mapName: string, family: "gba" | "gbc", enabled: boolean):
  { summaries: SpeciesSummary[] | undefined; error: string | null };
```
- Per-instance cache `useRef(new Map<string, SpeciesSummary[] | { error: string }>())`. **Not**
  module-level: a project switch remounts the app, and a module cache would serve the old project's data.
- Fetch only when `enabled` and `mapName` isn't cached. Use `fetchGuarded(url, guard, url)`, with
  `isGbaEncountersPayload` → `summariseGba(d.methods)` or `isGbcEncountersPayload` → `summariseGbc(d.sources)`.
- A placeholder is written synchronously before the fetch (the world views' cache-by-ref pattern), so a
  re-render or re-toggle never double-fetches. One fetch per map per canvas instance, time-independent.
- A version counter state triggers the re-render on arrival.
- A late response for a map that is no longer current is cached but doesn't change what's shown
  (`summaries` is always read for the current `mapName`).
- Failure → `error` = the guarded fetch's message, cached so it isn't retried.
- Tests (`useMapEncounterSummaries.test.tsx`, `renderHook` from Testing Library):
  - no fetch while `enabled` is false;
  - exactly one fetch after enabling, and none after toggling off and on again;
  - switching map then back fetches each map once;
  - a GBC-shaped payload for `family: "gba"` → `error` set, and not retried;
  - the summaries equal `summariseGba`/`summariseGbc` of the fixture.

### 3. `MapCanvas` (GBA) and `GbcMapCanvas` (GBC)
- `Toggles` gains `encounters: false`. It resets per map like the others; consistent, and the fetch is
  per map anyway.
- A fifth button `Encounters` (`map-canvas__btn`, `aria-pressed`) goes last in the Overlays group.
- `encounters` does **not** join `anyOverlay`'s recomposite: the border is DOM, not canvas pixels.
  The legend row shows when `anyOverlay || toggles.encounters`.
- Legend item when on: GBA `Encounters: hover a sprite`. GBC
  `Encounters: dimmed = not at <time>, + = level can roll up to 4 higher`. On a hook error, the item
  shows the error text instead, with `role="alert"`.
- Side:
  - GBA: `borderSideFromConnections(new Set(data.map.connections.map(c => gbaDirToCompass(c.direction)).filter(Boolean)))`.
  - GBC: the same over `c.direction` directly.
  - Memoised on the map's connections.
- Mount `<EncounterBorder enabled={toggles.encounters} entries={[{ map: mapName, rect, side, summaries }]}
  zoom={zoom * UNIT} lodZoom={0} band={BORDER_BAND.<family>} time={time /* GBC only */} />` inside
  `.map-canvas__viewport`, after the stage canvas.
  - `UNIT` = 16 (GBA) or 32 (GBC).
  - `rect = { x: pan.x, y: pan.y, width: pixelWidth*zoom, height: pixelHeight*zoom }`: the **drawn image,
    border ring included**, so sprites never cover map or border-block pixels.
- **Margin:** while `toggles.encounters` is on, `fit()` sizes the content as the image plus one band
  (`bandNative = band * UNIT` native px) on the chosen side. Candidates fit
  `(pixelWidth + extraW) * level` and `(pixelHeight + extraH) * level`, where `extraW = bandNative` for
  left/right and `extraH` for top/bottom. Centre the content, then offset the image's pan by
  `bandNative*z` when the side is left (x) or top (y).
  - Toggling on doesn't re-fit (the user's view is kept). The `Fit` button and the first fit after an
    image load use it.
  - Keep `fit` a plain `setZoom`+`setPan` (GBA) or `setView` (GBC); never a setter inside an updater.

## TDD steps (commit each green step)
1. Controlled mode in `EncounterBorder` + its 3 tests. Commit.
2. The hook + its tests. Commit.
3. `MapCanvas` (GBA): new tests in `MapCanvas.test.tsx`:
   - `Encounters` `aria-pressed` false → true;
   - no `/api/encounters/` fetch before the click, one after (fetch mock call count);
   - a fixture with `up`+`down` connections → `.encounter-border__strip--left` (north/south → left);
   - its exact rect from the test's own pixel sizes, after `Fit` with the toggle on: derive the
     numbers by hand in a comment;
   - a fixture with `left`+`up` connections (`west`+`north`: left and top blocked) →
     `.encounter-border__strip--right`;
   - toggling encounters on does not recomposite (`putImageData` count unchanged).
   Commit.
4. `GbcMapCanvas`: the same tests (`north`+`south` → left), plus `time="morn"` with a nite-only species
   → `.encounter-border__sprite--dimmed`, and the GBC legend text. Commit.
5. CSS only if needed (reuse `encounter-border*`). `DESIGN.md`: one line that the map view hosts the
   same border, with its toggle in the Overlays group. Commit.
6. Gate: `npm test` (known load-only flakes: `gbcRoutes` `/api/where` DUNSPARCE timeout; `GbcApp`
   "palette highlight resets…"; rerun alone if one is the only failure), `npm run typecheck`,
   `npx vite build packages/ui`. `git diff <B4 base> --stat -- packages/ui/test` in the report.

## Mutations the reviewers will run
- The hook fetches eagerly (ignores `enabled`) → "no fetch before the click" red.
- The cache placeholder is removed (refetch on re-toggle) → hook test red.
- The side ignores connections (always `left`) → the `right` fixture red.
- `gbaDirToCompass` bypassed (raw GBA directions passed through) → GBA side test red.
- `fit` ignores the band → the exact-rect test red.
- `encounters` joins `anyOverlay` → the recomposite test red.
- Controlled mode still renders the internal toggle → controlled test red.

## Live verify (coordinator, after review): criterion 2, both families
World: GBC Route30 sprites on the left; hover shows name, %, method, time, levels, rod/tree class;
at Morn, nite-only species dimmed but present; GBA world shows the same border with GBA icons. Map
view: the toggle exists in both families and the border draws on the connection-free side.

## Report
`task-B4-implementer.md`: commits; counts; gate; existing tests touched (expected none); deviations.
