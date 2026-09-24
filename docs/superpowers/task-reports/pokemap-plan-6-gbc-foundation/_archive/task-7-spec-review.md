# Plan 6 Task 7 spec review: GBC map event loader (`62b55ba` vs `244fc40`)

**Verdict: ❌ ISSUES (2).** Both are test gaps; the code has no defects. The independent corpus check found 0 mismatches. No mutation residue is in the committed code.

## Verification runs
- `npm test`: 83 files, 1001/1001 passed, 0 skipped. `npm run typecheck`: clean.
- Verbose `packages/core/test/gbc` run: 9 files, 282/282 passed, 0 skipped. `events.test.ts` has 41 tests and its corpus tests ran.
- The subject repo `pokecrystal-PerfPlus` porcelain was empty afterwards. The PokeMap tree was clean afterwards, with only untracked reports. `git diff` was empty.

## Independent whole-corpus check (my own parser, separate code)
The parser does a line-by-line walk. It tracks the current label with its own regex, strips comments by `split(";")`, splits on commas, and parses numbers with `Number()`. It checks all 6 kinds with every field plus `lineIndex`, and also `objectConsts`, against `loadGbcMapEvents` for every `maps/*.asm`.

| Check | Result |
|---|---|
| `maps/*.asm` vs `loadGbcMaps` names | 391 = 391, same set |
| Field-by-field + lineIndex, 6 kinds + objectConsts | **0 mismatches** |
| Totals | 1327 / 114 / 792 / 1468 / 170 / 105 ✅ |
| objectConsts categories | equal 350 / absent 40 / fewer 1 / more 0 ✅ |
| Defects | exactly 1: MoveDeletersHouse (1 const for 2 objects) ✅ |
| Marker present with 0 consts | CeruleanCave1F and CeruleanCave2F, each with 0 objects. They count as equal and raise no defect ✅ |
| Blank line between `object_const_def` block and a later `const` | 0 maps. So "stop at first non-const line" never truncates ✅ |
| Content between `_MapScripts:` and `def_scene_scripts` | 0 maps ✅ |
| scene_script/callback outside `_MapScripts`, or events outside `_MapEvents` | 0 ✅ |

## Spec items
| Item | Status | Evidence |
|---|---|---|
| The 6 event types + `GbcMapEvents` with the 7 fields in types.ts | ✅ | types.ts +95 lines |
| Numeric fields are only x, y, destWarp, radiusX/Y, sightRange; everything else is raw text | ✅ | hour1/hour2/palette/eventFlag are strings; `parseNum` refuses unclean input |
| Absolute `lineIndex`; array order = source order = Plan 7 ordinal (documented) | ✅ | `GbcMapEvents` doc comment; corpus matched lineIndex exactly |
| `parseMapEvents` is pure; `loadGbcMapEvents(root, map)` reads `maps/<name>.asm` | ✅ | events.ts |
| Events come only from the `_MapEvents:` section, bounded at the next label | ✅ | `labelTail`; two-map test |
| scene_scripts/callbacks come only from `_MapScripts:`, bounded | ✅ code / ❌ test | See Issue 1 |
| `objectConsts` = the `const` lines right after `object_const_def` | ✅ | corpus 0 mismatches |
| Section bounding is factored out of `locateEventCall`, not re-derived | ✅ | `labelTail` in asm.ts; the code moved verbatim; both callers use it |
| Refusal: missing `_MapEvents:` | ✅ | `labelTail: no "Foo_MapEvents:" label found` names the map through the label. It has no line number, which is fine because the label is absent |
| Refusal: wrong arg count, naming map and line | ✅ | `Foo:N: "warp_event" has 3 argument(s)…`; all 6 kinds tested |
| Refusal: def_* out of order | ✅ code / ❌ test | See Issue 2 |
| Refusal: more than 15 objects | ✅ | 15 accepted, 16 refused. My mutation M1 was caught |
| `DataDefect` when 0 < consts < objects | ✅ | Corpus pins exactly MoveDeletersHouse. My mutation M7 (`<=`) was caught |
| Arg orders for all 6 macros (object has 13 args; scene_script takes 1 or 2) | ✅ | Matches §3.1 table; corpus 0 mismatches |
| Unit tests: per kind, trailing comment, trailing-space label, bare `db 0, 0`, no final newline, dest -1, hour `-1, DAY`, scene_script with 1 and 2 args, each refusal | ✅ | All present |
| Corpus pins: 391, totals, maxima + names, BGEVENT counts, hour counts, dest -1 (6 events/4 maps), objectConsts 350/40/1, NewBarkTown field-by-field incl. lineIndex 285, every MAP_CONST real, every lineIndex starts with its macro | ✅ | All present and green |
| Extra: missing def_* marker refused; missing `_MapScripts:` refused through `labelTail` | ✅ | Consistent with the §3.1 fact of 0 violations |

## asm.ts / asmSplice.ts refactor
- ✅ `labelTail` is a verbatim move of `locateEventCall`'s label regex, next-newline tail, `LABEL_LINE_RE` cutoff and line counting. The offset and lineIndex adjustments are identical. Every Task 4 `asmSplice.test.ts` test is green, including the trailing-space and next-label tests. My mutation M3 on the label regex turned 10 tests red, including tests in both suites.
- ⚠️ Minor: the missing-label error prefix changed from `locateEventCall:` to `labelTail:`. No test asserts the prefix. It is cosmetic.

## Mutation checks (mine; each reverted, tree verified clean)
| # | Mutation | Result |
|---|---|---|
| M1 | cap 15 → 16 | caught (the >15 test) |
| M2 | `_MapScripts` scan made unbounded (whole file, offset 0) | **survived: 73/73 green** |
| M3 | label regex made trailing-space intolerant | caught (10 red, both suites) |
| M4 | coord sceneConst/script swapped | caught (unit test + NewBarkTown) |
| M5 | destWarp run through `Math.abs` | caught (unit test + corpus 6/4) |
| M6 | MapScripts lineIndex +1 | caught (4 red) |
| M7 | defect condition `<` → `<=` | caught (corpus) |
| M8 | `def_object_events` dropped from the order check | **survived: 73/73 green** |

## Issues
1. ❌ **The `_MapScripts` section bounding is untested (M2 survived).** The spec requires scene_scripts and callbacks to come only from `_MapScripts:`, bounded at the next label. Removing the bounding entirely passes every test. The two-map test ("stops at the next map's label") checks only `warps`. The implementer closed this same gap for MapEvents but not for MapScripts. Fix: give both skeletons in that test `sceneScripts`/`callbacks` and assert each map's counts. Alternatively, put a stray `scene_script` after `_MapEvents:` and assert it is not collected.
2. ❌ **The out-of-order refusal is tested only for a warp/coord swap; `def_object_events` is never exercised (M8 survived).** The spec's refusal covers the full order warp, coord, bg, object. Dropping the object marker from the check still passes every test. Fix: add one fixture with `def_object_events` before `def_bg_events`, or with `def_object_events` missing, and expect a throw matching `/def_object_events/`.

## Non-blocking notes
- ⚠️ The describe block "loadGbcMapEvents: object_const_def defect" never calls `loadGbcMapEvents` and asserts no `defects`. The defect logic is covered only by the corpus test, which skips on machines without the corpus. Consider one unit test through a temporary file, or accept this.
- ⚠️ The >15 test uses `toThrow(/16/)`. That also matches the constant text "NUM_OBJECTS 16" in the message, so the assertion is weak but harmless.
- ⚠️ `checkSectionOrder` checks marker order only; it does not check that each `*_event` sits under its own `def_*`. There are 0 such cases in the corpus and the spec does not require it.
