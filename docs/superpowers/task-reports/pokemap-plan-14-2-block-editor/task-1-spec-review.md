- Important — `packages/core/test/blockEdit/contracts.test.ts:215` — The required render-equivalence test compares only one center pixel; the GBA test at line 157 does likewise, and restoration checks also sample only that pixel — These assertions do not establish that the swapped block renders like the source block or that clearing restores its complete appearance — Compare the full block RGBA regions before, after, and after clearing.

- Minor — `packages/core/test/blockEdit/contracts.test.ts:122` — The required “tilesetPaths returns the same paths loadTileset reads” test instead compares against `parseTilesetPaths` — It cannot detect the loader reading a different path — Inject a recording reader into `loadTileset` and assert the consumed paths match the exposed paths, accounting for the existing `.gbapal` → `.pal` conversion.

- Minor — `packages/core/test/helpers/stubProject.ts:27` — This shared fixture and three other existing test/fixture files were modified outside Task 1’s named files — Global Constraints explicitly prohibit those edits without a task scope amendment — Record an explicit exception for the necessary interface-only updates in `stubProject.ts`, `stubGbcProject.ts`, `warpGraph.test.ts`, and `save.test.ts`.

The remaining Task 1 interfaces and test cases are present, including the approved `tilesetGeneration` mechanism. No files edited or tests run; execution evidence is conductor-supplied.

Needs changes