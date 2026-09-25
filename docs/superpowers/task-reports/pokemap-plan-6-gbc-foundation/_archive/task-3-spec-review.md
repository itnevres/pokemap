# Plan 6 Task 3 — spec-compliance review (GBC map/layout loader)

Commit `5e47614` vs `d97cb07`. Files: `packages/core/src/gbc/load/map.ts`, `packages/core/src/gbc/model/types.ts`, `packages/core/test/gbc/load/map.test.ts`. No GBA source/test touched. Subject repo porcelain empty before/after.

**Verdict: ❌ ISSUES (1)** — one test gap (trailing-comment test is vacuous; comment-strip mutation survives). Code itself is correct on the whole corpus.

## Independent re-derivation (own tsx script, own regex parsers, not the module's)

Parsed map_constants.asm (after `const_def`), maps.asm (dw order + `MapGroup_X:` labels), attributes.asm (MACRO..ENDM skipped, strict numeric regexes), blocks.asm (label(s) → next INCBIN), then compared every field of every map to `loadGbcMaps(root).map(name)` via JSON equality.

| Pin | Mine | Test | |
|---|---|---|---|
| maps | 391 (attrs 391, headers 391, consts 391; 0 orphans either way) | 391 | ✅ |
| full-record diffs, all 391 maps (group, number, w, h, blkPath, 7 header exprs, border, flags, connections) | **0** | — | ✅ |
| group/number maps.asm vs map_constants.asm, all 391 | 0 mismatches | — | ✅ |
| groups | 26; MapGroupPointers order == newgroup order for all 26 (name-normalized) | 26 | ✅ |
| NewBarkTown group | 24 (ptr idx) = 24 (newgroup idx) | 24 | ✅ |
| NewBarkTown number | 4 (maps.asm pos) = 4 (map_const pos) | 4 | ✅ |
| NewBarkTown record | 10×9, maps/NewBarkTown.blk, TILESET_JOHTO/TOWN/LANDMARK_NEW_BARK_TOWN/MUSIC_NEW_BARK_TOWN/FALSE/PALETTE_AUTO/FISHGROUP_OCEAN, border 5, flags `WEST \| EAST`, west Route29 0, east Route27 0 | same | ✅ |
| distinct blkPaths | 257 | 257 | ✅ |
| shared blks / maps | 23 / 157 | 23 / 157 | ✅ |
| House1.blk | 50 | 50 | ✅ |
| connections | 142; all targets are known map names | 142 | ✅ |
| border $00 | 272 (others: $05×23, $09×32, $0a×2, $0f×18, $2c×12, …) | 272 | ✅ |
| AzaleaTown west | Route34 ROUTE_34 -18 | same | ✅ |
| RadioTower1F music | `RADIO_TOWER_MUSIC \| MUSIC_GOLDENROD_CITY` | same | ✅ |
| shared groups agree w/h/tileset | 0 disagreements | 23 groups checked | ✅ |
| size mismatches, per map (not deduped) | CeruleanCave2F, CeruleanCaveB1: 400 vs 9×15=135; rest exact | 2 | ✅ |
| loadLayout per map (all 391, not deduped) | 2 defects, both 135 blocks, writable false; 389 maps writable; msg names file, 400, 9x15=135 | deduped by blkPath: 2 / 255 writable | ✅ |
| NewBarkTown first 20 | 05 05 18 1f 19 05 05 05 05 05 05 47 1c 77 1e 05 18 19 05 05 | same | ✅ |

Corpus edge scan: attributes.asm outside macros = only `map_attributes`/`connection`/comments/blank; maps.asm extras = `MapGroupPointers::`, per-group `table_width`, `assert_table_length` (all inert to parser); map_constants.asm extras = `const_def`, `DEF NUM_MAP_GROUPS …`; `endgroup` ignored harmlessly. No CRLF. No trailing comments on map/map_attributes/connection lines. All w/h/border/offset are plain decimal / `$hex` / `-N` (no expressions) — strict regexes had 0 unparsed lines; all 391 headers have exactly 8 args.

## Spec items

| Item | | Evidence |
|---|---|---|
| `DataDefect {file,message}` shared, doc'd | ✅ | types.ts:23-33 |
| `Connection` dir N/S/W/E, targetName/Const, raw offset; axis doc (N/S→x, E/W→y, opposite of macro comment, no conversion) | ✅ | types.ts:35-49 |
| `GbcMap` fields (raw expr strings, border number, flags string, repo-relative blkPath) | ✅ | types.ts:60-80 |
| `Layout {blkPath,width,height,blocks,writable}` | ✅ | types.ts:89-95 |
| Pure parsers `parseMapConstants/Attributes/Headers` exported | ✅ | map.ts:76,108,158 |
| MapGroupPointers order for group | ✅ | map.ts:161-181; table_width/assert lines inert, ends at next label |
| One shared strip-comment / MACRO-skip / split-args helper | ✅ | `stripComment`, `stripMacroDefs`, `splitArgs`, `matchCall` used by all 3 parsers. (parseMapHeaders repeats its label regex twice — cosmetic) |
| Args comma-split, never `\w+` | ✅ | `splitArgs`; compound music preserved |
| `$xx` hex / decimal / negative | ✅ | `parseNum`; M8 below |
| Join header↔attrs↔map_const↔`${name}_Blocks` via `parseIncbins` | ✅ | map.ts:228-281; all 391 records match independent join |
| Cross-check group/number; refuse naming map + both values | ✅ | map.ts:256-261; unit test asserts `number 1` & `number 2` |
| Refuse on join miss (name / const / blocks) | ✅ | 3 throws + 3 unit tests |
| `map(name)` throws on miss | ✅ | test `/NoSuchMap/` |
| loadLayout exact → writable, [] | ✅ | unit + corpus |
| oversize → first w×h, writable false, one DataDefect naming file/actual/w×h | ✅ | unit (40 vs 16), corpus msg verified by me: `actual size 400 bytes, declared 9x15=135` |
| undersize → throw | ✅ | mkdtemp root, cleaned in afterAll |
| Unit: MACRO body incl. legacy `connection \1, \2, \3, (\4) - (\5)` not parsed | ✅ | test L104-130; M7 kills it |
| Unit: expression args, hex border, negative offset, no final newline | ✅ | all present |
| Unit: trailing comments | ❌ | **Only trailing-comment input is on `map_const` lines, where the comment lands in the last arg `"4 ;  1"` and `parseInt` silently tolerates it.** M1 (`stripComment` → identity) passes 33/33. Demonstrated leak under M1: `map_attributes A, A, $00, WEST ; c` → `connectionFlags: "WEST ; c"`. Fix: add a trailing comment to a `map_attributes` (flags arg) and/or `map` (fishGroup arg) line in a unit test, asserting exact string. |
| Corpus pins (all listed) | ✅ | table above |
| Whole-corpus loops guarded vs vacuous pass | ✅ | `toHaveLength(391)` before loops; sharedGroups==23; seenBlk==257; raw-count test 391×3 |
| No GBA source/test changed | ✅ | diff = 3 gbc files |
| `npm test` | ✅ | 78 files / 785 tests pass |
| `npm run typecheck` | ✅ | exit 0 |
| Corpus tests actually ran | ✅ | verbose: all 11 corpus tests ✓, none skipped |

## Mutation checks (mine; all reverted, `git checkout`, tree clean)

| # | Mutation | Result |
|---|---|---|
| M1 | `stripComment` returns line unchanged | **SURVIVED 33/33** → ❌ above |
| M2 | parseMapConstants: no `number = 0` on newgroup | killed (11 fail) |
| M3 | blocks join: only first label per INCBIN | killed (10 fail) |
| M4 | undersize branch disabled | killed (1 fail) |
| M5 | connection direction validation disabled | **SURVIVED 33/33** → ⚠️ below |
| M6 | parseMapHeaders: no `number = 0` on MapGroup label | killed (11 fail) |
| M7 | MACRO…ENDM skip disabled | killed (11 fail) |
| M8 | `$hex` parsed as decimal | killed (1 fail: border0 272) |
| M9 | group/number mismatch check disabled | killed (1 fail) |
| M10 | oversize decodes whole buffer | killed (2 fail) |

## ⚠️ Non-blocking

- ⚠️ Direction validation (map.ts:122-125) has no unit test (M5 survives). Not an explicit spec bullet; implementer flagged it. One-line unit test `connection up, …` → toThrow would close it.
- ⚠️ Join is attributes-driven only: a header or map_const with no `map_attributes` counterpart, or a duplicate name/const, is silently dropped/overwritten rather than refused. Corpus has 0 orphans/dups (verified), and the raw-count test (391×3) would catch a corpus drift, but "refuse on any join miss" is only enforced one direction.
- ⚠️ `parseNum` returns NaN / truncates silently on a non-numeric expression (e.g. `5 + 1` → 5). Corpus has none (verified), so no current impact.
- ⚠️ Corpus loadLayout test dedupes by blkPath (257 loads) rather than all maps, and doesn't assert the `400` in the defect message. Per-map run (mine) gives identical result: 2 defects, 389 writable maps.

---

# Re-review 1 — fix commit `72ac531` (vs `5e47614`)

Diff: map.ts +53/-4, map.test.ts +166. No other files. 47 tests in map.test.ts (was 33). `npm test` 78 files / 799 pass; typecheck exit 0. Subject porcelain empty; PokeMap tree = only the 2 untracked report files.

**Verdict: ❌ ISSUES (1)**. The `$hex` half of the strict-parseNum refusal (item 4) has no test.

| # | Requested | | Evidence |
|---|---|---|---|
| 1 | Real trailing-comment tests (map_attributes flags + map fishGroup) | ✅ | New tests assert exact `connectionFlags: "WEST"` and `fishGroup: "FISHGROUP_OCEAN"` with `; comment`. **M1 (stripComment → identity) now killed: 29 fail** (the stricter parseNum also kills it via `"4 ;  1"`). |
| 2 | Direction-validation unit test | ✅ | `connection up, …` → toThrow(/up/). **M5 killed (1 fail).** |
| 3 | Bidirectional join refusal + dup refusal + tests | ✅ | `assertNoDuplicates` on mapConsts.constName, headers.name, attributes.name; orphan map_const / orphan header throw with names. Mutants: D1 dup-const, D2 dup-header, D3 dup-attr, O1 orphan-const, O2 orphan-header → **each killed by its own test (1 fail each)**. Existing header-miss / const-miss / mismatch tests reworked (empty maps.asm / empty map_constants.asm / Placeholder map) so they still reach their intended branch; checked by reading. The D2 test is sound: without the dup check it throws on Placeholder's header miss, whose message lacks "FooTown", so it fails. |
| 4 | parseNum refuses non-clean hex/decimal (no NaN/truncation) + test | ⚠️→❌ | Code is correct: `/^\$[0-9A-Fa-f]+$/` or `/^-?\d+$/`, otherwise throws naming the text. Tests: `$05`, `$2c`, `18`, `-18`, `0`, trimmed whitespace, refuses `"5 + 1"`, `"4 ;  1"`, `""`. Lenient-decimal mutant P1 killed (3 fail). **Lenient-hex mutant P2 (`t.startsWith("$")` → `parseInt(hex)`) SURVIVES 47/47.** No test gives a malformed hex like `"$0g"` or `"$05 + 1"` (parseInt → 0 / 5). Fix: one assertion such as `expect(() => parseNum("$05 + 1")).toThrow(/\$05 \+ 1/)`. |
| 5 | Corpus defect message asserts 400 and 135 | ✅ | Loop over allDefects: `toMatch(/400/)` and `toMatch(/135/)`. |
| — | Corpus still loads under the stricter parseNum/join | ✅ | My independent script: attrs/hdr/consts/loader all 391, **record diffs 0** across all fields, 0 orphans, 2 per-map defects (unchanged). Corpus tests all ✓. `referenceProjects` is `[]`, so only the subject root runs. |

⚠️ Non-blocking: no explicit dup-check on attributes **constName** (two different names sharing one const). It is still refused indirectly: the second map's header position ≠ const number gives a mismatch throw, or its header is missing. Acceptable.
