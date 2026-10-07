# Task 2 executed spec: GBC paint tools (pencil / rect / bucket / shift / dropper)

Plan 7 Task 2, re-granularised against the real code. Risk class: **low / mechanical** (pure array functions, no I/O, no parsing). One merged review (spec + quality).

## Scope

Pure `(blocks, args) => Block[]` functions over the GBC `Block` (`{ metatileId }` only, `packages/core/src/gbc/model/types.ts`). No collision variant (Plan 7 Goal: Crystal collision is per tileset). The server (Task 4) wires these into strokes. Nothing here knows about sessions.

- **Rect** is not its own function. As in GBA, it is `paintCells` over the rect's cells with the rect's corner as origin.
- **Dropper** is `readBlock`.

## Reuse decision (ladder rung 2)

- GBA `packages/core/src/edit/paint.ts`'s `readBlock` and `shiftGrid` contain no GBA-specific field logic: they copy with `{ ...b }`. **Make them generic: `<B extends object>(blocks: B[], …): B | undefined` / `B[]`.** This is a type-only edit, with no body changes beyond what the generic needs. GBA call sites still infer `Block`.
- GBA `paintCells`/`floodFill` merge `collision`/`elevation` (GBA-only semantics). If GBC used them, its blocks would gain `collision: undefined`/`elevation: undefined` keys, a lie about the GBC shape (roadmap §1). So GBC gets its own two small functions.

## Files

| File | Change |
|---|---|
| `packages/core/src/edit/paint.ts` | `readBlock` and `shiftGrid` become generic over `B extends object`. Nothing else changes |
| `packages/core/src/gbc/edit/paint.ts` | **new**: `GbcStamp`, `paintCells`, `floodFill`; re-export `readBlock` and `shiftGrid` from `../../edit/paint.js` so GBC callers import one module |
| `packages/core/test/gbc/edit/paint.test.ts` | **new** |

GBA test files must stay byte-unchanged: `git diff 06d8759 -- packages/core/test/edit/` is empty.

## API (exact)

```ts
import type { Block } from "../model/types.js";
export { readBlock, shiftGrid } from "../../edit/paint.js";

/** Row-major cells[y * width + x]; same shape GBA's Stamp uses for metatileId, without collision/elevation. */
export interface GbcStamp { width: number; height: number; cells: { metatileId: number }[]; }

export function paintCells(blocks: Block[], gridWidth: number, gridHeight: number,
  targets: { x: number; y: number }[], stamp: GbcStamp, originX: number, originY: number): Block[];

export function floodFill(blocks: Block[], gridWidth: number, gridHeight: number,
  x: number, y: number, metatileId: number): Block[];
```

Semantics are GBA's, minus the field merge:
- `paintCells`: tiling is anchored at `(originX, originY)`, with the same modulo as GBA. An out-of-grid target is skipped silently. A missing stamp cell is skipped. It never mutates its input: it returns a fresh array and copies every block (`{ metatileId }`), not only painted ones.
- `floodFill`: 4-connected on `metatileId`, bounded by the grid, iterative (explicit stack plus a `visited` `Uint8Array`). An out-of-grid start returns a fresh copy. Filling with the region's own id returns an equal fresh array.
- Every output block is exactly `{ metatileId }`: `Object.keys(b)` is `["metatileId"]`.
- Range checks are **not** done here. `guardGbcSave` (Task 1) is the gate. Keep these pure.
- Doc comments name why GBC has its own copy (no collision/elevation merge), in one or two lines each.

## Tests (TDD; commit each green step)

1. `paintCells` 1×1 stamp at (1,0) on a 3×2 grid: only index 1 changes. The input array and its elements are unchanged. The output `!==` input, and `out[0] !== in[0]`.
2. Tiling: a 2×1 stamp `[7,8]` with origin (1,0) across targets (1..3,0) on a 4×1 grid gives `[_,7,8,7]`. With origin (0,0) instead, the same targets give `[_,8,7,8]`. This pins the anchor.
3. Out-of-grid targets (`x:-1`, `x:w`, `y:h`) are ignored, with no throw.
4. Output keys: every block's `Object.keys` deep-equals `["metatileId"]` for `paintCells`, `floodFill` and `shiftGrid`.
5. `floodFill`: a 3×3 grid with a plus-shaped region of id 1 and corners id 2. Filling from the centre with 5 changes the plus only (diagonal corners untouched: 4-connected). Filling from a corner changes only that corner.
6. `floodFill` same-id is a no-op: an equal fresh array, `!==`.
7. `floodFill` 150×150 single id fills all 22,500 cells without a stack overflow.
8. `floodFill` from an out-of-grid start returns an equal fresh array.
9. `shiftGrid` (re-exported) on GBC blocks: a 3×2 shift by (1,0) wraps. Shift by (w,h) is the identity. `readBlock` returns a copy (mutating it leaves the source unchanged) and `undefined` out of grid.
10. Type check: GBA `packages/core/test/edit/paint.test.ts` still passes unchanged (run it).

## Teeth-proof (implementer runs; reviewer re-runs)

| ID | Mutation | Must go red |
|---|---|---|
| P1 | `floodFill` also pushes diagonals | 5 |
| P2 | tiling uses `t.x % w` (ignores origin) | 2 |
| P3 | `paintCells` writes into `blocks` in place | 1 |
| P4 | `paintCells` output spreads `{ ...existing, metatileId }` with an extra `collision: undefined` | 4 |
| P5 | `floodFill` without `visited` (replacement equal to target) | 6 (hangs or fails; use a 5 s test timeout so it fails, not hangs) |

## Rules

- Run single files with `node node_modules/vitest/vitest.mjs run <file>`, plus `npm run typecheck` before each commit. Don't run the full suite.
- Commit with explicit paths only: `git add <new>` then `git commit -m "..." -- <paths>`. Never `git checkout`/`restore`/`stash` to undo; revert mutations by editing and confirm with `git diff`.
- No writes outside the repo.
