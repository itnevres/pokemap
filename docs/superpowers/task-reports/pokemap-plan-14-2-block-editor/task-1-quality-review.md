- Important — `packages/core/src/project.ts:144`, `packages/core/src/gbc/project.ts:101` — Overlay lookup uses raw path strings, while the parsers preserve source spellings. Equivalent paths such as `gfx/tilesets/./cave_metatiles.bin` and `gfx/tilesets/cave_metatiles.bin` read the same disk file but match different overlay keys; Windows separator differences have the same problem — An alias can silently render disk bytes instead of staged bytes — Canonicalize exposed file identities, overlay keys and read paths consistently to normalized repo-relative forward-slash paths; add equivalent-path alias regressions.

- Minor — `packages/core/test/blockEdit/contracts.test.ts:157`, `packages/core/test/blockEdit/contracts.test.ts:215` — Swap and restoration assertions compare only one pixel per block — Incorrect remaining tiles, layers or pixels can pass, and restoration does not prove the whole image returned to baseline — Compare complete target-block rasters and the complete restored image, retaining the assertion that the original blocks differ.

No additional cache-invalidation defect found within Task 1: core raster caches are per-call, and hub cache invalidation belongs to Task 10. The copy helper currently receives Task 0’s dereferenced scratch source.

No files edited; no vitest or npm commands run. Test evidence is conductor-reported.

Needs changes