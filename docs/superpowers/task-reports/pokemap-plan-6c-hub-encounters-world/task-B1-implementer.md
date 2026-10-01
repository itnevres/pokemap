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
