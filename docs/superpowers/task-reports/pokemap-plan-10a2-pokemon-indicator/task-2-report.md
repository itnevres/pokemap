# Task 2: GBC Indicator data

Status: implementation and tests written; runtime verification pending coordinator.

## Scope and routing

High risk: parses decomp data and pins an independent species/sprite oracle.
Read the exact task brief and binding rulings I3, C5, C6. Used the delegate,
test-driven-development, Ponytail and verification-before-completion skills.
This session is the explicitly dispatched Codex implementation task; kept the
two-file implementation here without another delegation layer. No git writes,
subject writes, mutation runs or unrelated changes were made.

Files created:

- `packages/core/src/indicator/gbcData.ts`
- `packages/core/test/indicator/gbcData.test.ts`
- This required report.

## Own-sprite oracle derivation

Read both subject files directly at
`C:/Programming Projects/pokecrystal-PerfPlus/constants/` before writing tests.
Hand-transcribed five regular-block species from `sprite_constants.asm` lines
73 (SLOWPOKE), 86 (SUDOWOODO), 103-105 (SUICUNE, ENTEI, RAIKOU), followed by
all 35 SpriteMons definitions at lines 114-148 (UNOWN through HO_OH).
The test contains these 40 literal names; no code generated its expected list.

Manually checked their bare constants against `pokemon_constants.asm`'s first
species enum, starting at line 21 and ending with CELEBI at 273. Matching entries:
22, 25, 28, 33, 34, 44, 46, 56, 60, 62, 64, 67, 71, 79, 81, 87, 93, 95,
100, 109, 111, 115, 121, 133, 142, 145, 149-152, 164, 167, 197, 207, 223,
265-267, 271-272. SENTRET at 183 and MR__MIME at 143 have no matching sprite
definition. MONSTER and POKEMON are sprite constants without species entries.
The EGG entry at 276 and Unown-form enum starting at 286 are not species for
this purpose. Tests additionally cover comments, macro bodies, both sprite
blocks, generic fallback, and exact double-underscore matching.

## Species ranking

Reuses `gbcEncounterSources`, excludes sources tagged `conditional: "swarm"`,
takes the maximum chance per species, and sorts descending by chance with
display-name lexical ties, matching `linkedSpecies`. Reads `gbcSpeciesNames`
before encounters so missing names fail with their file path. Imports the
existing `IndicatorSpecies` interface from Task 1.

Route29 is compared with both `linkedSpecies` and the literal 10a B3 list.
The first row pins both species and display name plus HOOTHOOT's 55% chance:
`data/wild/johto_grass.asm:1256-1262` slots 0/2/5/6 have probabilities
25/20/5/5 (`data/wild/probabilities.asm:9-15`); headbutt is 50 in both lists
(`data/wild/treemons.asm:59-75`).

## Placement scan rule

Reads COLL_TALL_GRASS using `parseCollisionConstants` from the subject's
`constants/collision_constants.asm`. Reads the layout and tileset collision
quadrants following `gbcMapHasWaterTile`'s pattern. Each block covers 2x2 STEP
coordinates. Scans all grass STEP coordinates row-major (y outer, x inner),
then tries neighbours up, down, left, right. Returns the first in-bounds
non-grass neighbour without an object_event at that exact STEP coordinate.
Returns null when no candidate exists. Object occupancy uses
`loadGbcMapEvents(...).events.objects`, irrespective of flags or visibility.
Out-of-range metatile collisions are ignored as in the atlas helper.

Tests cover direction priority, object exclusion, STEP order across blocks,
grass/edge exclusion, no grass and fully occupied neighbours. Corpus tests
check Route29 bounds/collision/adjacency/occupancy and NewBarkTown returning null.

## Verification and open concerns

Tests were created before the implementation file. The red runtime check found
`node_modules/.bin/vitest.cmd` absent, consistent with the supplied sandbox
constraint; no dependency install or npx download was attempted. Consequently
neither a red test failure nor green test pass is claimed.

Node v24.13.0 `--experimental-strip-types --check` passed for both TypeScript
files. ASCII-only and trailing-whitespace checks passed for both files.
These are syntax/static hygiene checks, not a TypeScript typecheck.

Coordinator still needs the targeted Vitest run, full gate with pass/fail/file
counts, typecheck, UI build, separate high-risk reviews and mutation checks.
No UI was changed. No unrelated bug was found. Report stays in the active
task-report directory pending those reviews rather than being archived early.
