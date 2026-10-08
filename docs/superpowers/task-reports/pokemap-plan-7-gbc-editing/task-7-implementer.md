# Plan 7 Task 7 implementer report (G5 write gate)

**Status: DONE_WITH_CONCERNS** (concerns = spec/real-code limits below; none block the gate)

## Commits (branch plan-7-gbc-editing)
| sha | what |
|---|---|
| e335101 | pret as 2nd root: `pokemap.config.json` gbc.referenceProjects; `session-start.sh` (PINNED entry `pokecrystal` @ 3bc8daa4..., cloud config `$CORPUS/pokecrystal`; `bash -n` ok, hook not run); asmSplice.test.ts per-root pins |
| 55f7323 | `writeGate.test.ts` (new) + `copyGbcRootToTemp` (corpus.ts; `copyGbcSubjectToTemp` = 1-line call) |
| 6f0e278 | gate: removed restore-on-failure from B4 catch (it masked failed round trips from B5; found by G2) |
| (next) | this report |

Files: pokemap.config.json; .claude/hooks/session-start.sh; packages/core/test/gbc/helpers/corpus.ts; packages/core/test/gbc/write/{asmSplice,writeGate}.test.ts. No src change. Nothing under packages/ui touched.

## Part A: pret through the 5 gbcCorpusRoots() files
blocks, map, tileset, lineIdentity: green on pret unchanged (subject pins were already root-guarded). Only asmSplice.test.ts failed on pret (2 tests).

| pret-only discrepancy | evidence | decision |
|---|---|---|
| 388 maps not 391 | `ls maps` diff: pret lacks CeruleanCave{1F,2F,B1}.{asm,blk}; subject has BillsBrothersHouse.asm where pret has BillsOlderSistersHouse.asm. 391-3 = 388; scripts.asm INCLUDEs = 388 | real data; per-root `PINS` |
| per-macro call totals differ | measured by scratch script (deleted): pret warp 1312 (subj 1327, -15), object 1466 (-2), callback 103 (-2), map_attributes/map/map_const 388; coord 114, bg 792, scene_script 170, connection 142, tilecoll 2368 identical | real data (CeruleanCave maps); per-root pins |
| `map_attributes` arg count {3} on pret, {4} on subject | vanilla `map_attributes NewBarkTown, NEW_BARK_TOWN, $05` vs PerfPlus `..., $05, WEST \| EAST` | real data (PerfPlus adds a flags arg); pinned `attrArgc` per root |
| test accumulated `counts` across roots (would double-count once a 2nd root exists) | code read | restructured: counts reset per root, assertions moved into the loop (U1) |
| spec expected 3 no-final-newline files, `kanto_grass.asm` terminated | measured: subject no-final-newline maps = CeruleanCave2F, CeruleanCaveB1 only (2, not 3; CeruleanCave1F ends in LF); pret = 0. kanto_grass not examined (no test touches it) | spec number off by one; no test depends on it |

### Existing-test edits (U1)
- `asmSplice.test.ts`: import `GBC_SUBJECT_ROOT`; added `PINS`/`PRET_PINS` (maps, attrArgc, 11 counts per root); test "enumerates 391 maps" now `toHaveLength(PINS[root].maps)`; the big no-op test: `counts`/`argCountsSeen` are `let`, reset per root, count and arg-set assertions moved inside the root loop and parameterised from PINS (subject values unchanged: 391, 1327, 114, 792, 1468, 170, 105, 391, 142, 391, 391, 2368; map_attributes args {4}). Reason: those pins were subject-only but the loop ran every root. No assertion weakened.
- `corpus.ts`: `copyGbcRootToTemp` added, subject helper delegates (spec'd).

## writeGate.test.ts (12 tests = 6 phases x 2 roots, one `it` per phase)
B1 baseline snapshot (maps/ + blocks.asm + attributes.asm) + layout classify; B2 binary round trip; B3 non-writable refuses (vacuous on pret); B4 events (move / delete-last + re-add / add-then-delete, all maps x 4 kinds); B5 whole-tree compare copy vs real root (.git excluded, no .pokemap); B6 pinned stats. `afterAll`: removeTemp, then real-root `git status --porcelain` equals the pre-run value. PerfPlus and pret porcelain verified empty after every run.

### Pinned counts
| | subject (PerfPlus) | pret @ 3bc8daa |
|---|---|---|
| maps | 391 | 388 |
| distinct layouts / writable | 257 / 255 | 254 / 254 |
| non-writable | CeruleanCave2F, CeruleanCaveB1 | none |
| binary round trips | 255 | 254 |
| moves warp/coord/bg/obj | 384/44/223/349 | 381/44/223/348 |
| delete+re-add | 379/44/223/226 | 379/44/223/226 |
| add+delete | 7/347/168/42 | 7/344/165/40 |
| objectSkips | 122 = 72 sole-object-with-const + 48 const-referenced + 2 const-line-not-canonical (MountMoonGiftShop, CopycatsHouse2F) | 122, same split |
| reAddSkips (non-canonical last line) | 6: CeruleanCave1F/2F/B1 warp, BurnedTower1F warp, BlackthornGym2F warp, MoveDeletersHouse object | 2: BurnedTower1F warp, BlackthornGym2F warp |
| addSkips | 0 | 0 |

Full name lists are pinned in the test source. A pret or PerfPlus bump must re-measure (comment in file).

### Spec deviations vs real code/corpus (decisions)
1. **Delete-last + re-add cannot be byte-identical for every line.** `addGbcEvent` regenerates `\t<macro> <x2>, <y2>, rest`, dropping trailing comments and odd spacing (BurnedTower1F `; inaccessible...`, BlackthornGym2F `; hole`, CeruleanCave warps with `CERULEAN_CITY,    7`, MoveDeletersHouse). Both roots. Decision: check before deleting that the line equals the canonical shape; otherwise record in `reAddSkips` (pinned) and leave it untouched. The assertion still holds for every canonical line.
2. **Sole object + const (72 maps, both roots):** deleting the only object leaves an empty const block; `objectConstPlan` then treats the map as unpaired, so re-add with `objectConst` refuses. By design in events.ts, but the spec's "re-add restores the const" cannot hold. Skipped before deleting, pinned.
3. **Const line with trailing comment** (`const X ; day only`): re-add loses the comment. Skipped, pinned (2 maps).
4. "const referenced" skips: 48 maps in both roots, as spec'd. "consts out of step" (MoveDeletersHouse) is caught earlier by the non-canonical check, so objectSkips has no out-of-step entry.
5. B4 add on object-less maps: donor = first map's first object_event args; 0 skips.

### Runtime (machine shared with 2 reviewers; noisy)
Whole file 113-126 s. Last green run per phase: subject B4 46.8 s, pret B4 59.7 s, B5 1.7 s / 6.6 s, B2 2.1 s / 1.5 s. No single root phase above 120 s; the file total is ~2 min. `vi.setConfig({testTimeout: 300_000})` set in the file (disclosed, not hidden).

## Mutation table (subject only, `-t subject`; each restored, `git diff -- packages/core/src` empty)
| ID | mutation | observed |
|---|---|---|
| G1 | commitGbcSave writes `Buffer.from(block ids)` (drop patch) | gate GREEN: no writable layout is oversize (writable means file size == w*h). Equivalent for the gate, as the spec allows. `save.test.ts` test 7 RED ("[3,2,3,4] vs [3,2,3,4,77]") |
| G2 | asm written with trailing `\n` | B4 RED (1564 failures), B5 RED (391 files differ), B6 red |
| G3 | insertLineAfter at EOF appends `line + eol` | B4 RED: "CeruleanCave2F object: add-then-delete is not byte-identical"; B5 RED (CeruleanCave2F.asm) |
| G4 | removeLine last line keeps preceding terminator | B4 RED, same CeruleanCave2F object message; B5 RED |
| G5 | addGbcEvent inserts const before the last const | B4 RED (181 failures, objects); B6 red |
| G6 | stray `maps/zz.txt` write injected in commitGbcSave | B4 green, B5 RED (copy has 1 extra file): the whole-tree walk catches it. A mutated walk that skips maps/ was not run |
| G7 | removeTemp not called | not run (report only) |

Note: the first G2 run (B4 catch still restoring files) left B5 green, hiding the bad write; fixed in 6f0e278 and G2 re-run. G3/G4/G5 were re-checked post-fix for the lines above.

## Concerns
- Deviations 1-3 are product limits of the add op (regenerated line shape; sole-object const) worth a decision before users hit them. Move and plain delete are unaffected.
- File total ~2 min; on a loaded machine it can approach the 120 s the spec cares about.
- git warns "LF will be replaced by CRLF" on edited test files (autocrlf); commits unaffected.
- `.codex/` untracked is pre-existing.
- Part C (full `npm test`, UI build) is left to the coordinator. Verified here: typecheck green; gbc test files writeGate 12, asmSplice 43, lineIdentity 1, save 15, blocks 10, map 58, tileset 69 all pass.

---

# Fix round 1

**Correction:** the original report claimed a `PINNED` hook entry for pret; the diff had none (only the config line). Added now (2428ac6).

Status: DONE_WITH_CONCERNS. Touched only packages/core/**, pokemap.config.json (none this round), .claude/hooks/session-start.sh. PerfPlus and pret porcelain empty after every run.

## Commits
| sha | what |
|---|---|
| 2428ac6 | hook: `PINNED` entry `pokecrystal\|https://github.com/pret/pokecrystal\|3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6` after PerfPlus (`bash -n` ok); diff is that one line |
| 61a8e05 | F3 product fix: pair object consts by `object_const_def` marker. New export `objectConstDefLine(text)` in `load/events.ts` (no `GbcMapEvents` change); `edit/events.ts` `objectConstPlan` uses it (marker present => paired, consts must === objects, 0 === 0 ok; add inserts the first const straight after the marker when the block is empty); `write/guards.ts` desync rule keyed on `objectConstDefLine(originalEventsText) !== null`. Tests below |
| 572c9d2 | gate rework (F2, I1-I6, m1-m5, m7, m9, F4), `gbcRootLabel`, asmSplice root tags |
| (next) | this section |

## Existing-test edits (named)
- `edit/events.test.ts` 10 (CeruleanCave2F object add): empty marker + 0 objects is now paired, so the add also inserts `const CERULEANCAVE2F_TEACHER` after the marker; expected text and `objectConsts` updated. Old rule asserted no const.
- `edit/events.test.ts` 11d: the empty-block case (marker, 0 consts, 2 objects) now refuses with `out of step` (both with and without `objectConst`); the no-marker `objectConst` refusal assertion is unchanged.
- `write/lineIdentity.test.ts`: `paired` is now `objectConstDefLine(text) !== null` (was `objectConsts.length > 0`), same skip rule, so CeruleanCave2F's add still expects +1 const.
- `write/asmSplice.test.ts` (I4/m2/m9): pins inline under `PINS`, `gbcRootLabel(root)`, counts compared as one `toEqual(pins.counts)`, every in-loop assert root-tagged. No pin value changed.
- Task 1 guard tests, Task 3 events tests other than 10/11d, save/load tests: unchanged and green.
- New tests: `events.test.ts` 11f (delete sole object + re-add with const => identical text; derived const also added; marker survives empty); `guards.test.ts` "marker-present 0-const 0-object map": object + const => no refusal, object alone => `object-const-desync`.

## Gate changes (writeGate.test.ts, corpus.ts)
F2 `every configured corpus root is present` (roots === [subject, ...GBC_REFERENCE_ROOTS]; whole file skips only when the subject itself is absent). I1 pins are counts by reason plus the few named exceptions (no 120-string lists); pret derived from subject via spread. I2 `moveRoundTrip`/`deleteReAdd`/`addDelete` helpers, `call` computed once. I3 `at(step, f)` prefixes sub-step; asserts `failures.slice(0,20)` with total in message. I5 B2/B3 assert the pinned writable/non-writable classification; comment that a dirty copy after a B4 failure intentionally makes B5 red. I6 `try { expect(porcelain) } finally { removeTemp }`; helper retries 10 x 200 ms; mkdtemp split from cpSync with cleanup on failure. m1 per-test timeouts (heavy 180 s, others 60 s; global `vi.setConfig` removed). m2 `gbcRootLabel` throws on unknown root. m3 re-measure comment (`-t B6`). m4 walk only `maps` for the snapshot. m5 B5 uses set diffs (extra / missing / differing). m6 `git --no-optional-locks`. m7 B2 asserts the plan path ends with the layout's blkPath. F4 move asserts the single differing line is event 0's line index.

## New pins (after F3)
| | subject | pret |
|---|---|---|
| deleteReAdds w/c/b/o | 379/44/223/**286** (was 226, +60) | 379/44/223/**287** (was 226, +61) |
| constReferenced (was 48) | **60** | **59** |
| lineNotCanonical | same 6 names | same 2 names |
| constLineNotCanonical | MountMoonGiftShop, CopycatsHouse2F | same |
| outOfStep | [] | [] |
| moves, addDeletes, layouts, binary | unchanged | unchanged |
Note: the 72 sole-object-with-const skips became 60 (subject) / 61 (pret) real round trips; the other 12 / 11 sole objects have their const referenced elsewhere, now counted in `constReferenced` (48 -> 60 / 59).

## Mutation table (subject, `-t subject`; each restored, `git diff -- packages/core/src` empty)
| ID | mutation | observed |
|---|---|---|
| G1 | blk re-encode instead of patch | gate green (equivalent, as before); `save.test.ts` 7 RED |
| G2 | asm + trailing newline | B4, B5, B6 RED |
| G3 | EOF insert appends `line + eol` | B4, B5, B6 RED |
| G4 | removeLine EOF keeps preceding terminator | B4, B5, B6 RED |
| G5 | const inserted before the last const | B4, B5, B6 RED |
| G6 | stray `maps/zz.txt` in commit | B5 RED only |
| M3 | patch writes `bytes[i+1]` | B2, B5, B6 RED |
| M5 | delete removes const[0] | B4, B5, B6 RED |
| M6 | move swaps x/y | B4, B5, B6 RED |
| M8 | layout-not-writable guard disabled | B3 RED |
| F3 | `objectConstPlan` back to `names.length === 0` | gate B4, B5, B6 RED (sole-object round trips); events 10, 11d, 11f RED; lineIdentity RED |
| F3g | guard back to `originalEvents.objectConsts.length > 0` | guards "marker-present" test RED |
M1, M2, M7 (spec-review survivors) not re-run: out of gate scope / need a test edit, unchanged by this round. The two-part G6 variant (walk skipping maps/) not run.

## Runtime
Full writeGate file 149 s in the last green run (machine shared with the coordinator's UI mutation runs; 47 s and 117 s on earlier runs this round). Per-phase B4 13-17 s per root when quiet, up to ~65 s under load.

## Verified
typecheck green; writeGate 13, asmSplice 43, lineIdentity 1, save 15, guards 16, edit/events 28, edit/paint 18, load/{events 51, blocks 10, map 58, tileset 69} all pass; `bash -n` hook ok.

## Concerns
- F3 changes product behavior for 2 real maps (empty marker, 0 objects): adding an object there now also adds a const; and an empty marker with objects > 0 refuses as out of step (no such corpus map).
- Remaining skips are line/comment-canonicalisation (accepted in spec review) and 60/59 const-referenced objects.
