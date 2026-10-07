# Task 1 spec-compliance review (Opus, adversarial)

Range `06d8759..79027f7`, packages only. HEAD `831cfee`: no package delta vs `79027f7`.

**verdict: COMPLIANT** (src behaviour matches spec + amendments exactly; 6 test-pinning gaps, none a src defect; 1 rated important because the write path is high-risk.)

## Verified (re-derived from spec, checked against code)

| Item | Result |
|---|---|
| Types `GbcEditSession`/`GbcSavePlan` | exact field set; doc comments carry GBA substance (deep-copy warning, plan.refusals display-only, G7, non-atomic) |
| open | `proj.map` throw propagates; fixed asm path `${root}/maps/${mapName}.asm`; 2 independent `.map(b=>({...b}))` copies (Block = `{metatileId}` only, so shallow spread = deep); 2 separate parses; `isDirty:false` |
| `layoutSharedBy` | `proj.maps.filter(blkPath===).map(name)`, proj.maps order, self included |
| `changedBlockIndices` | ascending, `i < min(len)`, metatileId diff |
| Refusal order | length, metatile, writable, const-desync, file-changed(blk, asm) = spec order |
| metatile | all current blocks; `!isInteger || <0 || >=cap`; one refusal; sorted unique; fix names `map.tileset` + count |
| writable | `!writable && changed.length>0` only |
| const-desync | orig consts>0 → `constDelta!==objectDelta`; else `events.objectConsts.length!==0`; message names both deltas; subject `maps/<map>.asm` |
| file-changed blk | gated on blocksChanged; `disk.length>=n && subarray(0,n).equals(encodeBlk(originalBlocks))` = spec prefix rule |
| file-changed asm | gated on textChanged; utf8 read `!== originalEventsText` |
| plan | guard snapshot; blk change first (path/kind/summary w/ GBA pluralise + ` (shared by k maps)` iff k>1), then text; nothing else |
| commit | fresh guard; error format = GBA `save refused: code (subject), ...` (`write/save.ts:223`); blk = read disk buffer, patch changed idx only, write back; asm written only if text changed; session not mutated |
| diff.ts | both params `Pick<SavePlan,"changes"\|"refusals">` via alias; type-only |
| noStrayWrites | exactly `join("src","gbc","write","save.ts")` added; name "...sanctioned four". Matches spec |
| Circular import save↔guards | function-only, call-time use. `npm run typecheck` clean; vitest loads it both entry orders (guards.test imports guards first, save.test imports save first): 4 files / 29 tests green |
| Corpus tests 16-18 | actually run (not skipped; corpus present); call plan only, never commit. PerfPlus `git status` clean, House1/CeruleanCave2F.blk mtimes Sep 22 |
| House1 = 50 | independently re-measured: 50 `_Blocks:` labels before `INCBIN "maps/House1.blk"` in `data/maps/blocks.asm` |
| "40 of 391 maps" no object_const_def (guards.ts comment) | confirmed: 391 `maps/*.asm`, 40 lack it |

## Findings

| # | Sev | Where | Evidence | Fix |
|---|---|---|---|---|
| 1 | important | `test/gbc/helpers/saveFixture.ts:72,83` (fixture `blkPath "maps/Testmap.blk"` == `maps/${mapName}.blk`) | O2 survived: commit writing `${root}/maps/${mapName}.blk` instead of `${root}/${layout.blkPath}` passes all 23 tests. Same blindness covers plan `path` and guard read path. Real corpus: 50 maps share House1.blk, so that bug would write a stray/wrong file on a sole-writer path | Give the fixture layout a blkPath ≠ map name (e.g. `maps/TestLayout.blk`), or in the shared fixture open+paint+commit `Zed` and assert `maps/Testmap.blk` patched and no `maps/Zed.blk` created |
| 2 | minor | `test/gbc/write/guards.test.ts` (no multi-refusal test) | O1 survived: `return out.reverse()` passes. Spec: "Refusals, in this order" unpinned | One test producing ≥2 refusals (e.g. push a block with id 9 → length + metatile; or out-of-range + const desync) asserting `codes()` order |
| 3 | minor | `guards.test.ts:125-133` (test 15c only covers the asm side) | O3 survived: removing `blocksChanged` gate on blk disk check passes. Spec "Only checked for a file that would be written" pinned only for asm | Mirror 15c: text-only edit + external `.blk` write → no refusal, commit writes asm |
| 4 | minor | `guards.test.ts:21-33` (test 11) | O9 survived: metatile check over changed blocks only passes. Spec note "runs over **all** current blocks" unpinned (every test-11 id is also a changed id) | Fixture with an out-of-range id already on disk (e.g. blk `[1,2,3,9]`), unedited → refusal |
| 5 | minor | `test/gbc/write/save.test.ts:139`, `guards.test.ts:48` | O10 survived: dropping ` (subject)` from the throw message passes; tests regex only `save refused: <code>`. Spec says GBA's format | Assert full message once, e.g. `toThrow("save refused: metatile-out-of-range (maps/Testmap.blk)")` |
| 6 | minor | `src/gbc/write/guards.ts:8-14,98,108` (`tryRead` → null = changed) | Extra behaviour vs spec (spec: `readFileSync`, which throws on a missing file; impl refuses instead). Defensible (refuse, never clobber) but untested: O12 (missing file treated as empty/unchanged-ish) survived | Accept as amendment + add 1 test: delete `.blk` after open+paint → `file-changed-on-disk`, nothing written |
| 7 | minor | `save.test.ts:138` | Stale comment `// cap is 4`; cap is 5 after amendment | Edit to `cap is 5` |

No src defects found. No extra src behaviour beyond #6. No missing spec behaviour.

## Mutation table (re-run by reviewer; each: read bytes → edit → narrowest file(s) → restore bytes → byte-compare + `git diff` empty, all confirmed)

Files: S=`src/gbc/write/save.ts`, G=`src/gbc/write/guards.ts`, N=`test/write/noStrayWrites.test.ts`. Run set: save.test + guards.test (23 tests) unless N.

| ID | File | Change | R/G | Red tests |
|---|---|---|---|---|
| M1 | S | `const __b=...; blocks:__b, originalBlocks:__b` | RED | 1,5,6,7,12,13,15a,15c,18 |
| M2 | G | `cap = 256` | RED | 9,10,11 |
| M3 | G | writable branch `if (false)` | RED | 12,18 |
| M4 | S | commit `writeFileSync(path, encodeBlk(session.blocks))` (+import) | RED | 7 |
| M5 | G | both file-changed branches `if (false)` | RED | 15a,15b |
| M6 | S | commit `refusals = plan.refusals` | RED | 10 |
| M7 | G | `if (desync)` → `if (false)` | RED | 14a,14d |
| M8 | S | asm write `if (true)` | RED | 4,5 |
| M9 | N | remove gbc allowlist entry | RED | noStrayWrites |
| M0 | G | add `import writeFileSync` + `export function __stray` writing | RED | noStrayWrites |
| O1 | G | `return out.reverse()` | **GREEN (survivor)** | — (F2) |
| O2 | S | commit path `${root}/maps/${mapName}.blk` | **GREEN (survivor)** | — (F1) |
| O3 | G | blk disk check `if (true)` (ungated) | **GREEN (survivor)** | — (F3) |
| O4 | G | prefix compared to `encodeBlk(session.blocks)` | RED | 5,7,10,11,12,15c |
| O5 | G | full-file `disk.equals(...)` instead of prefix | RED | 7,12 |
| O6 | G | desync = delta rule in both branches | RED | 14c |
| O7 | S | `layoutSharedBy` `.sort()` | RED | 2 |
| O8 | G | asm disk check ungated (`textChanged &&` dropped) | RED | 15c |
| O9 | G | metatile loop over changed blocks only | **GREEN (survivor)** | — (F4) |
| O10 | S | throw message drops `(subject)` | **GREEN (survivor)** | — (F5) |
| O11 | G | drop `disk.length < n \|\|` | GREEN — **equivalent mutant** (shorter buffer's `subarray(0,n)` can never `equals` an n-byte buffer) | — |
| O12 | G | `tryRead` catch returns `""`/empty Buffer | **GREEN (survivor)** | — (F6) |
| O13 | G | `if (desync && !textChanged)` | RED | 14a,14d |
| O14 | S | `originalEvents` getter aliasing `events` | RED | 1,14a,14d |

Survivors: O1, O2, O3, O9, O10, O12 (O11 equivalent). Spec M1-M9 all red, matching the implementer's table (M2 also reddens 10; M1/M3 extra reds as claimed).

## Spec facts found wrong

| # | Spec text | Reality |
|---|---|---|
| 1 | fixture tileset cap 4 / test 11 bad id 4 | contradicts fixture bytes `[1,2,3,4]`; already fixed by amendment (cap 5) — confirmed correct |
| 2 | test 5 no-suffix summary + test 2 always-shared fixture | incompatible; amendment (opt-in shared) confirmed correct |
| 3 | file-changed rule `disk.length >= n && ...` | `length >= n` clause is redundant given the prefix `equals` (O11 equivalent). Harmless |
| 4 | M2 "must go red tests 9, 11" | also reddens 10 (expected; not wrong, incomplete) |
| 5 | Implied by fixture: blkPath `maps/Testmap.blk` | coincides with `maps/<mapName>.blk`, making blkPath-vs-mapName confusion untestable (F1) — spec fixture should use a distinct layout name |

Other spec facts checked true: House1 sharers 50; 40/391 maps without `object_const_def`; CeruleanCave2F `.blk` 400 B vs `map_const 9, 15` → oversize → `writable:false`; fixture asm parses unmodified (2 objects, 2 consts).
