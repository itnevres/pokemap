# Task 11b tests report (written by the conductor, s10)

Hops: `aab8353` (opencode/deepseek-v4.1-flash-free; timed out after the helpers), `0fd00bf` (same model; added the
eleven cases, then hit the OpenCode free usage cap before writing this report). Conductor vet commit follows.

Cases (`packages/server/test/helpers/blockEditRoutesSuite.ts`, both families unless named): 11b.1 check happy path
(usage equals the GET body's usage); 11b.2 `confirm` true/false from a disk recomputation of the planner predicate
(GBA `usedElsewhere`: other maps on consuming layouts, grid and border; GBC: other maps sharing the file, grid and
border), `saveAsNew` → false; 11b.3 GBA cross-half warning (`entry N tile differs:`, `gbaOps.ts:186`) on a tile that
resolves to different sources across consuming layouts; 11b.4 literal stale revision → 200 refusal `STALE`,
`confirm` false; 11b.5 check read-only (B13); 11b.6 apply saveAsNew on a cell of a private grid: new id = GET
`limits.nextId` (cross-checked against disk counts), content = the source block's GET body, file +16 bytes (GBC +1
`tilecoll`), label `New block $XX`, one undo restores cell id, `nextId` and the render; 11b.7 apply ok in place: GET
content and metatile PNG equal the source's (captured before), label `Edit block $XX`, undo restores the PNG; 11b.8
NOT_OWNER after `stage(pair.b)`, nothing staged; 11b.9a disk change of a block the map never draws → 409 `STALE`,
render unchanged; 11b.9b paint after GET → 409 `STALE`, history depth unchanged; 11b.10 no-op apply → session body,
`isDirty` and `canUndo` false, no undo entry, no staged bytes (ruling B10a); 11b.11 400 guards (structural and
`BAD_VALUE` drafts naming the field for check and apply; `%`, null, array bodies) and 404 unknown map.

Conductor vet: `copiedRequest` read `source.block` but `findChangedSource` returns `{ id, data, png }` (would throw at
run time; typecheck passed through `any`) → reads `source.data.block`. 11b.10 gains the `isDirty`/`canUndo` checks.

Typecheck: pass (`tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json`).
