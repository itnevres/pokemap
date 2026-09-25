# Plan 6b Task 2: executed spec

**Task:** the GBC world and atlas routes, `/api/world`, `/api/encounters/:map`, `/api/where/:species`, `/api/coverage` and `/api/species`, in `packages/server/src/gbcRoutes.ts`.

**Builds on:**
- Task 1a, whose reports are in `_archive/task-1a-*.md`.
- Task 1b. Read `task-1b-implementer.md` and its reviews, which are archived once 1b passes. The existing `gbcRoutes.ts` structure is your convention reference.

**Ground rules:** exactly as in `_archive/task-1a-spec.md`:
- the decomps are read-only;
- commit hygiene, including the trailers;
- the GBA gate against `baseline-fails.txt`;
- the Plan 0 §7 test rules;
- in corpus tests, hooks go inside `describe.skipIf`;
- confirm with `--reporter=verbose` that the corpus tests ran.

Don't touch `packages/server/src/index.ts`.

## Deliverables

### 1. Core: one species normaliser

Move `normalizeSpecies` out of `packages/cli/src/gbcCommands.ts` (l. 234) into `packages/core/src/gbc/analyse/atlas.ts`, exported as `normalizeGbcSpecies(input)`. It uppercases, then strips a leading `SPECIES_` (the result is uppercased first, so any casing of the prefix goes).

- `gbcCommands.ts` imports it, and its behaviour stays unchanged. Its existing CLI tests must stay green without edits.
- Add unit tests in core for `"dunsparce"`, `"SPECIES_DUNSPARCE"`, `"species_dunsparce"` and `"DUNSPARCE"`.

### 2. Wire types in `packages/core/src/gbc/wire.ts` (types only)

```ts
import type { Placement, Component, Conflict } from "./world/connections.js";
import type { GbcEncounterSource } from "./analyse/atlas.js";
export interface GbcWorldPayload {
  family: "gbc";
  blockPx: 32;
  placements: Record<string, Placement>;   // keyed by map name; units are BLOCKS
  components: Component[];
  conflicts: Conflict[];
}
export interface GbcEncountersPayload {
  mapName: string;
  sources: GbcEncounterSource[];
  defects: DataDefect[];                   // proj.wild().defects (the kanto_grass terminator)
}
```

Check the import paths against the real re-exports; `gbc/world/connections.ts` re-exports the GBA types.

### 3. Routes

These go ahead of the 501/404 fall-through, and must not collide with 1a's refusal regex. `/api/species` alone is **not** refused, but `/api/species/X/icon.png` still is.

| Route | Behaviour |
|---|---|
| `GET /api/world` | `buildGbcWorld(proj)`, computed once (lazy, cached for the process, like the GBA `worldCache` doc comment explains). `placements` goes from `Map` to `Object.fromEntries`. Satisfies `GbcWorldPayload`. Query params are ignored: GBC has no `?dungeons=`. |
| `GET /api/encounters/:map` | Capture with `(.+)`, then decode. An unknown map is a 404. Otherwise `{ mapName, sources: gbcEncounterSources(proj, name), defects: proj.wild().defects }`. A map with no encounters is a 200 with `sources: []`. That is real data, not an error. |
| `GET /api/where/:species` | Capture with `([^/]+)`, the GBA convention, and decode. Returns `gbcWhereSpecies(proj, normalizeGbcSpecies(s))`, a bare `GbcSpeciesHit[]`. The GBA `/api/where` also returns a bare array, and `SpeciesSpotlight` consumes that shape. An unknown species is a 200 with `[]`, like GBA. |
| `GET /api/coverage` | `gbcCoverage(proj)`, cached once. Returns `GbcCoverage` unchanged; `levelByMap` already carries `mapName`. |
| `GET /api/species` (exact) | `loadGbcSpeciesConstants(proj.root)`, cached once. A sorted array of bare names. |

**Measure before you pin.** Plan review §11 says `buildGbcWorld` takes about 2 ms, coverage about 11 ms, and `where` 9-36 ms. Measure these again. If `where` is slow, don't cache it per species: GBA doesn't, and the reason is documented in `index.ts`.

## Tests

All in `packages/server/test/gbcRoutes.test.ts`. Put them in their own `describe` block inside the corpus-guarded suite, and keep your additions in a separate block from the 1b tests.

- **`/api/world`**
  - It deep-equals `Object.fromEntries(buildGbcWorld(openGbcProject(root)).placements)`, computed in the test.
  - It has 326 components, and exactly 3 of them have more than one map. Measure these counts again from the core output, then pin them as literals.
  - It has exactly 2 conflicts, and each conflict's `map` is pinned. The review says Route17 and Route18; confirm that.
  - `blockPx === 32`.
  - `placements.NewBarkTown` has width 10 and height 9.
  - A second request returns deep-equal data. The cache must not mutate anything.
- **`/api/encounters`**
  - A grass route (pick one, and pin it from the core function) has exactly the source list `gbcEncounterSources` returns.
  - Pin at least one source's tags and its first chance literally, by reading `data/wild/johto_grass.asm` in the test.
  - Within every grass/water source, the chance percents sum to 100 ± 0.05.
  - A map with no encounters, NewBarkTown's `PlayersHouse1F` or ElmsLab, returns `sources: []`.
  - `/api/encounters/NoSuchMap` is a 404.
  - `defects` names `kanto_grass.asm`. The findings doc documents this as the one terminator defect.
- **`/api/where`**
  - `DUNSPARCE`, `dunsparce` and `SPECIES_DUNSPARCE` all return the same array.
  - Every hit has `mapName === "DarkCaveVioletEntrance"`, and there is at least one hit. Measure these, then pin the exact hit count.
  - `/api/where/NOTAMON` returns `[]`.
- **`/api/coverage`**
  - Deep-equals `gbcCoverage(openGbcProject(root))`.
  - Pin `mapsWithEncounters` and `unusedSpecies.length` as literals. Get them first from `npx tsx packages/cli/src/index.ts --project <PerfPlus> coverage --json`.
- **`/api/species`**
  - Sorted.
  - Contains `CHIKORITA`, and nothing in it starts with `SPECIES_`.
  - `NO_MON` and `EGG` are absent.
  - Its length equals `loadGbcSpeciesConstants(root).length`, pinned as a literal.
- **Refusal regression**
  - `/api/species/CHIKORITA/icon.png` is still 501.
  - `/api/species` is now 200. Update the 1a test that pinned it as 404.

## Mutation checks

Record each result in the report.

1. Return `/api/where` without normalisation.
2. Strip only an uppercase `SPECIES_` prefix before uppercasing.
3. Return world placements as `[]`. Serialising a raw `Map` to JSON gives `{}`, so test that with the real code path.
4. Drop `conflicts` from the world payload.
5. Return `gbcEncounterSources` for the wrong map, for example with the name lowercased.
6. Make an unknown map in encounters return 200 with `[]`.
7. Remove `EGG` from the exclusion by reverting to all constants.
8. Make the `/api/species` route match `/api/species/*`, so it shadows the icon refusal.

## Report

Write `task-2-implementer.md` with the same sections as 1b:
- what was built;
- the commits;
- test counts;
- the gate result;
- the mutation table;
- the timing measurements;
- a live `curl` summary. Start the server, then **kill it** and confirm port 5174 is free.
- any deviations.
