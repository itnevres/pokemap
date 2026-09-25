# Plan 6b Task 2: implementer report

Executed against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-2-spec.md`, on branch `plan-6b-gbc-app-layer`, working directly in the repo (no worktree). Builds on Task 1a/1b (`_archive/task-1a-*.md`, `_archive/task-1b-implementer.md` including its Fix round 1), whose `gbcRoutes.ts` thin-dispatch-plus-exported-builder shape (`buildGbcGroupsPayload`, `buildGbcMapPayload`, `parseTimeParam`, `decodeMapName`) this task's own routes and builders follow directly.

## What was built

**1. `packages/core/src/gbc/analyse/atlas.ts`**: `normalizeSpecies` moved out of `packages/cli/src/gbcCommands.ts` and exported as `normalizeGbcSpecies(input)` -- uppercases first, then strips a leading `SPECIES_` (so any casing of the prefix is stripped too). `gbcCommands.ts` now imports it instead of declaring its own copy; `runGbcWhere`'s own behaviour and its existing CLI tests are unchanged.

**2. `packages/core/src/gbc/wire.ts`**: two new types-only interfaces, `GbcWorldPayload` (`family`, `blockPx: 32`, `placements: Record<string, Placement>`, `components`, `conflicts`) and `GbcEncountersPayload` (`mapName`, `sources: GbcEncounterSource[]`, `defects: DataDefect[]`), importing `Placement`/`Component`/`Conflict` from `./world/connections.js` (which re-exports the GBA types, confirmed by reading the file) and `GbcEncounterSource` from `./analyse/atlas.js`.

**3. `packages/server/src/gbcRoutes.ts`**: five new routes, ahead of the 501/404 fall-through, none colliding with `GBA_ONLY_ROUTE_RE` (checked by reading the regex: it only matches `world/placement$`/`world/dungeons$`, never bare `world`, and `species/[^/]+/icon.png$`, never bare `species`):

| Route | Behaviour |
|---|---|
| `GET /api/world` | `buildGbcWorldPayload(getWorld())`, where `getWorld()` lazily caches `buildGbcWorld(proj)` for the process (mirrors GBA's own `worldCache`). `placements` goes `Map` -> `Object.fromEntries`. Query params ignored (no `?dungeons=` on GBC). |
| `GET /api/encounters/:map` | Capture `(.+)`, decode with `decodeMapName` (400 on a malformed escape), 404 on an unknown map, otherwise `buildGbcEncountersPayload(proj, name)` = `{ mapName, sources: gbcEncounterSources(proj, name), defects: proj.wild().defects }`. A map with no encounters is 200 with `sources: []`. |
| `GET /api/where/:species` | Capture `([^/]+)`, also run through `decodeMapName` (see Deviations), then `gbcWhereSpecies(proj, normalizeGbcSpecies(species))`, a bare array. Unknown species -> 200 `[]`, never cached per-species (mirrors GBA's own documented reason: no single "the one answer" to cache when the input varies). |
| `GET /api/coverage` | `gbcCoverage(proj)`, lazily cached once for the process. |
| `GET /api/species` (exact match) | `loadGbcSpeciesConstants(proj.root)`, lazily cached once; already sorted by the loader itself. |

`buildGbcWorldPayload(world: GbcWorld)` and `buildGbcEncountersPayload(proj: GbcProject, name: string)` are exported, pure, unit-testable functions, following Task 1b's own `buildGbcGroupsPayload`/`buildGbcMapPayload` pattern -- `createGbcServer`'s own dispatch for all five routes stays one-line-per-route.

**4. Tests**: `packages/server/test/gbcRoutes.test.ts` gains a new "Task 2" section (5 `describe` blocks, kept separate from the 1b tests above it), plus one existing 1a/1b near-miss test updated from 404 to 200 per the spec's own instruction. `packages/core/test/gbc/analyse/atlas.test.ts` gains a `normalizeGbcSpecies` describe block (4 cases: `"dunsparce"`, `"DUNSPARCE"`, `"SPECIES_DUNSPARCE"`, `"species_dunsparce"`).

## Measured numbers (re-measured myself, not copied from the spec's prose)

Measured directly against `/root/pokemap-corpus/pokecrystal-PerfPlus` via a scratch script calling the core functions, then cross-checked the coverage numbers against the CLI:

```
$ npx tsx packages/cli/src/index.ts --project /root/pokemap-corpus/pokecrystal-PerfPlus coverage --json
mapsWithEncounters 125
unusedSpecies.length 70
```

- `buildGbcWorld`: **326 components**, exactly **3 multi-map** (sizes 35, 31, 2; 391 - 35 - 31 - 2 = 323 singletons) -- matches `packages/core/test/gbc/world/connections.test.ts`'s own already-pinned corpus number ("places all 391 maps into 326 components: 35+31+2 multi-map, 323 singletons").
- **2 conflicts**, on `Route17` and `Route18` -- matches that same test file's pinned conflict list.
- `placements.NewBarkTown`: width 10, height 9 (matches `GbcMap.width/height`, also pinned in Task 1b's own `/api/map` test).
- `gbcWhereSpecies(proj, "DUNSPARCE")`: **6 hits**, all on `DarkCaveVioletEntrance`.
- `loadGbcSpeciesConstants(root).length`: **251**, sorted, contains `CHIKORITA`, excludes `NO_MON`/`EGG`.
- `gbcCoverage`: `mapsWithEncounters` **125**, `unusedSpecies.length` **70** (cross-checked against the CLI's own `--json` output above).
- `Route29` (johto_grass.asm's `ROUTE_29` entry): exactly 5 sources (grass morn/day/nite + headbutt common/rare, no water/fish/rock); the morn source's first chance is `PIDGEY` at 45% -- pinned against the raw `data/wild/johto_grass.asm` text (`db 2, PIDGEY` as the first morn slot line) read directly in the test, not just against the core function's own output.

**Timings** (three warm runs each, real corpus):
- `buildGbcWorld`: **~1-7ms** (matches the plan review's "~2ms" estimate).
- `gbcWhereSpecies` (single species): **~11-19ms** (within the plan review's "9-36ms" range).
- `gbcCoverage`: **~100-157ms** -- notably higher than the plan review's own "~11ms" estimate. Re-measured multiple times to rule out a one-off JIT-warmup fluke; the number stayed in that range across three fresh `openGbcProject` calls. This doesn't change the design (still cached once per process, same as `getWorld()`/`getSpecies()`), but I'm flagging the discrepancy rather than silently repeating the spec's number as if I'd confirmed it. `gbcWhereSpecies` is comfortably fast enough that "don't cache it per species" (the spec's own instruction, matching GBA's documented reasoning) was never in question either way.

## Commits

- `c5b386d` -- `refactor(core): move normalizeSpecies to gbc/analyse/atlas.ts as normalizeGbcSpecies`
- `e7142f4` -- `feat(server): add GBC world/encounters/where/coverage/species routes`

## Test counts

- Before this task: 1347 passing, 6 known baseline failures (Task 1b fix round 1's final state).
- After: **1369 passing**, same 6 baseline failures. Net **+22**: `gbcRoutes.test.ts` went from 49 to 67 `it`s (+18, including the one 1a/1b near-miss test rewritten from 404 to 200 rather than removed), `atlas.test.ts` gained 4 (`normalizeGbcSpecies`).
- `--reporter=verbose` on both targeted files confirms every test, including every corpus-backed one, actually **ran** (no `skipped`) -- PerfPlus is present at `/root/pokemap-corpus/pokecrystal-PerfPlus`.

## Gate result

```
npm test 2>&1 | tee .../t2-test.log
grep -E "^ FAIL " t2-test.log | sort -u
```
`diff` against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/baseline-fails.txt` is empty (matches exactly, the same 6 pre-existing failures, unrelated to GBC: `engine.test.ts` x2, `blocks.test.ts` x2, `render/layout.test.ts`, `server/test/world.test.ts`).

`Tests 6 failed | 1369 passed (1375)` -- 1347 + 22 = 1369. ✓

`npm run typecheck` (`tsc --noEmit` on both `tsconfig.base.json` and `packages/ui/tsconfig.json`): clean, no output.

## Mutation table

Every mutation was applied to the real source, confirmed red against a targeted `vitest run ... --reporter=verbose`, then restored from `git show HEAD:<path>` (saved once to a scratch file, `cp`'d back, and `git diff`/`git status --short` confirmed empty after every single restore).

| # | Mutation | Verdict | Killed by |
|---|---|---|---|
| 1 | Return `/api/where` without normalisation | KILLED | "DUNSPARCE, dunsparce and SPECIES_DUNSPARCE all return the same array" -- `dunsparce`/`SPECIES_DUNSPARCE` return `[]` while `DUNSPARCE` still returns 6 hits |
| 2 | Strip only an uppercase `SPECIES_` prefix before uppercasing (`normalizeGbcSpecies`: check prefix, then uppercase, instead of uppercase-then-check) | KILLED | the new core unit test "uppercases first, so a lower-case species_ prefix is stripped too" |
| 3 | Return world placements as the raw `Map` (not `Object.fromEntries`'d) -- serialises to `{}` over the real HTTP/JSON code path | KILLED | the main `/api/world` HTTP test ("deep-equals ... blockPx 32") -- `body.placements` came back `{}` instead of the populated object. (The direct-unit `buildGbcWorldPayload` test also caught it, confirming the gap exists at both layers.) |
| 4 | Drop `conflicts` from the world payload (hardcode `[]`) | KILLED | "exactly 2 conflicts, on Route17 and Route18" |
| 5 | Call `gbcEncounterSources` for the wrong map (`name.toLowerCase()`) | KILLED | throws (`unknown map route29; not listed in ...`), surfacing as a 500 -- caught by 4 different `/api/encounters` tests at once (Route29's source list, both empty-map tests, and the defects test) |
| 6 | Make an unknown map in `/api/encounters` return 200 with `[]` instead of 404 | KILLED | "404s an unknown map" (`/api/encounters/:map`) |
| 7 | Remove `EGG` from `loadGbcSpeciesConstants`'s exclusion set (revert to `["NO_MON"]` only) | KILLED | both the pre-existing core test ("excludes EGG and the second const_def block's UNOWN_* letter forms") and the new `/api/species` route test (`length` no longer 251, `EGG` present) |
| 8 | Make `/api/species` match with `.startsWith("/api/species")` instead of `===`, so it shadows the icon refusal | KILLED | 3 tests: the 501-refusal test for `/api/species/CHIKORITA/icon.png`, and both regex-anchor near-miss tests (`icon.pngx`, `A/B/icon.png`) |

8 of 8 mutations run; **8 KILLED, 0 survive**. `git status --short` and `git diff` were empty after every single restore, independently re-checked at the end of the whole sequence.

## Live curl check

Started `npx tsx packages/server/src/serve.ts --gbc` in the background (reads `pokemap.config.json`'s `gbc.projectPath`), curled one of each new route plus the still-refused icon route, then killed the process and confirmed port 5174 is free.

```
$ npx tsx packages/server/src/serve.ts --gbc
pokemap server (gbc) on http://127.0.0.1:5174 for /root/pokemap-corpus/pokecrystal-PerfPlus

$ curl -s http://127.0.0.1:5174/api/world
status=200 size=68858
  -> blockPx=32 components=326 conflicts=2
  -> placements.NewBarkTown = {"map":"NewBarkTown","x":175,"y":251,"width":10,"height":9,"component":0}

$ curl -s http://127.0.0.1:5174/api/encounters/Route29
status=200
  -> ...,"defects":[{"file":"data/wild/kanto_grass.asm","message":"...no \"db -1\" terminator found..."}]}

$ curl -s http://127.0.0.1:5174/api/encounters/PlayersHouse1F
status=200
  -> {"mapName":"PlayersHouse1F","sources":[],"defects":[...]}

$ curl -s http://127.0.0.1:5174/api/encounters/NoSuchMap
status=404
  -> {"error":"no map NoSuchMap"}

$ curl -s http://127.0.0.1:5174/api/where/dunsparce
status=200
  -> [{"mapName":"DarkCaveVioletEntrance","mapConst":"DARK_CAVE_VIOLET_ENTRANCE","method":"grass","time":"morn","conditional":"swarm","percent":45,...}, ...]

$ curl -s http://127.0.0.1:5174/api/where/NOTAMON
status=200
  -> []

$ curl -s http://127.0.0.1:5174/api/coverage
status=200 size=19906
  -> mapsWithEncounters=125 unusedSpecies.length=70

$ curl -s http://127.0.0.1:5174/api/species
status=200 size=2587
  -> len=251 first="ABRA" containsCHIKORITA=true

$ curl -s http://127.0.0.1:5174/api/species/CHIKORITA/icon.png
status=501
  -> {"error":"/api/species/CHIKORITA/icon.png is not supported for gbc (pokecrystal-family) projects yet"}

$ pkill -f "packages/server/src/serve.ts --gbc"
$ pgrep -af "serve.ts"     # no serve.ts process left (only the pgrep command's own wrapper matched)
$ node -e "require('net').createServer().listen(5174,'127.0.0.1',...)"   # "port 5174 is FREE"
```

## Deviations from the spec, and why

1. **`buildGbcWorldPayload` takes only `world: GbcWorld`, not `(proj, world)`.** The spec's own prose lists the signature as `buildGbcWorldPayload(proj, world)`, matching the general "builder takes proj first" shape of `buildGbcGroupsPayload(proj)`/`buildGbcMapPayload(proj, map)`. But nothing in the world payload's construction (`Object.fromEntries` plus a spread of `components`/`conflicts`) reads anything from `proj` -- every field comes from the already-built `world`. Since there's no proj-dependent logic here (unlike `buildGbcMapPayload`, which calls `proj.tileset(...)`/`proj.collisionInfo()`), I dropped the unused parameter rather than carry a dead argument just to match the letter of the spec's signature list. Not a behavior change -- the test suite calls it the same way either way (`buildGbcWorldPayload(world)`), and I noted this explicitly so it can be reviewed.
2. **`/api/where/:species` also runs its capture through `decodeMapName`, which the spec doesn't explicitly ask for.** The spec's own "Use `decodeMapName` for `/api/encounters/:map`" line names only that route, and GBA's own `/api/where` (`index.ts:478`) calls `decodeURIComponent` directly with no guard. But `gbcRoutes.ts`'s own file-header doc comment states the established GBC-side convention plainly: "Every `:name`-style route below calls this instead of `decodeURIComponent` directly." I extended that existing convention to the species segment too (added one test for a malformed escape -> 400 `{ error: "malformed species %E0%A4%A" }`), on the reasoning that leaving this one capture as the sole exception to GBC's own documented rule would be a more surprising inconsistency than following it. This is additive (no route's existing passing behavior changed) and I'm flagging it as a deliberate, spec-unrequested extension rather than silently doing it.
3. **`gbcCoverage`'s measured timing (~100-150ms) is well above the plan review's ~11ms estimate**, re-measured multiple times rather than trusted -- see the "Measured numbers" section above. Doesn't change the design (still cached once), but I'm not pretending the number matches what was estimated.

No part of the spec's routing table, payload shape, or test-pinning instructions was found to conflict with the real code once measured directly; every pinned value in this task's tests (326 components/3 multi-map/2 conflicts, NewBarkTown's 10x9, DUNSPARCE's 6 hits on DarkCaveVioletEntrance, 251 species, Route29's 5 sources and its PIDGEY-45%-morn chance, coverage's 125/70) was measured against the real corpus in this session, not copied from the spec's prose.
