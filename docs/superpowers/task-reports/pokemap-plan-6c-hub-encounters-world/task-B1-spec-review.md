# Task B1 spec-compliance review

**Verdict: ✅ compliant.** No blocking findings. 5 minor findings (2 untested spec rules, 2 small deviations, 1 stale comment).
Scope reviewed: `8f2859c` (core), `dbbb0a0` (server), `6183d74` (UI). `46bfed0` (WorldCanvas flake fix) excluded; it touches only `packages/ui/test/WorldCanvas.test.tsx`, and no B1 commit touches that file.

## Findings

| ID | Sev | Where | Finding / evidence |
|---|---|---|---|
| SR-F1 | minor | `packages/ui/src/encounters/summary.ts:136` (`[...rows].sort(...)`) | The binding rule "within a species: rows by method order" has no test. Mutant X3 (drop the sort) **survived**, 20/20 green. Both the Route30 and GBA fixtures list sources already in method order, so the sort never reorders anything. Fix: add one edge test where a species' fish source comes before its grass source in the input. That test also kills a `first = rows[0].method` variant. |
| SR-F2 | minor | `packages/core/src/gbc/load/sprites.ts:26-32` | The spec said to reuse `loadGbcSpeciesConstants`' species set. The implementation re-implements the same slicing plus `NON_SPECIES` locally; the reason given is load/→analyse/ layering. It yields the same 251-species set in PerfPlus (verified). The local copy drops atlas's "no const_def" throw: with no `const_def` it parses the whole file. The spec allows reading the ids locally, so this is not blocking. |
| SR-F3 | minor | `sprites.ts:61-66` | The Unown fallback fires for **any** `dbw -1, -1` slot, not only UNOWN. A mod with another null slot would silently get the `unown_a` sprite instead of throwing. PerfPlus has exactly one null pair (UNOWN, verified), so there is no effect today. |
| SR-F4 | minor (info) | `summary.ts:117`; `gbcRoutes.ts:473` | Two spec details have no test. X1: dropping `encodeURIComponent` from `iconUrl` **survived**; it is a no-op for every real `[A-Z0-9_]` constant. X6: dropping `cache-control: no-cache` from the icon route **survived**; the spec's TDD step only requires `content-type`. The code is correct in both places. |
| SR-F5 | minor (info) | `packages/ui/src/gbc/GbcEncounterGutter.tsx:118-121` | The `chipTooltip` doc still says this file's exported-helper list names `matchesTime`/`rowLabel`/`chipText`. Those two are now imported, not exported. The file dies in B3. |

## Spec requirements checklist (all ✅ unless noted)
- **Core:** both signatures match. Throws, each message naming its file: missing `PokemonPicPointers::`; missing `assert_table_length NUM_POKEMON`; slot count ≠ 2×species; missing pics.asm label. There is an extra throw for an empty Unown table. `height < width` throws. Unknown species → `null`. `folders ??` is lazy. The output is a `w×w` `Raster` with alpha 255. The `ponytail:` comment is present with the required content (`sprites.ts:86-87`). Label regex = spec's. Slot regex counts `dba_pic X` and `dbw -1, -1` between the label and the assert.
- **Server:** the `species\/[^/]+\/icon\.png$` alternative is gone from `GBA_ONLY_ROUTE_RE` and its doc comment is updated. The `/api/species` exact-route comment was trimmed to match. The icon route sits at `gbcRoutes.ts:460`, **before** the exact `/api/species` (479) and the GBA-only refusal (483). `decodeMapName` → 400 `malformed species <raw>`, the same wording as `/api/where/:species` (l.447). `normalizeGbcSpecies` is applied. `picFolders` is computed lazily once per handler (`??=`). `speciesIconCache` is a `Map<string, Buffer>` keyed by the normalised species. 404 `no sprite for <SPECIES>`. Headers are `content-type: image/png` plus `cache-control: no-cache`. Query params are ignored.
- **UI:** the interface matches the spec, including the `levelBuff?: true` deviation (documented) and the `GbaEncounterRow` declared locally (no `EncounterGutter.tsx` import).
  - GBC method mapping is identity, with label = `rowLabel`. GBA mapping: Land / Water / `Fishing · {Old,Good,Super} Rod` / Rock Smash.
  - `rate` = `encounterRate ?? biteChance`; it is absent for headbutt and all GBA rows. `levelBuff` is set on GBC grass/water only.
  - `iconUrl` uses `encodeURIComponent` of the raw constant. `displaySpeciesName` strips `^SPECIES_` and Title Cases each `_` word, with empty words filtered (`MR__MIME`→`Mr Mime`).
  - The ordering keys match the spec (first-method rank, then that method's top % descending, then appearance). `availableAt` filters `["morn","day","nite"]` with `matchesTime`, GBC only.
- `matchesTime`, `rowLabel`, `METHOD_LABEL` and `ROD_LABEL` were **moved byte-verbatim**, doc comments included (block compare `===` true). The gutter imports `matchesTime`/`rowLabel` from `../encounters/summary.js`. There is no re-export: grep shows no other `export` of either. The gutter keeps its own `METHOD_LABEL` (still used at l.241) and its private `displaySpeciesName`, as the implementer disclosed.

## Existing-test discipline (U1)
`git diff 27bf525 6183d74 -- packages/*/test`, excluding WorldCanvas, shows only the edits the spec names:
- `gbcRoutes.test.ts`:
  - The 501 `cases` entry for `/api/species/:name/icon.png` was removed.
  - The two near-miss `it` titles were reworded to name the icon route's `icon\.png$` and `([^/]+)`, with a 3-line comment added. Their bodies and 404 expectations are unchanged.
  - An import of `loadGbcFrontSprite` was added, and a new describe (4 its).
- `GbcEncounterGutter.test.tsx`: the `matchesTime (pure)` (5 its) and `rowLabel (pure)` (2 its) describes were deleted, and the import line drops `matchesTime, rowLabel`.
- `summary.test.ts`: the two describes are **byte-identical** to the old file's block, from `describe("matchesTime (pure)"` up to `describe("chipText` (string compare true). Everything else in it is new.

## Re-derived facts (independent node script over the corpus, not the implementation)
- Species set: first `const_def` block (l.21 to the second `const_def` at l.286), manual const counting minus `EGG`/`NO_MON` → **251**. `PokemonPicPointers`: `PokemonPicPointers::` at l.3, `assert_table_length NUM_POKEMON` at l.511 → **502 slots**. The only null pair is at slots 400/401 (l.408-409) = **UNOWN** (id 201).
- `unown_pic_pointers.asm` first `dba_pic` = `UnownAFrontpic` → pics.asm l.675 → `unown_a`. `gfx/pokemon/unown/front.png` does **not** exist.
- **251/251 resolved, 0 without `front.png`.** The only folder ≠ lowercased key is `UNOWN→unown_a`. CHIKORITA→chikorita, NIDORAN_F→nidoran_f, MR__MIME→mr__mime, HO_OH→ho_oh.
- `id*2` preview: CHIKORITA→`bayleef`. CELEBI → `slots[502]` is undefined, so the mutant throws.
- DUNSPARCE `front.png`: 48×288, depth 8, colour type 3, 0 non-zero filter bytes. PLTE `[[255,255,255],[255,198,49],[66,123,189],[0,0,0]]`, tRNS `[255,255,255,255]`.
  - Pins: (24,1)→3 `[0,0,0]`; (27,1)→2 `[66,123,189]`; (25,2)→1 `[255,198,49]`; (10,24)→0 `[255,255,255]`; (10,72)→2 `[66,123,189]`.
  - Frame 0 and frame 1 differ in 347 px. All match the spec and the test.
- **Route30 fixture:** a tsx script ran `gbcEncounterSources(openGbcProject(PerfPlus),"Route30")`. Its JSON equals the spec's JSON block and the test's `ROUTE30` const (`JSON.stringify` equality, both true).
- **Expected `SpeciesSummary[]`, derived by hand from the fixture:**
  - Appearance index: CATERPIE0 LEDYBA1 PIDGEY2 WEEDLE3 HOPPIP4 HOOTHOOT5 SPINARAK6 POLIWAG7 ZUBAT8 POLIWHIRL9 MAGIKARP10 EXEGGCUTE11 PINECO12.
  - Top grass %: CATERPIE45 HOOTHOOT45 PIDGEY35(day) LEDYBA25 SPINARAK25 POLIWAG20 WEEDLE/HOPPIP/ZUBAT10.
  - Order: CATERPIE, HOOTHOOT, PIDGEY, LEDYBA, SPINARAK, POLIWAG, WEEDLE, HOPPIP, ZUBAT, POLIWHIRL, MAGIKARP, PINECO(30), EXEGGCUTE(20). 13 species.
  - POLIWAG's 7 rows equal the spec table: grass nite 20 4-8 rate 9.765625 buff; Surf 75 15-24 1.953125 buff; Old 14.84375 10 rate 50; Good day/nite 64.84375 20; Super day/nite 79.6875 40.
  - `availableAt`: ALL for POLIWAG/HOOTHOOT/LEDYBA/SPINARAK/EXEGGCUTE/PINECO/MAGIKARP/POLIWHIRL (each has an untagged headbutt/water/old-rod row). `[morn,day]` for CATERPIE/PIDGEY/WEEDLE/HOPPIP. `[nite]` for ZUBAT.
  - All of this equals the spec and the test's `toStrictEqual` literal. Every row of all 13 species was checked, including the headbutt labels `Headbutt · common/rare`, no `rate` on headbutt, and MAGIKARP's 5 fish rows.

## Mutation table
Harness: a node script reads the 3 source files into memory once. Per mutant it asserts the literal anchor matches exactly once, writes the mutant, runs `node node_modules/vitest/vitest.mjs run <narrowest test file> --reporter=json`, restores from the in-memory bytes, and byte-compares. A final byte-compare runs on all 3 files, then `git diff --quiet`, then a `git status --porcelain` before/after check (identical).
- First pass: 17/17 ran. X6 and X9 hit anchor drift (X6 ×3 matches, X9 ×0 because of CRLF). Neither file was written for those two.
- Second pass: X6 and X9 re-anchored (unique context, `\r\n`) and both ran 2/2.
- Every requested ID printed a result.

| ID | File · anchor → mutant | Result | Red tests |
|---|---|---|---|
| M1 Unown no fallback | sprites.ts `const dir = labelDir.get(label!);` → `label === unownLabel ? "unown" : …` | **KILLED** 3p/2f | "resolves all 251…" (UNOWN→unown_a); "every folder has a front.png; only UNOWN differs" |
| M2 slot `id*2` | `slots[(id - 1) * 2]` → `slots[id * 2]` | **KILLED** 1p/4f | all 4 corpus tests (throws on CELEBI) |
| M3 crop frame 1 | `img.indices[i]` → `img.indices[i + w * w]` | **KILLED** 4p/1f | "DUNSPARCE: frame 0…" |
| M4 no `normalizeGbcSpecies` | gbcRoutes.ts `const species = normalizeGbcSpecies(decoded);` → `= decoded;` | **KILLED** 74p/1f | "normalises the species: lowercase and SPECIES_…" |
| M5 tie-break across all methods | summary.ts `Math.max(...sorted.filter(r => r.method === first)…)` → `Math.max(...sorted.map(r => r.percent))` | **KILLED** 17p/3f | Route30 order; Route30 full; "tie-break percent is the first method's" |
| M6 `levelBuff` on fish | `grass \|\| water ?` → `\|\| fish` | **KILLED** 18p/2f | POLIWAG 7 rows; Route30 full |
| M7a `availableAt` via `r.time === t` | `matchesTime(r, t)` → `r.time === t` | **KILLED** 18p/2f | Route30 full; "fish row tagged day counts at morn" |
| M7b (subtler) `r.time === undefined \|\| r.time === t` | same anchor | **KILLED** 19p/1f | "fish row tagged day counts at morn" |
| X1 no `encodeURIComponent` | iconUrl template | SURVIVED 20/20 | (SR-F4) |
| X2 rate drops `biteChance` | `s.encounterRate ?? s.biteChance` → `s.encounterRate` | **KILLED** 18p/2f | POLIWAG 7 rows; Route30 full |
| X3 no within-species row sort | `[...rows].sort(…)` → `[...rows]` | SURVIVED 20/20 | (SR-F1) |
| X4 drop first-method key | `a.first - b.first \|\| b.top - a.top` → `b.top - a.top` | **KILLED** 16p/4f | Route30 order and full; "fish-only follows grass"; summariseGba |
| X5 appearance reversed | `a.appearance - b.appearance` → reversed | **KILLED** 16p/4f | Route30 order and full; equal-top input order; summariseGba |
| X6 no `cache-control` (icon route) | unique 3-line anchor at the icon route's `writeHead` | SURVIVED 75/75 | (SR-F4) |
| X7 GBA label `Fishing`→`Fish` | `GBA_METHOD.fishing_mons` | **KILLED** 19p/1f | summariseGba |
| X8 alpha 0 for index 0 | `data.set([r,g,b,255]…)` | **KILLED** 4p/1f | "DUNSPARCE: frame 0…" |
| X9 malformed escape → 404 | `send(400, malformed species…)` → `send(404, …)` | **KILLED** 74p/1f | "a malformed percent-escape is a 400…" |

All 7 spec mutations were killed (M7 in both forms). Of my 10 extras, 7 were killed and 3 survived (X1, X3, X6 → SR-F1, SR-F4).

## Runs
- `vitest run` on the 4 touched files: sprites 5 + gbcRoutes 75 + summary 20 + gutter 18 = **118/118 pass**.
- `npm run typecheck`: exit 0.
- Full `npm test` was not run (optional).
- Working tree is byte-identical before and after. `git status --porcelain` shows only the coordinator's untracked `task-B3-spec.md`.
