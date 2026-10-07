# Task 2 review (merged spec + quality): GBC paint tools

**Verdict: CHANGES_REQUESTED** | blockers 0 / important 3 / minor 4 | range 831cfee..1f552f3 | src files left byte-clean (git diff empty after every mutation); no commits.

## Spec checklist

| Item | Result |
|---|---|
| API exact (`GbcStamp`, `paintCells`, `floodFill` sigs, `readBlock`/`shiftGrid` re-export, L2) | OK |
| GBA `readBlock`/`shiftGrid` generic, type-only | OK. Diff = signature + `as B` casts only; bodies unchanged. GBA callers infer `Block`; `tsc --noEmit -p packages/core` clean |
| `git diff 831cfee..1f552f3 -- packages/core/test/edit/` | empty (0 bytes) |
| Semantics: anchor modulo, OOB skip, missing-cell skip, fresh copies, 4-conn iterative, keys `["metatileId"]` | impl OK; missing-cell skip, y-anchor, negative wrap, OOB, wrap-at-edge are NOT pinned by tests (F3) |
| 10 spec tests present | 13 tests exist. Spec #4 incomplete: no `shiftGrid` keys assertion (F4). Spec #5 fixture cannot kill P1 (F2). Spec #6 + P5 pairing broken (F1) |
| Baseline | GBC 13/13, GBA 16/16 green |

## Findings

1. **IMPORTANT** `packages/core/src/gbc/edit/paint.ts:61-64` (+`:67,74`). Early-return `if (targetId === metatileId)` makes `visited` dead code: after the early return, every replaced cell has id != targetId, so the id test already prevents revisits. Evidence: P5 (remove `visited` check) SURVIVES all 13 tests; P5b (remove visited check, keep early-return) also survives. Implementer report claims P5 went red ("infinite loop on same-id fill"): false for the committed code (likely also mutated the early return). Spec #6 therefore pins nothing about `visited`. GBA has no such early return; `visited` alone guards same-id there. **Fix:** delete the 4-line early-return block (L61-64). Same-id then flows through `visited` and returns an equal fresh array, so test 6 stays green (verified: 13/13 pass). P5 then goes red, but as hang/OOM: a sync loop cannot be interrupted by vitest `testTimeout`, so spec's "5 s timeout so it fails not hangs" does not work. Verified: fix+P5 run only ended (status 1) via my 25 s kill + 400 MB heap cap. Run P5 with an external timeout and record "hang/OOM" as killed.
2. **IMPORTANT** `packages/core/test/gbc/edit/paint.test.ts:66-78` (spec #5, coordinator fixture flaw). Plus id=2 / corners id=1: the centre's diagonals are corners with id 1 != target 2, so 8-connectivity is invisible. P1 SURVIVES. **Replacement (verified: green on impl, P1 killed):**
   ```ts
   const ids = (bs: Block[]) => bs.map((b) => b.metatileId); // file top
   it("floodFill is 4-connected: same-id cell reachable only diagonally stays unfilled", () => {
     const blocks = [1,2,1, 2,1,2, 1,2,1].map((metatileId) => ({ metatileId })); // checkerboard
     expect(ids(floodFill(blocks, 3, 3, 1, 1, 5))).toEqual([1,2,1, 2,5,2, 1,2,1]);
     expect(ids(floodFill(blocks, 3, 3, 0, 0, 5))).toEqual([5,2,1, 2,1,2, 1,2,1]);
   });
   ```
   Also correct the stale comment in the old test ("adjacent corner, different id") and the spec #5 wording (plus id / corner id are swapped vs implementation).
3. **IMPORTANT** `paint.test.ts` multiple. 9 more survivors (table below). All killed by the tests below: verified by appending them, confirming baseline green, re-running each mutation (all killed), restoring bytes (git diff empty). Add:
   ```ts
   it("floodFill does not wrap across rows at the grid edge", () => {
     const blocks = [2,2,1, 1,2,2].map((metatileId) => ({ metatileId })); // 3x2: (0,1) index-adjacent to (2,0) only via wrap
     expect(ids(floodFill(blocks, 3, 2, 2, 0, 7))).toEqual([2,2,7, 1,2,2]);
     expect(ids(floodFill(blocks, 3, 2, 0, 1, 7))).toEqual([2,2,1, 7,2,2]);
   });
   // test #3: after the no-throw assertion (or instead of it) assert the output
   const out = paintCells(grid(2,2,0), 2,2, [{x:-1,y:0},{x:2,y:0},{x:0,y:2}], {width:1,height:1,cells:[{metatileId:9}]}, 0,0);
   expect(ids(out)).toEqual([0,0,0,0]);
   it("paintCells skips a missing stamp cell", () => {
     const out = paintCells(grid(2,1,5), 2,1, [{x:0,y:0},{x:1,y:0}], {width:2,height:1,cells:[{metatileId:7}]}, 0,0);
     expect(ids(out)).toEqual([7,5]);
   });
   it("paintCells 3x2 stamp anchored at (1,1); targets left of/above origin wrap", () => {
     const targets = Array.from({length:24}, (_, i) => ({ x: i % 6, y: Math.floor(i / 6) }));
     const stamp: GbcStamp = { width:3, height:2, cells:[1,2,3,4,5,6].map((metatileId) => ({ metatileId })) };
     expect(ids(paintCells(grid(6,4,0), 6,4, targets, stamp, 1,1))).toEqual([
       6,4,5,6,4,5,  3,1,2,3,1,2,  6,4,5,6,4,5,  3,1,2,3,1,2]);
   });
   it("paintCells/floodFill drop foreign fields on every block, painted or not", () => {
     const tainted = [{metatileId:1, collision:3},{metatileId:1, collision:3}] as Block[];
     const stamp: GbcStamp = { width:1, height:1, cells:[{metatileId:9}] };
     for (const out of [paintCells(tainted,2,1,[{x:0,y:0}],stamp,0,0), floodFill(tainted,2,1,0,0,4)])
       for (const b of out) expect(Object.keys(b)).toEqual(["metatileId"]);
   });
   it("shiftGrid returns fresh copies, trailing block included, keys exact", () => {
     const blocks = grid(3,2,0).map((_, i) => ({ metatileId: i })).concat({ metatileId: 99 });
     const out = shiftGrid(blocks, 3,2, 1,0);
     expect(out).toHaveLength(7); expect(out[6]).toEqual({ metatileId: 99 });
     for (const b of out) { expect(blocks).not.toContain(b); expect(Object.keys(b)).toEqual(["metatileId"]); }
   });
   ```
   Test 1 (`paint.test.ts:12`): `const original = [...blocks]` is a shallow copy, so `expect(blocks).toEqual(original)` can never see an in-place element write (M6 survives). **Fix:** `const original = structuredClone(blocks);` (verified: M6 killed).
4. **MINOR** `paint.test.ts:54-62` vs spec #4: spec requires a keys check for `shiftGrid` too; absent (covered by the F3 shiftGrid test). Implementer report also mis-numbers tests (10 rows for 13 tests; "readBlock/shiftGrid re-exported" row is spec #10) and misstates P5.
5. **MINOR** `src/gbc/edit/paint.ts:34-35` diverges from GBA (`edit/paint.ts:48-49` skips `if (!existing)`): GBC writes `out[index]` unconditionally, so a `blocks` array shorter than the grid gets holes filled instead of skipped. Unreachable with a well-formed grid; spec silent. Leave (YAGNI) unless Task 4 can pass short arrays.
6. **MINOR** `src/gbc/edit/paint.ts:51-64`: `floodFill` builds the same `blocks.map(({metatileId}) => ...)` copy 4 times (OOB, `!start`, same-id, main); comments L51/L61 narrate what the line does, not why. `!start` (L56-58) only reachable with a short array. **Fix** (after F1): build `out` once at top; `const start = inGrid ? out[y*gridWidth+x] : undefined; if (!start) return out;`; drop the narrating comments. Behaviour identical; tests 6/8 still pin it.
7. **MINOR** `paint.test.ts:87-92`: 150x150 test calls `floodFill` twice (once under `not.toThrow`, once to assert); one call + `expect(out.every(...))` suffices (a throw fails the test anyway). `src/gbc/edit/paint.ts:15-17` and `:46-47` restate "no collision/elevation" twice per function; spec asked 1-2 lines on why GBC has its own copy. Trim `paintCells` doc to one such paragraph; keep the GBA-voice paragraphs (anchor, never-mutates).

## Mutation table

Test files: GBC test file, plus GBA test file when GBA src was mutated. Each: bytes read, edit, vitest run, bytes restored, `git diff --stat -- <file>` empty (confirmed every row).

| ID | Mutation | Committed tests | With F2/F3 additions |
|---|---|---|---|
| P1 | floodFill pushes 4 diagonals | **SURVIVED** | killed |
| P2 | tiling `t.x % w` | killed | n/a |
| P3 | paintCells `out = blocks` | killed | n/a |
| P4 | extra `collision: undefined` on painted cell | killed | n/a |
| P5 | floodFill without `visited` check | **SURVIVED** (dead code, F1) | still survives until early-return removed; after F1: hang/OOM, not a clean red |
| P5b | no `visited` check, early-return kept | **SURVIVED** | same cause as P5 |
| M1 | paintCells no OOB check | **SURVIVED** | killed |
| M2 | floodFill loop no bounds check (row wrap) | **SURVIVED** | killed |
| M3 | paintCells no missing-cell skip | **SURVIVED** | killed |
| M4 | floodFill OOB start returns `blocks` itself | killed | n/a |
| M5 | GBA shiftGrid `out = blocks.slice()` (trailing block uncopied) | **SURVIVED** (GBA tests too) | killed |
| M5b | GBA shiftGrid assigns `src` uncopied | **SURVIVED** (GBA tests too) | killed |
| M5c | GBA readBlock returns uncopied block | killed (GBA + GBC) | n/a |
| M6 | paintCells also mutates input element in place | **SURVIVED** (shallow snapshot) | killed (structuredClone) |
| M7 | sy ignores originY | **SURVIVED** | killed |
| M8 | sx without negative wrap (`+w`) | **SURVIVED** | killed |
| M9 | paintCells copies via `{...b}` (foreign fields leak) | **SURVIVED** | killed |
| M10 | stamp row stride `sy*height+sx` | **SURVIVED** | killed |
| M11 | same-id early-return removed (current code) | **SURVIVED** (equivalent mutant: `visited` covers it) | equivalent |
| M12 | floodFill ignores targetId (fills all) | killed | n/a |
| M13 | same-id early-return returns `blocks` | killed | n/a |

**Survivors (committed tests):** P1, P5, P5b, M1, M2, M3, M5, M5b, M6, M7, M8, M9, M10, M11 (equivalent). F2/F3 tests kill all but P5/P5b/M11, which need F1.
