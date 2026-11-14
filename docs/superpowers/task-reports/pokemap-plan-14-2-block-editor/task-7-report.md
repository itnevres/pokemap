# Task 7, hop B: GBA block edit planner

Implemented against the supplied scratch worktree. Working tree was clean at the start for the allowed paths and no commit was made.

## Classification and scope

High risk: independently derived binary fixtures, effective-byte parsing, refusal ordering, and shared-file identity. The `delegate` preflight was read; implementation stayed in this hop with no external provider or additional agent dispatch, matching the bounded hop instruction. Only `packages/core/src/blockEdit/gbaOps.ts` and this report were written. No tests, fixtures, types, exports, dependencies, configuration, or subject-source files were changed. `gbaOps.test.ts` and `gbaFixture.ts` were treated as the protected oracle.

## Implementation

- Replaced both stub bodies. `planGbaBlockEdit` follows G2's order: `assertNotTripleLayer(proj.profile, proj.paths.porymapCfg)`; map/layout/split target resolution with a `BAD_VALUE` when the local index is at or past the effective metatile count; draft validation (8 entries, boolean flips, tile/palette through `patchGbaMetatile`, behavior/layerType through `patchGbaAttribute`); cell check for save-as-new map requests; `SHARED_GRID`; append limit; structural check.
- Every tileset file is read as `staged.get(canonicalPath) ?? disk` (R1), with failed reads refused as `BAD_VALUE` naming the path. Metatile entries, attribute words, and the metatile count all come from those effective bytes; the project's own overlay is never consulted for them. Edits carry those bytes as `before`, include only files whose bytes change, and are sorted by canonical path.
- Target resolution uses the edited map's layout and split (G1). Primary ids use their own local index; secondary ids subtract `split.metatiles`. Save-as-new appends at the effective file-local count.
- Changed entries are computed against the original effective entry at the target local index (the source entry in save-as-new mode), so unchanged entries are never judged (G3). Structural checks (G4) and cross-half warnings (G5) only visit those entries. Warnings name the entry index, the differing kind, and every consuming layout with its resolved tileset and local index; identical sources produce no warning, and messages are deduplicated.
- The append limit (G6) checks every consuming layout: `n < split.metatiles` for a primary role and `split.metatiles + n < NUM_METATILES_TOTAL` for a secondary role, naming the first failing layout in id order. `newBlockId` / `placement.blockId` use the map-visible id in the edited layout; placement is present only for map-origin save-as-new.
- OK mode patches in place; save-as-new appends the metatile and clones the source attribute word before applying the draft fields.
- Usage comes from `gbaBlockUsage`; confirmation (G8) is false for save-as-new or empty edits, otherwise it checks every other map on a consuming layout against its R3 effective grid and border bin, using the layout's own visible target id.
- R3 effective grids prefer the alphabetically first map present in `grids` among all maps sharing the blockdata file, then fall back to `parseBlocks` over the disk file (profile mask applied). R9 revision reuses `blockEditRevision` with the target tileset's two effective files and the edited map's R3 grid.
- The planner never writes a file and does not mutate supplied buffers, drafts, overlays, or grids.

## Commands and evidence

1. `npx vitest run packages/core/test/blockEdit/gbaOps.test.ts` — exit 0. Result lines:

   ```text
   Test roots setup: 87246 files, 273113194 bytes, 80753.6 ms
   Subject snapshot: 7456 files, 53050750 bytes, 5027.7 ms
   ✓ packages/core/test/blockEdit/gbaOps.test.ts (40 tests) 3525ms
   Test Files  1 passed (1)
        Tests  40 passed (40)
   ```

   The two subject-smoke cases ran (661 ms and 636 ms), so there were zero skipped cases.

2. `npm run typecheck` — permission denied by the harness before launch (`Permission denied: shell`); no typecheck process started. The same script's two commands were run directly instead:
   - `npx tsc --noEmit -p tsconfig.base.json` — exit 0, no output.
   - `npx tsc --noEmit -p packages/ui/tsconfig.json` — exit 0, no output.

`npm test` was not run, as instructed.

## Test disagreements and remaining concerns

No test is identified as wrong; no test was edited or worked around. All rulings were implemented as written, including comparing tile/palette sources by both symbol and local index for G5 and checking the append limit before the structural check.

Broader gates (mutation checks, separate spec/quality reviews, full gate, UI build, live UI check) remain for the conductor. This change is pure core planning code with no UI surface.
