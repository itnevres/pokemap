# Task 6, hop B: GBC planner and group placement

Implemented against baseline `d301a410cd26dd1cb7d779035f1712b29ee363ea` in the supplied scratch worktree. Initial status was clean. No commits made.

## Classification and scope

High risk: effective-byte parsing, refusal boundaries, shared-file identity, and local palette allocation. This is the bounded implementation hop specified by the conductor. The delegate/offload guidance was read; implementation stayed in this Codex hop with no external provider or additional agent dispatch. Changes are restricted to `placement.ts`, `gbcOps.ts`, and this report. No tests, types, exports, dependencies, configuration, or subject-source files were changed. The existing barrel exports and shared plan type required no changes.

## Implementation

- Group placement returns a fresh array, clips destination edges, skips sheet-row wrapping, past-end indices and unmapped tiles, and supports 1x1, 2x2 and 4x4 groups.
- Sheet-to-tile inversion selects the lowest raw tile id through the existing `pngTileIndex` mapping.
- Target resolution and revision use the alphabetically first staged map sharing the grid, falling back to the project disk layout. Raw zero resolves to the border block. Revision hashes the four effective files and pre-edit grid using the specified SHA-1 framing.
- The pure planner caches canonical effective file reads, preferring the request's staged overlay. Block records, palette names and bank mappings, collision text, and decoded pixels derive from these bytes. Text is round-tripped as latin1 to preserve arbitrary comment bytes and CRLF.
- Draft and target validation precede mode-specific refusals. Conflicting palette entries include no-op entries; matching entries are subsequently dropped. Untouched garbage tile ids are retained.
- All palette edits use the existing span patcher. Local edits check shared-file compatibility, load runtime reservations only when needed, reject reserved sources, then reuse matching pixels/palette or allocate the lowest eligible sheet slot. Allocation scans effective blocks from every map-used tileset sharing the sheet and excludes draft ids and earlier allocations. Repointing uses original draft ids to avoid cascades.
- Save-as-new appends a metatile and replaces the corresponding surplus collision record when present, with placement only for map-origin requests. Usage remains source-block usage. Confirmation is per consuming map and includes All tile usage. The tile-usage helper receives a read-only project view with effective block records so a divergent project overlay cannot override R1.
- Results contain only changed files, sorted by canonical path, with effective pre-edit bytes as `before`; warnings are empty. No planner code writes files or mutates supplied buffers, drafts, overlays, or grids.

## Commands and evidence

1. `npx vitest run packages/core/test/blockEdit/placement.test.ts packages/core/test/blockEdit/gbcOps.test.ts` — exit 1 before launch: `npx.ps1 cannot be loaded because running scripts is disabled on this system` (`PSSecurityException`).
2. `npm run typecheck` — exit 1 before launch: `npm.ps1 cannot be loaded because running scripts is disabled on this system` (`PSSecurityException`).
3. `npx.cmd vitest run packages/core/test/blockEdit/placement.test.ts packages/core/test/blockEdit/gbcOps.test.ts` — exit 1 during config loading, before test collection. Result lines:

   ```text
   X [ERROR] Cannot read directory "../../../../../../../..": Access is denied.
   X [ERROR] Could not resolve "C:\\Users\\Serve\\AppData\\Local\\Temp\\claude\\8fd0350c313cb955\\fd52805f-2f40-4daa-9fe0-26bda39faaf2\\scratchpad\\wt-t6\\vitest.config.ts"
   failed to load config from ...\wt-t6\vitest.config.ts
   Error: Build failed with 2 errors:
   ```

   esbuild's stack resolves through `C:\Programming Projects\PokeMap\node_modules\esbuild\lib\main.js`. No pass/fail/skipped test counts were produced; this is not a test pass.
4. First `npm.cmd run typecheck` — exit 1: `gbcOps.ts(73,70): error TS2322: Type 'number | undefined' is not assignable to type 'number'`. Corrected the return's narrowing after the explicit undefined refusal.
5. Final `npm.cmd run typecheck` — exit 0:

   ```text
   > typecheck
   > tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json
   ```

6. `git diff --check` — exit 0; no whitespace errors. Git emits LF-to-CRLF working-copy notices.
7. Final source diff before adding this report: two source files, 245 insertions and 6 deletions. `git status --short` showed only the two allowed source paths modified.

## Test disagreements and remaining concerns

No test is identified as wrong; no test was edited or worked around. The focused suite must still be run by the conductor and must report all passing with zero skipped. Sandbox config-loading failure prevents claiming behavioral acceptance here. No baseline red run, mutation run, separate independent reviews, full gate, UI build, or live UI check was completed in this implementation hop. This task changes pure core code only, with no UI change; full-suite `npm test` was not run, as instructed. Conductor integration and required broader gates remain outstanding.
