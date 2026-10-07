# Plan 7 Task 3 -- spec-compliance review (adversarial, Opus)

**Verdict: COMPLIANT** (0 blocking / 0 important / 4 minor). Range `72cb9a6..46e5cf9`, packages only. Baseline: asmSplice+events+lineIdentity 3 files, 65 passed (corpus tests ran, not skipped). Source files byte-clean after all mutations (`git diff -- packages` empty); PerfPlus `git status` 0 lines.

## Re-derivation vs code

| Spec point | Code | OK |
|---|---|---|
| EOL = CRLF iff text has `\r\n` | asmSplice.ts:109 `eolOf` | yes |
| insertLineAfter: refuse mid-line / line w/ `\r`,`\n`; after terminator insert `line+eol`; at EOF `text+eol+line` (no final NL kept) | :119-130 | yes (lone `\r` -> F1) |
| removeLine: start at 0 or after `\n`; own terminator, else preceding one (`""` if only line) | :139-150 | yes |
| Exact inverses both ways, LF/CRLF x final/no-final | asmSplice.test 3 (x4), my corpus re-run 1564/1000 | yes |
| locateEventCalls same `labelTail` bounding; locateEventCall thin wrapper, same messages | :76-99; old messages kept (`locateEventCall:` prefix even from the plural) | yes |
| Existing asmSplice tests byte-unchanged | `git diff 72cb9a6..46e5cf9 -- .../asmSplice.test.ts` has 0 `-` lines; 33 old tests green | yes |
| Move: y (arg1) spliced before x (arg0); padding kept; same (x,y) -> `text` | events.ts:61-73 | yes (test teeth gap F2) |
| Add anchor = last call else `def_<kind>_events` marker; missing marker refuses | events.ts:114-121 | yes |
| Line format `\t<macro> pad2(x), pad2(y), rest`, pad2=`padStart(2)` | :123, :194 | yes |
| Warp: mapConsts G4 refusal; destWarp `>=1` or `-1` | :137-140 (`/^(-1\|[1-9]\d*)$/`) | yes |
| Object cap `>= 15` refuses | :176 | yes |
| Const sync: 0 consts -> none; equal -> insert after last const; mismatch -> refuse "out of step" | :101-111, :180-200 | yes |
| Auto-name `MAPNAME_<sprite minus SPRITE_>` + suffix 2,3,...; regex + uniqueness refuse | :185-190 | yes (F3 nit) |
| Delete: removeLine; paired -> also const `index`; refuse whole-word ref outside own const line; mismatch refuses; ponytail ceiling comment | :217-241, comment :210-211 | yes |
| Retarget: `mapConst===C && destWarp>=k+1`; self-map in; deleted warp excluded by (name,index) (amended 2-arg sig) | :260-272 | yes |
| Messages name map/kind/index-or-arg | `fail()` `"<map> <kind>[i]: ..."`; add names `arg N` | yes |

## Findings

1. **minor -- asmSplice.ts:104 (`terminatorAt` lone `\r`), :141.** Spec (and code) accept a lone `\r` as a terminator, but the project's line model (`asm.ts` `splitLines`/`codeLines`) only splits on `\n`. Evidence (tsx probe): `insertLineAfter("a\nb\r", 3 /*codeLines end of last line*/, "X")` -> `"a\nb\rX\n"`; `codeLines` sees `['a','b\rX','']` -- inserted line merged into the previous one AND a final newline added to a no-final-newline file; `removeLine` then refuses its own inverse (`[4,5) is not exactly one whole line`). Mid-file `"a\rb\n"` insert at 1 -> `'a\rX'` one line. Unreachable in corpus (0 CR bytes in 391 maps) -> minor. Fix: `terminatorAt` return `null` for a lone `\r` (only `\n`/`\r\n` count), so it refuses instead of silently mis-splicing; one asmSplice test.
2. **minor -- events.test.ts:68 (test gap; mutation R6 survives).** Removing the same-coord early return (events.ts:68) stays green: corpus and fixtures write every event x/y as canonical decimal (verified: 0 non-canonical x/y in all `*_event` lines), so re-splicing yields equal bytes. Early return is correct (probe: `warp_event $06, 03, ...` moved to (6,3) returns identical text). Fix: add a fixture with `$06, 03` and assert `toBe(text)`.
3. **minor (nit) -- events.ts:180-191.** `opts.objectConst` silently ignored, unvalidated, on an unpaired (0-const) map (probe: `objectConst: "bad name!"` accepted, no const added). Spec-permitted ("0 consts: no const is added"). Optional: refuse when `objectConst` is given and `!plan.paired`. Also: uniqueness only vs the file's const block; RGBDS symbols are global, so a clash with another file's symbol surfaces only at assemble time -- unflagged ceiling, spec-permitted.
4. **minor (doc) -- task-3-implementer.md "Corpus facts".** "NEWBARKTOWN_TEACHER ... 12 occurrences" is the substring count (3 are inside `SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU`); whole-word count is 9. No code impact (scan uses `\b`; test 15 asserts `>1`).

## Corpus re-verification (independent tsx script, read-only, own line splitter + own anchor rule)

| Claim | Mine |
|---|---|
| 391 maps | 391 |
| 1564 insert+remove | 1564 identical |
| 1000 remove+reinsert | 1000 identical |
| anchors: impl vs independent | 0 mismatches; 1000 last-call, 564 marker, 1 at EOF (CeruleanCave2F object marker) |
| 1562 adds, skips GoldenrodCity (15 obj), MoveDeletersHouse (1/2) | cap list `[GoldenrodCity:15]`; mismatch list `[MoveDeletersHouse 1/2]`; 1564-2=1562 |
| no-final-newline files | `[CeruleanCave2F, CeruleanCaveB1]`; 2F ends `\tdef_object_events`; B1 ends `...EVENT_FOUGHT_MEWTWO\n\t` (tab-only last line); 1F ends `\tdef_object_events\n\n\n` |
| NewBarkTown refs | TEACHER 9 whole-word, FISHER 1 (const line only), RIVAL 5. delete obj0 refuses (TEACHER), obj1 ok, obj2 refuses (RIVAL) |
| const census | 348 paired (n>0), 42 zero-const (40 no block + 2 empty block w/ 0 objects, = findings' 350/40 split), 1 mismatch |
| ponytail ceiling (other-file refs) | of 1211 deletable paired object consts, 0 referenced in any other `.asm`/`.inc` in PerfPlus |

**lineIdentity non-vacuity:** compares against `text` (fresh immutable string, never reassigned) -- not a mutated copy. Marker path exercised 564x, EOF path 1x (2F object), last-call path 1000x. Step 1's removal span is computed from the original text's terminator, so a misplaced insert either throws or fails `===`. Step 3 (`after[key].slice(0,-1)` == before, other kinds equal) catches a wrong anchor (R5 red). Gaps (acceptable, covered synthetically by asmSplice 2/3 + events 17b): the "last line w/o terminator is a real call" removeLine path never occurs in corpus; CeruleanCaveB1's missing final NL is never hit by an anchor (tab-only last line), so "covers both no-final-newline files" holds only for 2F's EOF path. E8 not visible to lineIdentity (pre-skips >=15) -- by design.

## Mutation table (each: bytes read, edit, narrowest files, bytes restored, `git diff -- <file>` empty -- all 30 confirmed)

| ID | Mutation | Result | Red |
|---|---|---|---|
| E1 | removeLine no-terminator: keep preceding terminator | RED 5 | asmSplice 2, 3 (LF/CRLF no-final), events 17b, lineIdentity |
| E2 | EOF insert `text+line+eol` | RED 6 | asmSplice 1, 3 x2, 3b; events 10; lineIdentity |
| E3 | splice x before y | RED 1 | events 6 |
| E4 | skip const insert | RED 4 | events 11, 11b, 14, lineIdentity |
| E5 | skip ref check | RED 2 | events 14c, 15 |
| E6 | `=== k+1` | RED 2 | 18, 18b |
| E7 | report `-1` (`\|\| destWarp === -1`; literal removal is equivalent) | RED 1 | 18 |
| E8 | cap `> 15` | RED 1 | 12 |
| R1 | suffix starts at 1 | RED 1 | 11 |
| R2 | const inserted after second-to-last const | RED 2 | 11, 11b |
| R3 | ref scan substring (no `\b`) | RED 1 | 14c |
| R4 | delete removes last const, not `index` | RED 2 | 14, 14b |
| R5 | anchor = first call | RED 3 | 8, 11, lineIdentity |
| R6 | drop same-coord early return | **SURVIVED** | -- (F2; equivalent on canonical numerals) |
| R7 | eolOf always `\n` | RED 3 | asmSplice 3 (CRLF x2), 3b |
| R8 | prevEol always 1 | RED 1 | asmSplice 3 CRLF no-final |
| R9 | no deleted-warp exclusion | RED 2 | 18, 18b |
| R10 | exclude by index only | RED 2 | 18, 18b |
| R11 | no CONST_NAME check | RED 1 | 11 |
| R12 | no duplicate-name check | RED 1 | 11 |
| R13 | padStart(3) | RED 5 | 8, 9, 9b, 10, 11 |
| R14 | mapName not uppercased | RED 4 | 11, 11b, 12, 14 |
| R15 | mismatched consts not refused | RED 2 | 12, 16 |
| R16 | destWarp 0 allowed | RED 1 | 13 |
| R17 | mapConsts check off | RED 1 | 13 |
| R18 | removeLine startOk always true | RED 1 | asmSplice 4 |
| R19 | insertLineAfter accepts line breaks | RED 1 | asmSplice 4 |
| R20 | ref scan includes own const line | RED 3 | 14, 14b, 14c |
| R21 | x/y range check off | RED 1 | 12 |
| R22 | y not spliced on move | RED 2 | 6, 6b |

Survivors: R6 only.

## Implementer concerns

| # | Verdict |
|---|---|
| 1 E7 equivalent | Agree: `destWarp >= k+1`, k>=0 excludes -1 structurally; semantic mutant red. Spec E7 should be reworded. |
| 2 test 14 widened | Accept: spec 14 is delete-only and cannot see E4; add-result guard + object-only teeth control is correct (E4 red on 14 confirmed). |
| 3 red-first caveat | Accept: teeth established by E1-E8 + my R1-R22. |
| 4 extra validation (args 4/5/10 numeric) + consistency throw | Accept: keeps re-parse failure unreachable as spec demands; duplicated `parseObjectConsts` rule is guarded by the `names.join() !== objectConsts.join()` throw (events.ts:103), never fired over 391 maps. |
| 5 exported `eventInsertAnchor` | Accept: makes lineIdentity anchor exactly as add; independently cross-checked (0 mismatches vs my own rule). |
| 6 objectConst ignored on unpaired map | Spec-permitted; see F3 (optional refusal). |
| 7 whole-file scan incl. comments; other files not scanned | Correct per spec (false positives only = safe direction); ceiling 0 hits on PerfPlus. |
| 8 lone `\r` | Not benign: see F1 (silent line merge + final NL added). Minor because unreachable in corpus. |
| 9 autocrlf warnings | Confirmed harmless: `git ls-files --eol` i/lf for all 5 files; no CR bytes in sources. |

## Spec facts found wrong / imprecise

- E4 "must go red: 11, 14": original test 14 (delete) cannot detect an add mutation (implementer fixed by widening).
- E7 as worded ("doesn't exempt -1") is an equivalent mutant under the specified `>= k+1` rule.
- `insertLineAfter` refusal rule admits a lone `\r` as terminator, inconsistent with `codeLines` (F1).
- Part C "covers both no-final-newline files": only CeruleanCave2F reaches the EOF path; CeruleanCaveB1 ends in a tab-only line no anchor touches.
- All other corpus facts (391, NewBarkTown lines/consts, 2F ending, MoveDeletersHouse 1/2, GoldenrodCity 15) correct.
