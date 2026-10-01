# Task B3 executed spec: `EncounterBorder` replaces both gutters in the world views

Plan §B3. **U1:** this is a shared component; GBA's world rendering changes too, and every GBA (and GBC)
test that is deleted or replaced is named in the report with the behaviour it pinned and where that
behaviour is now pinned (or why it no longer applies). **U4:** border side via B2's `pickBorderSide`.
Builds on B1 (`packages/ui/src/encounters/summary.ts`: `SpeciesSummary`, `SpeciesRow`, `GbaEncounterRow`,
`summariseGba`, `summariseGbc`, `matchesTime`, `rowLabel`, `displaySpeciesName`; display names are the
official punctuated ones, e.g. `Nidoran♀`, `Mr. Mime`, `Ho-Oh`, decided in B1's fix round; B1 records
are in `_archive/task-B1-*.md`) and B2 (`packages/ui/src/encounters/borderSide.ts`: `pickBorderSide(rect, neighbours: readonly Rect[], band)`,
`bandRect`, `overlapArea`, `BORDER_BAND = { gba: 4, gbc: 2 }`, `BorderSide`, `Rect`; world units are
integers, so gap = band is exactly free; B2 records in `_archive/task-B2-*.md`). Read both files first;
use their real exports.

## Ground truth (measured 2026-09-30; cite `WorldCanvas.tsx` by grep anchor, never line number)

### GBA `components/WorldCanvas.tsx` (2,125 lines)
- `TILE_PX = 16`; zoom is **screen px per world tile (metatile)**; `LOD_ZOOM_THRESHOLD = 4` (not exported).
- Encounter fetch: grep `fetch(\`/api/encounters/` — a raw `fetch` (no shape guard, no failed count),
  cache-by-ref `encounterCacheRef` (`EncounterCacheEntry { loaded, methods? }`), `encounterVersion` bump.
  Fetched for every **visible** placement regardless of the toggle; one fetch per map ever.
- `encounterEntries` memo (grep `const encounterEntries`) builds `EncounterGutterMapEntry[]` from
  `visible` with `rect = { p.x*zoom+pan.x, p.y*zoom+pan.y, size.width*zoom, size.height*zoom }`
  (`sizeOfPlacement(p, sizeByMap)`); mounted as `<EncounterGutter maps={encounterEntries} zoom={zoom} />`.
- Other readers of `EncounterGutterMapEntry["rect"]` / `EncounterGutterRow` in this file (lens overlay,
  spotlight, selection outline, `methodTintFor`): grep `EncounterGutterMapEntry` and
  `EncounterGutterRow`. They must keep working once `EncounterGutter.tsx` is deleted: switch them to
  B2's `Rect` and B1's `GbaEncounterRow`.
- Drawn set: the `visible` memo (grep `const visible = useMemo`) skips `!drawnByDefault(p) &&
  !revealedMaps.has(p.map)` unless `mapFilter` is set, then culls to the viewport. Neighbours for the
  border side must be the **drawn** set **without** the viewport cull (a map just off-screen still
  blocks a side).
### GBC `gbc/GbcWorldCanvas.tsx`
- zoom is **screen px per block**; `GBC_LOD_ZOOM_THRESHOLD = 8` (exported). Every placement is drawn
  (no visibility filter until Phase D): `visible` = all non-empty placements in the viewport.
- Encounter fetch: grep `fetchGuarded(url, isGbcEncountersPayload` — guarded, failed maps counted in
  `encounterFailedCount`, rendered as `Encounter data unavailable for N map(s)` (`role="alert"`,
  `world-canvas__toolbar-error`). Time-independent, one fetch per map ever.
- `rectByMap` memo (grep `const rectByMap`) and `gutterEntries` memo (grep `const gutterEntries`);
  mounted `<GbcEncounterGutter maps={gutterEntries} zoom={zoom} time={time} />`. `GbcEncounterGutterRect`
  is also used by the lens/spotlight memos: switch them to B2's `Rect`.
### The two gutters
- `components/EncounterGutter.tsx` (389 lines): per-method rows, `<img>` icon buttons, `ICON_SIZE 20`,
  `ICON_CAP 6`, LOD badge `"{map} · {n} species"` below the map, top-level-sibling tooltip with the long
  "Review fix" comments on `showTooltip` and the `useLayoutEffect` clear (read both before writing the
  new tooltip; they record two real bugs).
- `gbc/GbcEncounterGutter.tsx` (364 lines): text chips, time filter via `matchesTime` (now in B1's
  `summary.ts`), `chipText`.
### CSS (`styles.css`)
- `.encounter-gutter*` rules (grep `.encounter-gutter {` to the end of the `.encounter-gutter__tooltip`
  rule). Tokens `--encounter-land/water/rock-smash/fishing/headbutt` stay (lenses use them).
  `styles.test.ts` parses the sheet strictly; no `*/` inside comments.
### Sprites
- GBA `/api/species/SPECIES_X/icon.png` → 32×32 frame 0 (`renderSpeciesIcon`), transparent background.
- GBC `/api/species/X/icon.png` (B1) → 40-56 px square frame 0, **opaque white background** (every
  PerfPlus front.png is opaque; B1 spec). Render with `image-rendering: pixelated`; GBC sprites sit on a
  rounded `--bg-panel-raised` tile with a `--border` 1 px edge so the white square reads as a card, not
  a hole.

## Design (binding)

### `packages/ui/src/components/EncounterBorder.tsx` (new)
```ts
export interface EncounterBorderEntry { map: string; rect: Rect /* screen px */; side: BorderSide; summaries: SpeciesSummary[] | undefined }
export interface EncounterBorderProps {
  entries: EncounterBorderEntry[];
  zoom: number;          // screen px per world unit (GBA tile / GBC block)
  lodZoom: number;       // below this, per-map count badge (GBA 4, GBC 8)
  band: number;          // world units (BORDER_BAND.gba / .gbc)
  time?: "morn" | "day" | "nite"; // GBC app time; absent for GBA → nothing is ever dimmed
}
export function EncounterBorder(props: EncounterBorderProps): JSX.Element;
export function tooltipLines(s: SpeciesSummary): string[]; // pure, exported, unit-tested
```
- Off by default behind one toggle `Encounters` (`aria-pressed`). On → a legend (`role="note"`) that
  explains: one sprite per species on a free side of each map; **dimmed with a dashed outline = not
  encountered at the current time of day** (GBC); `+` after a level = the runtime +0-4 level buff on
  grass/surf (GBC); zoomed out shows a count. Off → nothing else renders (no legend, no sprites, no
  badges, no tooltip).
- `summaries === undefined` (loading) or `[]` (none) → nothing for that map.
- `bandPx = band * zoom`; `spritePx = Math.min(32, bandPx)`.
- **Strip geometry (exact):** one absolutely positioned strip per entry, `className
  "encounter-border__strip encounter-border__strip--<side>"`, occupying `bandRect(rect, side, bandPx)`
  in screen px (B2's `bandRect` with screen units): left `{rect.x-bandPx, rect.y, bandPx, rect.height}`,
  etc. Flex row (top/bottom) or column (left/right), no wrap, centred across the band, starting at the
  map's top/left corner. Capacity `k = Math.max(1, Math.floor(sideLenPx / spritePx))`, `sideLenPx` =
  rect.height for left/right, rect.width for top/bottom. If `summaries.length > k`, show the first
  `k-1` sprites and a `+N` chip (`encounter-border__more`, `N = summaries.length - (k-1)`); else all.
  (`k === 1` with more than one species → just the `+N` chip carrying the full count.)
- **LOD:** `zoom < lodZoom` → instead of the strip, one badge `encounter-border__badge` in the same
  band rect: text `"{map} · {n} species"` (`n = summaries.length`, all species, dimmed or not).
  `zoom === lodZoom` → sprites.
- **Sprite:** `<button type="button" className="encounter-border__sprite[ encounter-border__sprite--dimmed]"
  aria-label={summary.displayName}>` containing `<img src={iconUrl} alt="" width={spritePx}
  height={spritePx} loading="lazy" onError → visibility hidden>` (same broken-image posture as the old
  GBA gutter). **Dimmed** iff `time !== undefined && summary.availableAt !== undefined &&
  !summary.availableAt.includes(time)`. Dimmed CSS = `opacity: 0.4` **and** `outline: 1px dashed
  var(--text-muted)` (not colour alone).
- **Tooltip (`tooltipLines`)**, exact strings; percent `fmtPct(p)` = one decimal with a trailing `.0`
  dropped (`45 → "45%"`, `64.84375 → "64.8%"`, `14.84375 → "14.8%"`); level `Lv a-b`, or `Lv a` when
  equal; buff `+` appended to the level when `row.levelBuff`:
  1. `displayName`
  2. one line per row in `rows` order: `` `${row.label} ${fmtPct(row.percent)} Lv ${lv}${buff}` `` plus
     `` ` · rate ${fmtPct(rate)}` `` for non-fish rows with a `rate`, `` ` · bite ${fmtPct(rate)}` `` for
     fish rows with a `rate`. Examples (POLIWAG on Route30): `Grass · nite 20% Lv 4-8+ · rate 9.8%`,
     `Surf 75% Lv 15-24+ · rate 2%`, `Fish · Old Rod 14.8% Lv 10 · bite 50%`,
     `Fish · Good Rod · day 64.8% Lv 20 · bite 50%`; GBA `Land 20% Lv 3-5`; headbutt
     `Headbutt · rare 30% Lv 10`.
  3. if any row has `levelBuff`: `+ = level can roll up to 4 higher`.
  4. if dimmed: `Not encountered at ${time}` (the app's time word, lowercase).
  The tooltip element renders these as separate lines (`<span>` per line, `white-space: pre-line` or
  block spans). Must keep `time` in the row label (mutation: dropping `time`).
- **Tooltip mechanics:** reuse the old gutter's top-level-sibling pattern verbatim (`showTooltip` reads
  `e.currentTarget.getBoundingClientRect()` and the container's rect at hover/focus time;
  `hideTooltip(key)` only clears its own key; a `useLayoutEffect` clears it on `[enabled, collapsed,
  zoom, entries, time]`; render guarded by `enabled && !collapsed && tooltip`). Carry the two "Review
  fix" comments over in condensed form (they are why the mechanism looks the way it does).
- Root `className="encounter-border"`, `pointer-events: none`; the toggle, legend, sprites and `+N`
  opt back in. Rename CSS `encounter-gutter*` → `encounter-border*`; delete rules no longer used
  (method tags, chips, rows, rate, swatches unless the legend still uses them — it no longer lists
  methods).

### Wiring (both canvases)
- **GBA `WorldCanvas`:**
  - Encounter fetch → `fetchGuarded(url, isGbaEncountersPayload, url)` with a new guard in
    `packages/ui/src/encounters/guards.ts` (`{ methods: Array<{ method: string; rod?: string; chances:
    Array<{ species: string; percent: number; minLevel: number; maxLevel: number }> }> }`; reject a
    GBC-shaped `{ family: "gbc", sources }`). Count failures and render the same
    `Encounter data unavailable for N map(s)` alert in the GBA toolbar (mirror GBC's markup). One fetch
    per map ever, unchanged.
  - `summaryByMap` memo (deps `[encounterVersion]` only, plus whatever holds the ref) →
    `summariseGba(cache.methods)`.
  - `drawnPlacements` memo (deps on world/sizes/filter/revealed — **not** pan/zoom): the `visible` filter
    without the viewport cull. `sideByMap` memo over it: `pickBorderSide(worldRect(p), others, BORDER_BAND.gba)`.
    `ponytail:` comment: O(n²) over drawn maps (~500 GBA), fine; a spatial index if n grows.
  - `borderEntries` memo from `visible` + `sideByMap` + `summaryByMap` + screen rect →
    `<EncounterBorder entries zoom lodZoom={LOD_ZOOM_THRESHOLD} band={BORDER_BAND.gba} />`.
- **GBC `GbcWorldCanvas`:** same shape: `summariseGbc`, `sideByMap` over all placements (memo on
  `world` only), `<EncounterBorder … lodZoom={GBC_LOD_ZOOM_THRESHOLD} band={BORDER_BAND.gbc} time={time} />`.
  Keep `fetchGuarded`/`encounterFailedCount` as is.
- Delete `components/EncounterGutter.tsx`, `gbc/GbcEncounterGutter.tsx`, `test/EncounterGutter.test.tsx`,
  `test/gbc/GbcEncounterGutter.test.tsx`, and the dead CSS. `chipText` goes with the GBC gutter.

## Old tests → new homes (fill in the report; the reviewer checks every row)

Every `it` in `EncounterGutter.test.tsx` (16) and `GbcEncounterGutter.test.tsx` (the `chipText (pure)` 3
and the `GbcEncounterGutter` 15; the `matchesTime`/`rowLabel` describes already moved in B1) gets one
row: old test name → behaviour → **new test name** (file) or **"no longer applies: <reason>"**. Expected
"no longer applies" (and only these, unless you justify more): per-method row grouping, the 3-rod row
split as rows (the rods now live in each species' tooltip lines; pin that instead), method-tag labels,
`ICON_CAP 6`/`CHIP_CAP 6` and `+N more` per row (replaced by the per-side capacity `k`), `chipText`
rounding, the time **filter** hiding rows (replaced by dimming; pin that dimmed species still render).
Behaviours that must carry over with new tests: off by default; legend only while on; hover **and**
focus tooltip; tooltip is a top-level sibling (not inside a strip); toggle-off clears an open tooltip;
crossing the LOD threshold clears it; zooming without crossing clears it; badge names its map in
visible text; nothing for loading / empty; several maps each get their own strip at their own rect;
broken image hidden. Plus, in the canvas tests: one fetch per map and time-independence (the existing
GBC F3 test), the GBA-shaped payload rejection + `unavailable` note (existing GBC test), and the same
two for GBA (new).
Existing canvas tests that must change (name each, minimal edit): `GbcWorldCanvas.test.tsx` "the
Encounters toggle shows a species chip built from the real fetched sources" (text chip → a sprite
button `aria-label="Geodude"` with `img[src="/api/species/GEODUDE/icon.png"]`); the F3 test only if its
assertions read gutter DOM. No other existing test may change; `git diff <B3 base> -- packages/ui/test`
must show only these plus deletions.

## TDD steps (commit each green step)
1. `packages/ui/test/encounters/EncounterBorder.test.tsx`: `tooltipLines` exact (the POLIWAG examples
   above from B1's Route30 fixture: import or copy the fixture; GBA `Land` line; headbutt; `+` note
   present iff a buffed row; `Not encountered at morn` iff dimmed). Then the component: toggle/legend;
   exact strip rect for all 4 sides (rect `{100,100,80,60}`, zoom 8, band 2 → bandPx 16, spritePx 16:
   left strip `{84,100,16,60}`, top `{100,84,80,16}`, right `{180,100,16,60}`, bottom `{100,160,80,16}`);
   `spritePx` cap (zoom 20, band 2 → 32 not 40); capacity (left side, height 60, spritePx 16 → k 3; 5
   species → 2 sprites + `+3`); LOD at `lodZoom-1` vs `lodZoom`; dimming (Route30 at `morn`: ZUBAT
   dimmed, POLIWAG/CATERPIE not; at `nite`: CATERPIE dimmed; no `time` → none dimmed; GBA summaries →
   none dimmed); every carried-over behaviour in the table. Implement. Commit.
2. Guard + GBA wiring (`encounters/guards.ts` + test; `WorldCanvas` swap; new `WorldCanvas.test.tsx`
   tests: border renders on the side `pickBorderSide` gives for a 3-map fixture where the target's left
   is blocked → `top`; one fetch per visible map, not refetched on zoom; a GBC-shaped payload →
   `Encounter data unavailable for 1 map` and no retry). Commit.
3. GBC wiring + the named `GbcWorldCanvas.test.tsx` edit; a new GBC test: Route30-like fixture with
   `time="morn"` shows a dimmed sprite for a nite-only species. Commit.
4. Delete the gutters, their tests, dead CSS; update `DESIGN.md` (the encounter section: border, sprite
   tile, dimming, `encounter-border*` classes). Commit.
5. Gate: `npm test` (known flake `WorldCanvas.test.tsx` "pans/zooms to the given map's real
   placement…" — rerun isolated if it is the only failure), `npm run typecheck`,
   `npx vite build packages/ui`. Also `git diff <B3 base> --stat -- packages/ui/test` in the report.

## Mutations the reviewers will run
- Side order swapped in the canvas wiring (e.g. passing `right` first) → GBA canvas side test red.
- Dimming applied to the **available** species (`includes` instead of `!includes`) → red.
- Tooltip drops `time` from GBC labels → red.
- LOD `<=` instead of `<` → red.
- One fetch per map broken (cache placeholder removed) → the GBC F3 test and the new GBA test red.
- `sideByMap` memo depends on `pan` (perf regression, not correctness): reviewer checks deps by reading.

## Report
`task-B3-implementer.md`: commits; counts; gate; **the old→new test table**; the named canvas test edits
with reasons; the `git diff --stat` of `packages/ui/test`; deviations.
