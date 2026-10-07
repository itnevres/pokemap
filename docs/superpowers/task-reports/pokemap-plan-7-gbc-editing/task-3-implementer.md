# Plan 7 Task 3 -- implementer report

**Status: DONE_WITH_CONCERNS** (concerns: E7 equivalent mutant; test-14 widened; red-first caveat; extra validation -- see Concerns)

## Commits (branch plan-7-gbc-editing, base 72cb9a6)

| SHA | Subject |
|---|---|
| d854246 | feat(core): GBC line insert/remove primitive and locateEventCalls |
| 37e7e20 | feat(core): GBC event add/move/delete ops and warp-renumber scan |
| 89c3286 | test(core): corpus line-identity proof for GBC insert/remove/add |
| e335df3 | test(core): feed object add result into guardGbcSave too (test 14) |
| (this report) | docs(plan-7): Task 3 implementer report |

## Files

| File | Change |
|---|---|
| packages/core/src/gbc/write/asmSplice.ts | + `insertLineAfter`, `removeLine`, `locateEventCalls`; `locateEventCall` now a thin wrapper (same messages/behaviour) |
| packages/core/src/gbc/edit/events.ts | new: `moveGbcEvent`, `addGbcEvent`, `deleteGbcEvent`, `findGbcWarpsRetargetedByDelete` (amended 2-arg signature), `GbcEventKind/Edit/RenumberWarning`, + exported `eventInsertAnchor` (see Concerns) |
| packages/core/test/gbc/write/asmSplice.test.ts | +98 lines, 0 deleted (verified `git diff` has no `-` lines): 2 new describes at end; extra `import` sits just above them so old bytes are untouched |
| packages/core/test/gbc/edit/events.test.ts | new, 22 tests |
| packages/core/test/gbc/write/lineIdentity.test.ts | new, 1 corpus test |

Final run (asmSplice + events + lineIdentity + save + guards): 5 files, 95 passed. `npm run typecheck` clean. asmSplice.test.ts 42 = 33 old (unchanged, green) + 9 new.

## Tests

| Spec # | Where | Test(s) | Result |
|---|---|---|---|
| 1 | asmSplice | 1 | pass |
| 2 | asmSplice | 2 | pass |
| 3 | asmSplice | 3 x4 shapes (LF/LF-nofinal/CRLF/CRLF-nofinal, every line both directions), 3b (CRLF/LF EOL choice) | pass |
| 4 | asmSplice | 4 (mid-line offset, offset past end, line with \n / \r, removeLine mid-line start/end, span over 2 lines) | pass |
| 5 | asmSplice | 5 (count, offsets, == locateEventCall, section bound), 5b (missing label); old locateEventCall tests green | pass |
| 6 | events (corpus) | 6 NewBarkTown warp0 -> (12,4): exact `\twarp_event  12,  4, ELMS_LAB, 1`, prefix/suffix identical, events.warps[0]; same-coord `toBe(text)`. 6b synthetic object/warp | pass |
| 7 | events | 7 x=256,-1,1.5, y=NaN/256, idx 1/-1 (warp), coord[0] on empty section; names map/kind/index | pass |
| 8 | events (corpus) | 8 exact text == `text.replace(anchor, anchor+new)`, bgs 5 | pass |
| 9 | events | 9 (coord after marker), 9b (warp last-call anchor, bg marker anchor, pad2 widths 12/13, 0/255), 9c (missing marker refuses) | pass |
| 10 | events (corpus) | CeruleanCave2F: result === text + "\n" + line, no final \n, objectConsts stays [] | pass |
| 11 | events (corpus) | 11 NewBarkTown: line appended, `\tconst NEWBARKTOWN_TEACHER2` after RIVAL, explicit `NEWBARKTOWN_GUIDE`, TEACHER3 on 2nd add, bad/dup names refuse (5 cases); 11b synthetic; 11c no-const map gets none | pass |
| 12 | events | 15-object fixture refuses, 14 ok; out-of-step (1 const/2 obj) refuses; wrong arg count (object, bg); `,` `;` `\n` leading/trailing space empty in arg; x/y 256, -2, `$10`; non-numeric radius | pass |
| 13 | events | mapConsts miss refuses (no set = unchecked); destWarp 0, -2, 1.5, x refuse; -1 and 12 accepted | pass |
| 14 | events | 14 delete obj0 of TESTMAP: line+const gone, exact text, pairing; `guardGbcSave` (via makeFixture/stubGbcProject, real tmpdir) no `object-const-desync`; also add result passes guard, and an object-only add is flagged (teeth) ; 14b middle delete pairs; 14c whole-word ref refuses (code, comment), lookalikes TESTMAP_10 / SCENE_TESTMAP_1 do not | pass |
| 15 | events (corpus) | NewBarkTown object 0 refuses, names NEWBARKTOWN_TEACHER | pass |
| 16 | events | 0-const delete removes just the line; out-of-step delete refuses | pass |
| 17 | events | 17 warp delete one line; idx/kind out of range; 17b last-line-no-final-newline keeps it | pass |
| 18 | events | 18 (k=1: reports 2,3; not 1, -1, other const; same map in; deleted warp out), 18b (excluded by name+index only; k=0) | pass |
| Part C | lineIdentity | 1 corpus test | pass |

## lineIdentity measured (PerfPlus, the only root; reference list empty)

391 maps; 1564 insert+remove (391x4, all identical); 1000 remove+reinsert (kinds with >= 1 call); 1562 `addGbcEvent` checks (+1 of kind, all else equal ignoring lineIndex, consts +1 iff object on a paired map). 2 object adds skipped, pinned: `GoldenrodCity` (15 objects) and `MoveDeletersHouse` (1 const/2 objects). Failures `[]`. Runtime 0.6-1.3 s test body (1.1-1.8 s file wall). Includes both no-final-newline files and CeruleanCave1F. Asserts 391 only when root === subject root. Read-only: PerfPlus `git status` clean afterwards.

## Mutations (each: edit, run narrowest files, restore by edit, `git diff -- <file>` empty -- all confirmed)

| ID | Mutation as applied | Result | Red tests |
|---|---|---|---|
| E1 | removeLine last line: drop preceding terminator (`lineStart - 0*prevEol`) | RED (5) | asmSplice 2, 3 (LF-nofinal, CRLF-nofinal), lineIdentity, events 17b |
| E2 | insertLineAfter at EOF appends `line + eol` | RED (6) | asmSplice 1, 3 (x2), 3b; events 10; lineIdentity |
| E3 | move splices x before y | RED (1) | events 6 only (6b passes: equal-length digits, so stale offsets not hit) |
| E4 | add skips const insert (`&& Math.random() > 2`) | first run (before test 14 widened): RED 11, 11b, lineIdentity, **not 14**; after widening test 14: RED (4) | 11, 11b, 14, lineIdentity |
| E5 | delete skips reference scan | RED (2) | 15, 14c |
| E6 | retarget `=== k+1` instead of `>= k+1` | RED (2) | 18, 18b |
| E7 | see note: literal "remove -1 exemption" is an equivalent mutant; applied `\|\| destWarp === -1` instead | RED (1) | 18 |
| E8 | cap `> 15` instead of `>= 15` | RED (1) | 12 (lineIdentity stays green: it pre-skips 15-object maps itself) |

## Corpus facts (PerfPlus, read directly)

| Spec fact | Verdict |
|---|---|
| NEWBARKTOWN_TEACHER referenced elsewhere in NewBarkTown.asm | OK: 12 occurrences incl. const line (e.g. `turnobject NEWBARKTOWN_TEACHER, LEFT`) |
| CeruleanCave2F ends `\tdef_object_events`, no final newline | OK; it also has an `object_const_def` with an empty block (-> test 10 adds no const) |
| MoveDeletersHouse 1 const / 2 objects | OK |
| NewBarkTown lines for tests 6, 8, 11 | OK: `\twarp_event  6,  3, ELMS_LAB, 1`; `\tbg_event  9, 13, BGEVENT_READ, NewBarkTownElmsHouseSign` (last bg); `\tconst NEWBARKTOWN_RIVAL` last const; file ends `...EVENT_RIVAL_NEW_BARK_TOWN\n` |
| Found extra | CeruleanCaveB1 ends with a tab-only line, no final newline (covered by lineIdentity); GoldenrodCity = 15 objects (cap hit) |

No spec fact was wrong; no NEEDS_CONTEXT condition.

## Concerns / deviations

1. **E7 equivalent mutant.** `destWarp >= k+1` already excludes -1 (k >= 0), so there is no exemption to remove and the literal mutation stays green. I did not add a redundant guard; the semantic mutant (report -1) is red on test 18. Suggest rewording E7 in the spec.
2. **Test 14 widened** so E4 goes red on 14 as the spec table says: spec 14 is a delete test and cannot see an add mutation. Added an add-result guard check plus an object-only control (proves the guard has teeth).
3. **Red-first:** primitive tests were observed red (9 failed, exports missing) before implementing. The events/lineIdentity tests were written before their modules but first executed after the module existed (module-not-found counted as red, never run). Their teeth are the E1-E8 runs above.
4. **Extra validation beyond spec:** object args 4, 5, 10 (radiusX/Y, sightRange) must parse as `$hex`/decimal, else refuse (otherwise the post-edit `parseMapEvents` would throw a bare parse error -- spec says validation should prevent that). An internal consistency check throws if the local const-block scan ever disagrees with `parseMapEvents.objectConsts` (the scan duplicates `parseObjectConsts`' rule because `events.ts` there doesn't export offsets and was out of scope).
5. **`eventInsertAnchor` exported** from events.ts so lineIdentity anchors exactly as `addGbcEvent` does (spec: "anchor as addGbcEvent would"); one small extra export.
6. `opts.objectConst` is ignored on a map with no const block (nothing to name); an explicit name is checked for regex + uniqueness against the file's consts only, not against other word uses in the file.
7. Delete's reference scan covers the whole file including comments (spec: "anywhere ... whole word"); other files are not scanned (`ponytail:` comment in code).
8. Lone-`\r` terminators are accepted as terminators by the primitive; not exercised by the corpus (all LF).
9. git prints "LF will be replaced by CRLF" warnings (core.autocrlf=true); working-tree files are LF and the index is LF -- no EOL change committed.
