# Task 7, fix round 1, hop B: implementation fix

Scope: `packages/core/src/blockEdit/gbaOps.ts` only (plus this report). The protected oracle
(`gbaOps.test.ts`, `gbaFixture.ts`) was not touched; `gbcOps.ts`, `usage.ts`, `gbaPatch.ts` and every
other file are unchanged. Working tree carries the fix uncommitted; committing is left to the conductor.

## Classification and scope

High risk (refusal ordering, effective-byte parsing, shared-file identity). Stayed in this hop; no
subagent or external provider was dispatched. No check was loosened.

## What changed (all in `planGbaBlockEdit` / helpers)

1. **G2a — save-as-new cell bounds.** The from-map cell check now requires integer `x`/`y` inside
   `0 <= x < layout.width`, `0 <= y < layout.height`, else `BAD_VALUE` with the message
   `<map>: cell is outside the map` (starts with the map). Placed in the BAD_VALUE stage, before
   `SHARED_GRID`, as before.
2. **G2b — draft shape, BAD_VALUE stage.** Before any field of an entry is read: `draft.entries` must be
   an array of exactly 8 non-null objects (refusal message starts with the canonical metatiles path);
   `behavior` and `layerType` must be integers (message starts with the canonical attributes path); and
   the effective attributes buffer must hold exactly one word per metatile,
   `attrBuf.length === count * profile.metatileAttributesSize`, else `BAD_VALUE` with the exact message
   `<attributes path>: N attribute words for M metatiles` (N = `attrBuf.length / metatileAttributesSize`,
   M = metatile count). Applies to OK and save-as-new.
3. **G6a — append-limit message, exact format.**
   `<metatiles path>: layout <id> (<role>) allows <limit> metatiles; cannot append metatile <count>`,
   with `<limit>` = `split.metatiles` for a primary role and `metatilesTotal - split.metatiles` for a
   secondary role, `<count>` = the tileset's current effective metatile count (the new block's file-local
   index). The first failing layout in layout-id order is named (`uses` are already sorted). Code stays
   `SPLIT_LIMIT`.
4. **R1b — no non-refusal error escapes.** The whole planner body moved into
   `planGbaBlockEditInner`; the exported `planGbaBlockEdit` wraps it. A `BlockEditRefusal` is re-thrown
   unchanged; anything else becomes `BlockEditRefusal("BAD_VALUE", "<req.map>: <message>")` with
   `<message>` = `error instanceof Error ? error.message : String(error)`. `assertNotTripleLayer` is
   still the first statement of the inner body (its `TRIPLE_LAYER` refusal passes through untouched).
   `effectiveBytes` and `cells` use the same `error instanceof Error ? error.message : String(error)`
   expression (R1a guarded reads keep the `<canonical path>: <reason>` shape).
5. **`req.metatileId` validated before deriving `local`** (integer, >= 0), then the layout/split is
   resolved and the tileset chosen.
6. **Quality items.**
   - One `cells` cache per plan, created in the planner body and shared by the confirm scan
     (`usedElsewhere`) and the revision's effective grid.
   - The confirm scan uses the consuming layout object carried in `ConsumingUse` (built once from
     `proj.layouts`) instead of `proj.layoutById` / `proj.layoutForMap` per map.
   - Each patcher is called once per file: the BAD_VALUE-stage call produces the result. OK patches at
     `local`; save-as-new validates through its append at `count` with `cloneFrom = local`. No target is
     patched twice with the same arguments; BAD_VALUE still precedes SHARED_GRID and the append limit.
   - `const NUM_PALS_TOTAL = 13;` named and used in the structural check.
   - `gbaCrossHalfWarnings` lost its never-firing `seen` dedupe set (output unchanged); the duplicate
     `PaletteSource` type was dropped in favour of the single `TileSource`.
7. **Warning format unchanged** (`entry <i> <tile|palette> differs: <layout> -> <symbol>[<local>], ...`),
   as pinned by the tests.

Check order (TRIPLE_LAYER → BAD_VALUE → SHARED_GRID → append limit → structural), changed-entries-only
judging, per-consuming-layout structural check, confirm per map with each layout's own target id, and the
exports are all unchanged.

## Commands and evidence

1. `npx vitest run packages/core/test/blockEdit/gbaOps.test.ts` — exit 0. Result lines:

   ```text
   Test roots setup: 87246 files, 273113194 bytes, 79977.3 ms
   Subject snapshot: 7456 files, 53050730 bytes, 4940.0 ms
   ✓ packages/core/test/blockEdit/gbaOps.test.ts (61 tests) 4820ms
   Test Files  1 passed (1)
        Tests  61 passed (61)
   ```

   Zero skipped; both subject-smoke cases ran (743 ms and 724 ms).

2. `npm run typecheck` — not executed: the harness rejected the `npm run` launch itself
   (`Permission denied: shell`). The script is exactly
   `tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json`, so both commands
   were run directly — both exit 0 with no output:

   ```text
   npx tsc --noEmit -p tsconfig.base.json       (no output, exit 0)
   npx tsc --noEmit -p packages/ui/tsconfig.json (no output, exit 0)
   ```

`npm test` was not run, as instructed.

## Notes

No test was edited or worked around; no check was loosened. The 14 red-run tests now pass and the
47 previously passing tests still pass. Committing is left to the conductor.
