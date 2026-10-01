# Task B1 implementer report

**Status: DONE.** No measured fact in the spec disagreed with observation (251/251 species, DUNSPARCE pins, Route30 table all re-derived and matched).

## Commits (branch plan-6c-hub-encounters-world)
| SHA | Step |
|---|---|
| 8f2859c | feat(core): GBC front-sprite loader (`gbc/load/sprites.ts` + `test/gbc/load/sprites.test.ts`) |
| dbbb0a0 | feat(server): real GBC `/api/species/:s/icon.png` (`gbcRoutes.ts`, `gbcRoutes.test.ts`) |
| 6183d74 | feat(ui): `encounters/summary.ts` + `test/encounters/summary.test.ts`; gutter imports `matchesTime`/`rowLabel` |

Each step: test written, seen red (module missing / 4 route tests 501), then green, then committed.

## Tests
- Before 1,780. After **1,801** (+21): core +5, server +3 net (4 new, 1 removed), ui +13 net (summary.test.ts 20 incl. 7 moved; gutter test -7).
- Gate: `npm test` 1800 pass / 1 fail = `gbcRoutes.test.ts` "GET /api/where/:species > DUNSPARCE, dunsparce and SPECIES_DUNSPARCE ..." timed out at 5000 ms under full-suite load (NOT the WorldCanvas flake; unrelated to B1 code, cold-load of project in that test). Rerun alone: 75/75 pass. `npm run typecheck` clean. `npx vite build packages/ui` OK (311.05 kB js).
- Mutations run by me (each red, then reverted): `levelBuff` on fish (2 red), `availableAt` via `time===t` (1 red), tie-break percent across all methods (3 red). Reasoned-red (not executed): `id*2` slot (CHIKORITA would resolve to BAYLEEF; `chikorita` assertion), Unown w/o fallback (UNOWN->`unown_a` + "only UNOWN differs" test), crop frame 1 (`(10,24)` pin, frame-1 value there is [66,123,189]), `normalizeGbcSpecies` dropped (`chikorita` route test 404).

## Named existing-test edits
| File | Test | Change | Why |
|---|---|---|---|
| `server/test/gbcRoutes.test.ts` | 501 describe `cases` | removed the `/api/species/:name/icon.png` case | route is real now (U1) |
| same | near-miss `/api/species/CHIKORITA/icon.pngx is a 404 ...` | title reworded to name the icon route's `icon\.png$` anchor; comment added | now proves the new route's anchor, 404 expectation unchanged |
| same | near-miss `/api/species/A/B/icon.png is a 404 ...` | title reworded to `species/([^/]+)` of the icon route | same, 404 unchanged |
| same | (no test) | added import of `loadGbcFrontSprite` | new describe |
| `ui/test/gbc/GbcEncounterGutter.test.tsx` | describes `matchesTime (pure)` (5 its), `rowLabel (pure)` (2 its) | **MOVED verbatim** to `test/encounters/summary.test.ts` (only import path differs); import line of the gutter test drops `matchesTime, rowLabel` | helpers now live in `summary.ts` |

No other existing test touched.

## Implementation notes
- `loadGbcPicFolders`: ids from `parseConstDefs` on the first const_def block (read locally in `sprites.ts`; no `atlas.ts` change, since `load/` importing `analyse/` would invert layering). Throws naming file on: missing `PokemonPicPointers::` / `assert_table_length NUM_POKEMON`, slot count != 2 x species, missing `pics.asm` label, missing Unown entry. Unown = first `dba_pic` of `unown_pic_pointers.asm`. Test for the throw uses a temp-dir project (3 slots for 2 species).
- `loadGbcFrontSprite`: frame 0 (`w x w`), alpha 255 with the spec's `ponytail:` comment.
- Server route placed before the exact `/api/species` route; `GBA_ONLY_ROUTE_RE` + its doc comment updated; lazy `picFolders`, `speciesIconCache` per normalised species.
- `summary.ts`: rows built with conditional spreads, so absent keys are truly absent (tests use `toStrictEqual`, incl. GBA no `levelBuff`/`rate`/`availableAt` keys). Interface matches the spec incl. the deliberate `levelBuff` deviation from the plan.
- Test-only: GBA wire chances need `slots: number[]` (`SpeciesChance`), so the GBA fixture uses a small `c(...)` helper adding `slots: [0]`.

## Concerns / deviations
- `GbcEncounterGutter.tsx` still has its own private `displaySpeciesName` (no `SPECIES_` strip) and `METHOD_LABEL`; `summary.ts` has its own copies of `METHOD_LABEL`/`ROD_LABEL`. Duplicates die with the gutter in B3; I left the gutter's private copies since the spec names only `matchesTime`/`rowLabel`. `ROD_LABEL` was deleted from the gutter (only `rowLabel` used it).
- Untracked `task-B3-spec.md` in the folder is not mine; not committed here.
- Windows note: no `python` on this machine; heredoc/escape mangling made me do route/test edits with the Edit tool.

## Fix round (reviews: SR-F*, QR-*)
**Status: DONE.** Gate: `npm test` 114 files / **1821/1821 pass** (no flake this run), `npm run typecheck` clean, `npx vite build packages/ui` OK. Count 1,801 -> **1,821** (+20: core +13, server +2, ui +5). Items 7 and 8 share a commit; items 2-5 share one.

| # | Item | Commit | Proving test(s) |
|---|---|---|---|
| 1 | SR-F1 method order | cf65b12 | summary.test.ts "rows within a species come out in method order even when the input lists fish before grass". X3 (drop within-species sort) re-run: red (1 fail / 20 pass); restored, green |
| 2 | SR-F3/QR-1/QR-5 | 33dbff6 | sprites.test.ts "a non-UNOWN species with a 'dbw -1, -1' slot throws ..." (`<TABLE>: BBB has a "dbw -1, -1" slot (only UNOWN may)`); "an id whose slot is beyond the table throws, naming the slot index" (`BBB (id 3) has no slot 4 (table has 4)`); "UNOWN takes the first dba_pic ..." keeps the real Unown path green |
| 3 | QR-3/SR-F2 shared helper | 33dbff6 | new `gbc/load/species.ts` `loadGbcSpeciesIds(root): Map<string, number>` (EGG/NO_MON excluded, keeps `no "const_def" line found` throw, prefix now `loadGbcSpeciesIds:`); `atlas.ts` `loadGbcSpeciesConstants` = `[...loadGbcSpeciesIds(root).keys()].sort()`, its now-unused imports dropped; `sprites.ts` uses it. All 574 pre-existing `core/test/gbc` tests passed unchanged after the refactor; new test "a constants file with no const_def throws (shared species-id helper)" |
| 4 | QR-2 wrapped errors | 33dbff6 | "a pixel index outside PLTE throws a named error" (`loadGbcFrontSprite: gfx/pokemon/aaa/front.png: pixel 0 uses palette index 5, outside PLTE (1 entries)`); "a decode failure is rethrown with the file named" (`...: not a PNG`). Height check now `...: 2x1 is shorter than wide, expected stacked square frames` (was `...front.png is 2x1, ...`) |
| 5 | QR-7 | 33dbff6 | `withRoot` helper (temp dir, `rmSync` in `finally`); body-asserting cases: too few slots (`3 PokemonPicPointers slots, expected 2 x 2 species`), missing `PokemonPicPointers::`, missing `assert_table_length NUM_POKEMON`, missing pics label (`no INCBIN line for BbbFrontpic (BBB)`), missing Unown entry (`no dba_pic entry (needed for UNOWN)`), non-Unown null slot, 2x1 PNG (hand-built, `node:zlib` `crc32`), plus two sanity cases (valid base resolves; 2x4 sheet crops to frame 0). Red check: ran the new test file against the OLD `sprites.ts`: the 6 behaviour-change tests failed (null slot, out-of-range, no const_def, 2x1, palette, decode), 12 passed; restored |
| 6 | QR-8 + X6 | f4e2afe | gbcRoutes.test.ts: CHIKORITA test now asserts `cache-control: no-cache`; new "serves each species its own sprite: DUNSPARCE ..." (bytes = its loader bytes, differ from CHIKORITA's); new UNOWN test (200, `image/png`, loader bytes). Compare = length check + `Buffer.compare(...) === 0` (`expectSameBytes`); `expected(species)` now parameterised |
| 7 | QR-4 override table | f67a771 | summary.test.ts displaySpeciesName describe: one test each for Nidoran (`♀`/`♂`, incl. `SPECIES_` form), Mr. Mime (`MR__MIME`, `MR_MIME`), Farfetch'd (`FARFETCH_D`, `FARFETCHD`), Ho-Oh, plus the generic Title Case/prefix test. `OFFICIAL_NAME` table in `summary.ts` keyed after the `SPECIES_` strip (`Object.hasOwn`). GBA fixture expectation `Nidoran F` -> `Nidoran♀` (my own B1 test) |
| 8 | SR-F5 | f67a771 | `chipTooltip` doc comment in `GbcEncounterGutter.tsx` now says the exported-helper list is just `chipText`, `matchesTime`/`rowLabel` moved to `summary.ts`. Comment-only; gutter test 18/18 |

- Existing tests touched: none. Edited only B1's own tests (`sprites.test.ts` rewritten around `withRoot`, `summary.test.ts`, the B1 describe in `gbcRoutes.test.ts`).
- Not done (per coordinator): SR-F4 X1, QR-6, QR-9.
- Note: the `GbcEncounterGutter.tsx` private `displaySpeciesName` still Title Cases (no overrides); B3 deletes it.
