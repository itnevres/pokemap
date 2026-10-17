# Task 5 implementer report

Status: complete, uncommitted. No mutations run. No oracle disagreement.

## Scope

Created only the two task files and this report:

- `packages/core/src/signs/linked.ts`
- `packages/core/test/signs/linked.test.ts`
- `docs/superpowers/task-reports/pokemap-plan-10a-switch-and-signs/task-5-report.md`

No existing module needed an export change. Other tasks' staged and unstaged
changes were left alone.

## Implementation

Implemented all six requested functions: GBA and GBC display-name resolution,
both species-name tables, linkedSpecies, and linkedText. linkedSpecies has typed
overloads `(family: "gba", proj: Project, mapName: string)` and
`(family: "gbc", proj: GbcProject, mapName: string)`.

GBA names use regionMapDir/region_map_entries.h and resolve the map section's
actual sMapName label. Species names come from species_names.h. C comments do
not supply otherwise missing entries. Missing sections, labels and species
names identify their file and key; invalid quoted names also retain context.

GBC landmarks use const_def/const order and landmark macro order, including
nonzero enum starts. Only the first landmark enum is parsed: the real subject
file later has a separate CaughtData `const_def $7f, -1` block that the shared
single-step enum parser does not support. Landmark labels can carry inline db
text or put db on the next line. BSP becomes a space, trailing @ padding is
removed, and other tokens are preserved. Species names join numeric IDs from
loadGbcSpeciesIds to names.asm positions; truncated tables refuse with the
missing species key.

Chance calculations reuse rankSpeciesForSign for GBA and gbcEncounterSources
for GBC. The latter already sums slots within tables and resolves fishing
time groups with the engine's exact byte probabilities. Swarm-tagged sources
are excluded; each species keeps its greatest table chance. Both families
then sort ties by display name. The GBC call explicitly supplies the existing
hasWaterOverride=true hook: S9a includes all wildForMap sources, including
header fishing on dry maps, rather than the atlas's water-reachability filter.
No layout or collision data needs loading for linked text.

## Verification

Tests were created before linked.ts, with both coordinator oracle arrays
pinned verbatim. The initial test run through the Node API failed to load
the absent implementation. After implementation, both oracle cases passed
without changing either expected array.

Final focused run: 11 passed, 0 failed, 0 skipped. This includes real Route101,
Route29, NewBarkTown, PalletTown and CeruleanGym; literal text formatting;
missing sections/labels/species; token preservation and enum offsets; swarm
exclusion; and dry-map header fishing. CeruleanGym explicitly has
FISHGROUP_NONE and no linked species.

The requested CLI failed before collection because esbuild could not read
an ancestor directory under the sandbox. Used the explicitly permitted
Vitest Node API fallback, config:false, node environment, repository setup
file, one thread, watch:false. The final Node API run passed all 11 tests.

`npm.cmd run typecheck`: passed, exit 0 (both configured TypeScript projects).
`git diff --check`: passed. New source and test ASCII check: passed.

## Concerns

No open correctness findings. No real decomp files were written, no commit
was made, and no mutations were run, as directed by the dispatch.
