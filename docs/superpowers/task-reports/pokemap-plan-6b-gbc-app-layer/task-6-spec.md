# Plan 6b Task 6: executed spec

Encounter lenses, gutter and species spotlight for GBC, inside `GbcWorldCanvas`.

**Read first:**
- the plan: Q2 (reuse `LensPanel`/`SpeciesSpotlight` with additive props), Q3 (the time matching rule), Task 6 and criterion 3;
- `_archive/task-2-*.md`, for the `/api/encounters`, `/api/where`, `/api/coverage` and `/api/species` contracts;
- Task 5's report;
- `EncounterGutter.tsx`, `LensPanel.tsx`, `SpeciesSpotlight.tsx`, and `WorldCanvas.tsx` l. 880-1110 (encounter cache, lens tints, spotlight dim).

**Ground rules:** as in Task 3. GBA components change **only** where this spec lists an additive change. Every existing GBA test must stay green **unchanged**. That is the proof the defaults preserve GBA behaviour.

**Conventions established in Task 3's fix round:** GBC-specific hooks live in `packages/ui/src/gbc/hooks/`, and family-agnostic ones in `src/hooks/`. Every fetch goes through Task 3's shared guarded-fetch helper (read `_archive/task-3-implementer.md` for its name and location). `guards.ts` has `isRecord` for building new guards. Don't hand-roll another fetch, then guard, then error block.

**Notes from the Task 5 quality review (binding):**
- **The encounter cache is time-independent: one fetch per map, ever.** Don't copy the image cache's clear-on-`time` effect in `GbcWorldCanvas`; filtering by time happens client-side at render.
- **Build a memo of screen-space rects,** separate from the imperative draw effect, the way `WorldCanvas` does for its gutter and lens entries. Feed the gutter and lens overlays from it.
- **Mount `SpeciesSpotlight` and `LensPanel` in a toolbar group using the existing themed class** (`world-canvas__toolbar-group--grow`, as in `WorldCanvas`). Don't invent a bespoke width.
- **When you cite `WorldCanvas.tsx`, cite a grep-able anchor, not a line number.** Its line numbers have already drifted.

## Facts (measured)

**Source shape.** `GbcEncounterSource = { method: "grass"|"water"|"fish"|"headbutt"|"rock", time?, rod?, list?, conditional?: "swarm", encounterRate?, biteChance?, chances: [{ species, percent, minLevel, maxLevel }] }`.
- `percent` sums to 100 within each source.
- Levels are **base** levels. Grass and water get +0..+4 at runtime (`GRASS_WATER_LEVEL_BUFF_MAX`).

**Time tags:**
- grass: `morn`, `day`, `nite`;
- fish: only `day`/`nite`, and **old-rod fish sources carry no time at all**;
- water, headbutt and rock: untagged.

**Matching rule.** Verified against `engine/events/fish.asm:80-82` (`ld a,[wTimeOfDay] / cp NITE_F`): anything other than nite uses the day entry. For app time T:
- grass matches when `time === T`;
- fish with `time === "day"` matches when T is morn or day;
- fish with `time === "nite"` matches when T is nite;
- untagged sources always match.

**`/api/where`** returns bare `GbcSpeciesHit[]`, each with a `mapName`. `/api/species` returns bare names such as `CHIKORITA`.

**`SpeciesSpotlight.tsx:118-123`** only matches `SPECIES_`-prefixed names, so its dropdown never opens against the bare GBC list.

**`/api/coverage`:**
- `levelByMap: [{ mapName, averageLevel }]`, the **unweighted** mean across sources;
- `mapsWithoutEncounters: string[]`;
- `unusedSpecies: string[]` (70 of them);
- `mapsWithEncounters` = 125.

## Deliverables

### 1. Additive GBA-component changes (defaults unchanged)

**a. `SpeciesSpotlight`: a prefix-agnostic matcher**
- Compare `s.replace(/^SPECIES_/, "")` against the query with its `SPECIES_` stripped, using `startsWith` as before.
- For GBA, where every entry has the prefix, the result set is identical.
- Loosen `onHits`' type to a generic `<H extends { mapName?: string }>`, or a structural `{ mapName?: string }[]`, so `GbcSpeciesHit` fits without a cast.
- The where-request prefixing (`SPECIES_` added before the fetch) can stay: the GBC server normalises it. Confirm that by reading the code.
- New test: against a bare list, `"chiko"` shows `CHIKORITA`.
- A GBA test must pin that `"pika"` still matches `SPECIES_PIKACHU`. Add it if none exists.

**b. `LensPanel`: optional props**
- `methodKey?: Array<{ slug: string; label: string }>`, defaulting to today's `METHOD_LENS_KEY`.
- `legendCopy?: Partial<Record<LensId, (s) => string>>`, merged over `LEGEND_COPY`.
- Swatch classes stay `lens-panel__legend-swatch--${slug}`. Add CSS for `--fish` and `--headbutt`, and add a `--encounter-headbutt` token to `styles.css`. Document the token in `DESIGN.md` under the encounter group, with the same no-light-override reasoning as its siblings. Pick a hue distinct from every existing overlay token, and say which you checked.
- New tests: GBC props render the GBC key and copy. Default rendering must stay byte-identical, which the existing tests pin.

### 2. `GbcEncounterGutter.tsx` (new, GBC-only)

**Props:** `{ maps: Array<{ map; rect; sources: GbcEncounterSource[] | undefined }>, zoom, time }`, where zoom is px/block.

It mirrors `EncounterGutter`'s structure and CSS classes:
- off by default behind an "Encounters" toggle;
- a legend when on;
- `pointer-events` as in the GBA version;
- collapses to a species-count badge below the LOD threshold of 8 px/block.

**Rows:** time-filtered sources (the matching rule), grouped in the order grass, water, fish, headbutt, rock. Each row has:
- **A label with tags:** `Grass · morn`, `Surf`, `Fish · Good Rod · day`, `Fish · Old Rod`, `Headbutt · rare`, `Rock Smash`, and ` · swarm` when conditional.
- **Rate or bite chance:** `encounterRate` or `biteChance`, when present, as `12.5%` in muted data type.
- **Up to 6 species chips:** a text chip (no icon, since GBC has no per-species icons) reading `Name 30% Lv 3-5`. It appends `+` to the level for grass and water, for the runtime buff; the legend explains the `+`. Past 6, show `+N more`.

**Tooltip on chip focus/hover:** the full `describeChance` equivalent, using the same tooltip mechanics as `EncounterGutter` (read its long comment on why the tooltip is a top-level sibling).

Keep the pure helpers exported and unit-tested: `matchesTime(source, time)`, `rowLabel(source)` and `chipText(chance, method)`.

### 3. `GbcWorldCanvas` integration

**Encounter cache.** Lazily fetch `/api/encounters/:map` for visible placements. Cache by ref, one fetch per map ever; it is time-independent, since filtering is client-side. Validate the payload with `isGbcEncountersPayload` (`family === "gbc"`, `sources` an array), added to `gbc/guards.ts`.

**The gutter** is mounted over the viewport, as `WorldCanvas` does.

**`LensPanel`** is mounted with:
- `methodKey = [Water (surfing), Fish, Headbutt, Rock Smash]`;
- `legendCopy`:
  - level-curve: "Colour is the average encounter level: an unweighted mean of each source's average. Blue is low, red is high.";
  - method: "Which maps reward surfing, fishing, headbutting trees or rock smash.";
- `summary` from `/api/coverage`, with its own error slot. `useGbcCoverage` gets a guard.

**Lens tints:**
- level-curve: the same colour ramp as `WorldCanvas`'s `levelColorByMap` (read it, and reuse the helper if it's exported, or export it additively);
- empty-maps: `--warn`;
- method: the first match in precedence **water > fish > headbutt > rock**, from the cached sources.
  - Grass is never a tint.
  - A fish source counts only if the map is in the encounters payload at all. The server already drops fishing on waterless maps (the Task 12 atlas rule), so there is no extra client logic.

**`SpeciesSpotlight`** is mounted and dims non-matching maps with `--overlay-spotlight-dim`, as `WorldCanvas` does. Hits are keyed by `mapName`.

## Tests (jsdom + pure)

- **`matchesTime`:** the full truth table, including old-rod untagged, fish `day` at morn, and grass `morn` not at day.
- **`rowLabel` and `chipText`:** exact strings.
- **Gutter:** the fixture sources render only the rows matching `time`, and switching `time` changes the rows. Pin the exact label list.
- **Method tint precedence:** a pure function, `methodTint(sources)`, pinned for combinations.
- **Guards:** every clause.
- **`SpeciesSpotlight` and `LensPanel`:** the tests from §1.

## Live verify (required; plan success criterion 3)

With the `--gbc` server and Vite running:
1. In World view, turn on the method lens and take a screenshot. Water/fish maps should be tinted, and grass-only routes untinted.
2. Turn on Encounters, zoom to Route 29/30, and take screenshots at Day and at Morn. The grass rows should differ, and fish rows should appear at Morn via the `day` tag.
3. Type `dunsparce` in the spotlight: the dropdown should show `DUNSPARCE`. Pick it, and take a screenshot showing exactly DarkCaveVioletEntrance lit and everything else dimmed.
4. Turn on the level-curve lens and take a screenshot.

Then the GBA smoke check: the GBA world view, with the encounter gutter and the method lens working. Take a screenshot.

**Look at every screenshot.** Save them as `screens/task-6-*.png`. Kill all processes, and check that ports 5173 and 5174 are free.

## Mutation checks (record them in the report)

1. `matchesTime` treats morn as never matching fish.
2. Old-rod untagged fish filtered out.
3. Method precedence swaps fish and water.
4. Matcher reverted to prefix-only.
5. `LensPanel` default `methodKey` changed. GBA tests must go red.
6. The gutter shows grass for every time.
7. Drop the `+` buff marker.
8. The encounters guard accepts a GBA-shaped `{ methods }` payload.

## Report

`task-6-implementer.md`, with the usual sections plus the live-verify narrative and the screenshot paths.
