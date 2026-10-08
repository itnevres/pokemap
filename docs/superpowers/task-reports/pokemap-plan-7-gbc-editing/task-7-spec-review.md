# Plan 7 Task 7 spec-compliance review (G5 write gate)

**Verdict: ISSUES** (0 blocking / 1 important / 3 minor). Range `cc319e9..fd051c7` (core, config, hook). Gate itself is real, non-vacuous and has teeth; the one important issue is the cloud hook.

## Findings

1. **IMPORTANT. `.claude/hooks/session-start.sh:46-53`: pret is NOT in `PINNED`.** Range diff touches only line 107 (`referenceProjects: ["$CORPUS/pokecrystal"]`). `grep 3bc8daa` in the hook gives 0 hits, and so does `git log -S3bc8daa -- .claude/hooks`. The implementer report's claim "PINNED entry `pokecrystal` @ 3bc8daa4..." is false. Effect in cloud: the config names a dir that is never fetched, so `hasGbcProject` is false and `gbcCorpusRoots()` silently drops pret. The pret leg of writeGate and of the asmSplice/blocks/map/tileset/lineIdentity tests never runs, with no failure. `bash -n` OK. **Fix:** add `"pokecrystal|https://github.com/pret/pokecrystal|3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6"` after the PerfPlus entry. That gives the same shape and `$CORPUS/<name>` path as PerfPlus.
2. **MINOR. `writeGate.test.ts:567-569`: no presence check.** Nothing asserts that the configured roots are all present, so an absent pret yields a subject-only green gate. This compounds #1. The roots-empty case falls to `it.skip`, which is the accepted repo pattern. **Fix:** `expect(roots).toEqual([GBC_SUBJECT_ROOT, ...GBC_REFERENCE_ROOTS])` when a gbc block is configured (or fail per missing reference root).
3. **MINOR (product, not gate). `edit/events.ts:91-98` `objectConstPlan`.** An empty `object_const_def` reads as `paired:false`. After the sole object of a const-paired map is deleted, add refuses `objectConst` and adds the object without a const. The pairing is lost for good, so scripts can't address the new object by name. This hits the 72 "sole object with const" maps per root (deviation 2). Measured: the corpus has 2 maps with an empty def block, both with 0 objects, and 40 with no def. So "the def marker is present ⇒ paired (with 0)" is a safe rule. **Fix (follow-up task):** key `paired` on the marker's presence; the guard's desync rule (`guards.ts` `originalEvents.objectConsts.length > 0`) needs the same change. Gate skip OK meanwhile, pinned.
4. **MINOR. `writeGate.test.ts:460-463`: the move check is loose.** It counts differing lines (`=== 1`) but does not check that the line is event 0's or that only the x span changed. A move that hits the wrong line of the same kind still fails on the move-back identity check (M6 red), so the gap is narrow. **Fix (optional):** assert that the differing index is event 0's line.

Non-findings, checked:
- **Funnel.** Every write goes `openGbcEditSession` → edit op → `planGbcSave` → `commitGbcSave` (B2:403-418, B4 `commit()`:364-369). There is no direct `writeFileSync` in the test.
- **Snapshot timing.** B1 snapshots the copy before any write. B2 and B4 compare against that snapshot, not the live disk. B5 compares copy against the real root: it walks the whole tree, excludes only `.git`, checks the file-list equality and every byte, and checks there is no `.pokemap`.
- **Skip lists can't grow silently.** `objectSkips`, `reAddSkips` and `addSkips` are pinned by B6 `toEqual` (M4 red).
- **Root safety.** `afterAll` compares each real root's porcelain to its pre-run capture.
- **No layout cache.** `project.layout` is uncached (`project.ts:35`), so the B2 paint-back session sees the post-commit bytes. The round trip is real, not a no-op.

## U1 `asmSplice.test.ts`
- Subject values are unchanged: maps 391; warp 1327, coord 114, bg 792, object 1468, scene_script 170, callback 105, map_attributes/map/map_const 391, connection 142, tilecoll 2368; attr argc {4}.
- Only `map_attributes`'s argc set was parameterised. The other arg sets are unchanged and hold on both roots.
- `counts` and `argCountsSeen` reset per root, and the assertions moved inside the loop. `failures` is not reset, which is stricter.
- Nothing is weakened.
- Note: any non-subject root maps to the pret pins. A third root would fail loudly, which is acceptable.

## Mutation table (subject, `-t subject`; each restored, `git diff -- <file>` empty, PerfPlus+pret porcelain empty after every run)
| ID | mutation | result |
|---|---|---|
| BASE | none | green, 6/6, 21 s (pret 6/6, 30 s) |
| G1 | re-encode blk | not re-run. Equivalence confirmed by code: `loadLayout` throws when undersize and marks oversize `writable:false`, so writable ⇒ size==w*h ⇒ re-encode≡patch. Accept implementer's save.test #7 red |
| G2 | asm + `"\n"` | RED B4 (1564), B5 (391 files), B6 |
| G3 | EOF insert `line+eol` | RED B4 (1, CeruleanCave2F), B5, B6 |
| G4 | removeLine EOF drops own text only | RED B4 "CeruleanCave2F object: add-then-delete", B5, B6 |
| G5 | const inserted before last const | RED B4 (181), B5 (181 files), B6 |
| G6 | stray `maps/zz.txt` in commit | RED B5 (4649 vs 4648 files) |
| M1 | guard file-changed-on-disk disabled | **SURVIVES**: the gate never races the disk. Out of gate scope; covered by `guards.test.ts` |
| M2 | `layoutSharedBy: [mapName]` | **SURVIVES**: display-only summary. Covered by `save.test.ts` #2 |
| M3 | patch writes `bytes[i+1]` | RED B2, B5, B6 |
| M4 | test: skip every coord re-add | RED B6 (skip list pinned) |
| M5 | delete removes const[0] not const[index] | RED B4, B5, B6 |
| M6 | move swaps x/y splice | RED B4, B5, B6 |
| M7 | stray new file + test drops `expect(copy).toEqual(real)` (546) | **SURVIVES** (double mutation): new-file detection rests on line 546 alone. It is present and correct; no action |
| M8 | layout-not-writable guard disabled | RED B3 |

Survivors: M1, M2 (out of scope, covered elsewhere) and M7 (needs a test edit). None indicates a gate gap within spec.

## Independent re-measurement (fresh read-only node script + grep, not project code)
| item | subject | pret | gate pin |
|---|---|---|---|
| maps (scripts.asm INCLUDE / maps.asm `map`) | 391/391 | 388/388 | match |
| distinct layouts / writable | 257/255 | 254/254 | match |
| non-writable | CeruleanCave2F, B1 (400 B vs 135) | none | match |
| maps having warp/coord/bg/obj (=moves) | 384/44/223/349 | 381/44/223/348 | match |
| add+delete (391−has / 388−has) | 7/347/168/42 | 7/344/165/40 | match |
| delete+re-add | 379/44/223/226 | 379/44/223/226 | match |
| sole-object-with-const | 72 | 72 | match |
| const-referenced | 48 | 48 | match |
| const line non-canonical | MountMoonGiftShop, CopycatsHouse2F | same | match |
| reAddSkips | BurnedTower1F w, BlackthornGym2F w, MoveDeletersHouse o, CeruleanCave1F/2F/B1 w | BurnedTower1F w, BlackthornGym2F w | match (sets) |
| map_attributes argc | {4} | {3} | match |
| warp/coord/bg/obj/scene/callback calls | 1327/114/792/1468/170/105 | 1312/114/792/1466/170/103 | match |
| no-final-newline maps | CeruleanCave2F, B1 | none | implementer right; spec's "3" was wrong |
| pret HEAD | — | 3bc8daa4173e… | match |

Config: `pokemap.config.json` adds only pret to `gbc.referenceProjects`; GBA keys are untouched. ✓

## Deviation verdicts
1. **Re-add canonicalises the line** (comment/spacing lost). ACCEPT. Add builds a new line by design (`\t<macro> x2, y2, rest`, matching the corpus). Undo restores text by snapshot (`server/src/gbcEditRoutes.ts` prev-snapshot), not by re-add, so comments survive undo/redo. Loss happens only when a user deletes and then manually re-adds, and then it's a new line. **Product recommendation:** acceptable behaviour, not a defect, no fix. At most a UI hint ("re-adding creates a fresh line; comments on the deleted line are not kept"). The pre-check skip is exact (equal to add's own format) and pinned.
2. **Sole object + const.** ACCEPT for the gate. It is a real product limitation; see finding 3 and recommend a follow-up.
3. **Const line with a comment.** ACCEPT (same reasoning as 1; 2 maps, pinned).
4. **48 const-referenced; out-of-step unreached.** ACCEPT. Re-measured 48. Subject's MoveDeletersHouse is caught earlier by the non-canonical check, so the `out of step` branches (lines 501, 521) are unexercised by both corpora. That is acknowledged and harmless.
5. **Donor object for object-less maps.** ACCEPT (0 addSkips).
- **G1 judged equivalent.** AGREE (see table).
- **Runtime.** The implementer reported 113-126 s for the file on a loaded machine; here subject is 21 s and pret 30 s. No phase is near 120 s. The `testTimeout` 300 s is disclosed.
