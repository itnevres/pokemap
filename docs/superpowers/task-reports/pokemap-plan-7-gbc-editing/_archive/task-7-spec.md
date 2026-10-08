# Task 7 executed spec: the G5 write gate (Plan 7's merge gate)

Plan 7 Task 7, re-granularised against the real code. Risk class: **high**. This is the merge gate: hand-derived corpus counts and byte exactness across two corpora. Reviews: Opus spec review, Sonnet quality review.

## Goal

Extend Plan 6's no-op identity proofs to **real writes through the real save funnel** (`openGbcEditSession` → edit → `planGbcSave` → `commitGbcSave`, from `packages/core/src/gbc/write/save.ts`). Cover:
- every map of the whole Crystal corpus;
- both binary (`.blk` patch) and assembly-splice (event line) writes;
- every corpus root: PerfPlus (subject) and vanilla `pret/pokecrystal` (reference, cloned at `C:\Programming Projects\Pokemon Game\refs\pokecrystal`, HEAD `3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6`).

## Part A: add pret to the corpus

1. `pokemap.config.json`: `gbc.referenceProjects` becomes `["C:/Programming Projects/Pokemon Game/refs/pokecrystal"]`. GBA keys are untouched.
2. Run every test file that iterates `gbcCorpusRoots()` (`grep -rln "gbcCorpusRoots()" packages`: today `core/test/gbc/load/{blocks,map,tileset}.test.ts` and `core/test/gbc/write/{asmSplice,lineIdentity}.test.ts`) one at a time.
   - Each must pass on pret too.
   - Subject-pinned counts are already guarded by `root === GBC_SUBJECT_ROOT`.
   - Where a test fails only on pret, decide real-data vs wrong-rule **with evidence** (the RESUME lesson: measured surprises need independent derivation). Expected pret differences: no CeruleanCave maps (388 maps?), the 3 no-final-newline files absent, `kanto_grass.asm` terminated. **Measure; don't assume.**
   - Fix a test only by making its subject-only pins explicit. Never weaken an assertion that should hold on every root. Any existing-test change is named with its reason (U1).
3. `.claude/hooks/session-start.sh` (cloud only):
   - add pret to the pinned fetch list with SHA `3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6`;
   - write `"$CORPUS/pokecrystal"` into the cloud config's `gbc.referenceProjects`.
   Mirror the PerfPlus line's exact shape. Don't run the hook (it's guarded by `CLAUDE_CODE_REMOTE`). Check it with `bash -n` only.

## Part B: `packages/core/test/gbc/write/writeGate.test.ts` (new)

**Hermetic per root:**
- Generalise the helper: `copyGbcRootToTemp(root)` in `packages/core/test/gbc/helpers/corpus.ts`, with `copyGbcSubjectToTemp()` becoming a one-line call to it.
- Each root's test copies the root once in `beforeAll` (`.git` filtered) and opens `openGbcProject(tmp)`.
- Every write goes to the copy. **Never write a real root**: `afterAll` asserts each real root's porcelain is unchanged (capture it before, compare after).

For each root in `gbcCorpusRoots()` (a `describe.each` or a loop):

1. **Baseline snapshot:** read every file under `maps/` plus `data/maps/blocks.asm` and `data/maps/attributes.asm` of the copy into memory (Buffer map).
2. **Binary round trip, every writable layout:**
   - for every distinct `blkPath` among `proj.maps`, take its first map in `proj.maps` order;
   - skip `writable:false` layouts and record them (subject: CeruleanCave2F/B1; pret: measure);
   - open a session; set block 0 to `(orig + 1) % cap` (cap = `proj.tileset(map.tileset).metatiles.length`), which guarantees a different valid id;
   - plan (exactly 1 binary change, 0 refusals) → commit → the disk `.blk` differs from the snapshot at **exactly** byte 0;
   - reopen, paint back to `orig`, commit → the `.blk` is byte-identical to the snapshot.
3. **Non-writable layouts refuse:** for each skipped layout, a session paint gives `layout-not-writable` and commit throws; the file is unchanged.
4. **Event round trips, every map:** for each of the 4 kinds:
   - **move:** if the kind has ≥1 event, move event 0 to `(x+1 ≤ 255 ? x+1 : x-1, y)` → commit → the disk asm differs from the snapshot in exactly that one line; move it back → commit → byte-identical;
   - **delete-last + re-add:** if the kind has ≥1 event, delete the **last** event of that kind. For objects, if `deleteGbcEvent` refuses (a const referenced elsewhere) or the map has out-of-step consts, record a skip and move on. Commit, then `addGbcEvent` with the deleted event's exact argument texts (read them from the line, so the original spelling round-trips), with `objectConst` = the removed const's name when one was removed. Commit → byte-identical to the snapshot. This works because add appends after the last event and inserts the const after the last const;
   - **add-then-delete:** for kinds with 0 events (anchor = marker): add a synthetic line, commit, delete it, commit → byte-identical. Use a valid bg/coord arg list; for warps, an existing map const and `1`; for objects, copy any object line from another map.
5. **Global no-stray-write proof:** after all round trips, walk the **whole copy tree** and compare every file byte-for-byte with the real root (`.git` excluded). Zero differences, and no `.pokemap` directory created. This is G7's "writes only real decomp data files" plus "nothing left changed".
6. **Pinned counts** (measure them; Plan 0 §7 rules, no guessing):
   - per root: maps, distinct layouts, writable layouts, the non-writable list, binary round trips done;
   - per kind: moves, delete+re-adds, add+deletes;
   - object skips, with names.
   Pin the subject's exact numbers. Pin pret's too, as measured from `3bc8daa`. A future pret bump re-measures; say so in a comment.

**Runtime:** report it. If one root exceeds 120 s, report it rather than silently raising timeouts. Use one `it` per root and phase so a failure names its phase.

## Part C: the gate itself

The coordinator runs the full `npm test`, typecheck and UI build after this task. That run is Plan 7's merge gate: everything green except the known 2 local-state `world.test.ts` failures.

## Teeth-proof

| ID | Mutation | Must go red |
|---|---|---|
| G1 | `commitGbcSave` writes the `.blk` re-encoded from `blocks` (drop the patch) | B5 on any oversize file. If no writable oversize file exists, this is equivalent for the gate; prove it with Task 1's test 7 instead and say so |
| G2 | `commitGbcSave` writes the asm with a trailing `\n` appended | B4, B5 |
| G3 | `insertLineAfter` at EOF appends `line + eol` | B4 on the subject (CeruleanCave2F) |
| G4 | `removeLine` (last line) keeps the preceding terminator | B4 |
| G5 | `addGbcEvent` inserts the const before the last const | B4 (objects) |
| G6 | the gate's tree walk skips `maps/` | B5 must still catch a stray write. Inject a stray write into `commitGbcSave` (e.g. also touch `maps/zz.txt`) and see B5 red |
| G7 | `removeTemp` not called | report only (not a test) |

## Rules

Same as earlier tasks: TDD where it applies (the gate is a test, so prove its teeth by mutation), commit each green step, pathspec commits, never git checkout/restore/stash, single files with vitest, `npm run typecheck`, and never write a real root (PerfPlus, pret, GBA subject).
