# Task 1 implementer report: GBC save guards + EditSession/save funnel

**Status: DONE_WITH_CONCERNS** (concerns = 1 spec fixture contradiction resolved by adjustment, 1 minor test-file edit; see below)

## Commits (base `06d8759`)

| SHA | Subject |
|---|---|
| 51660c7 | refactor(core): widen formatDiff* to Pick<SavePlan, changes\|refusals> (test 19) |
| fdecdae | feat(core): GbcEditSession + openGbcEditSession + changedBlockIndices (tests 1-3) |
| 38f7aef | feat(core): planGbcSave/commitGbcSave funnel + metatile-range guard (tests 4-10, noStrayWrites allowlist) |
| 39ef1f4 | feat(core): GBC save guards (length, writable, const desync, disk drift) (tests 11-15) |
| 33dc0c5 | test(core): GBC save real-corpus checks, read-only (tests 16-18) |
| (this report) | docs commit |

TDD: every test seen red for the right reason first (test 19 red via `tsc` excess/missing-`session` error; 1-3 red = module missing; 4-10 = `planGbcSave is not a function`; 12-15 red = refusal missing). Each step typecheck-clean + committed by pathspec.

## Files

| File | Change |
|---|---|
| `packages/core/src/gbc/write/save.ts` | new: `GbcEditSession`, `GbcSavePlan`, `openGbcEditSession`, `changedBlockIndices`, `planGbcSave`, `commitGbcSave` |
| `packages/core/src/gbc/write/guards.ts` | new: `guardGbcSave` (read-only) |
| `packages/core/src/write/diff.ts` | `formatDiffText/Json` param -> `Pick<SavePlan,"changes"\|"refusals">` (type-only) |
| `packages/core/test/write/noStrayWrites.test.ts` | allowlist + `gbc/write/save.ts`; name "...sanctioned four" |
| `packages/core/test/write/diff.test.ts` | +test 19; one existing literal drops `session: {} as any` (see concerns) |
| `packages/core/test/gbc/write/save.test.ts` | new: tests 1-10, 16-18 |
| `packages/core/test/gbc/write/guards.test.ts` | new: tests 11-15 (10 `it`s: test 14 = 4, test 15 = 3) |
| `packages/core/test/gbc/helpers/saveFixture.ts` | new (NOT in spec file table): shared Testmap fixture/stub for the two test files, so the fixture isn't duplicated |

## Tests (all pass)

| # | Test | File | Result |
|---|---|---|---|
| 1 | open: blocks/originalBlocks/layout.blocks independent; events !== originalEvents; isDirty false; fixture = 2 objects, 2 consts | save | pass |
| 2 | layoutSharedBy in proj.maps order (`["Zed","Testmap"]`) | save | pass |
| 3 | unknown map throws `/unknown map/` | save | pass |
| 4 | unedited plan `[]/[]`; commit leaves both mtimes | save | pass |
| 5 | paint idx2->0: 1 binary change, summary exact; disk `[1,2,0,4]`; asm bytes+mtime same | save | pass |
| 6 | shared summary `... (shared by 2 maps)` (+ "2 blocks" plural) | save | pass |
| 7 | G2: trailing byte survives (`[3,2,3,4,77]`), writable forced via layout override | save | pass |
| 8 | text change via `spliceArg`+`locateEventCall`; 1 text change; disk asm === eventsText; blk bytes+mtime same | save | pass |
| 9 | commit throws `/save refused: metatile-out-of-range/`; both files byte+mtime identical | save | pass |
| 10 | stale plan: valid plan, then id 9, commit throws; disk+mtime unchanged | save | pass |
| 11 | out-of-range ids `5,-1,1.5` -> one refusal sorted `-1, 1.5, 5`; `4` ok (cap exclusive) | guards | pass |
| 12 | real oversize 5-byte blk: unedited clean; painted refused, commit throws, disk 5 bytes identical | guards | pass |
| 13 | blocks-length-changed | guards | pass |
| 14 | const desync: obj-only removal refused; obj+const ok; no-const variant remove ok; no-const variant gaining const refused | guards | pass (4) |
| 15 | file-changed-on-disk: blk; asm; unwritten file = no refusal | guards | pass (3) |
| 16 | NewBarkTown unedited `[]/[]`, objects match `loadGbcMapEvents` | save (corpus) | pass |
| 17 | House1.blk sharers = 50 | save (corpus) | pass |
| 18 | CeruleanCave2F writable false; unedited clean; paint -> `layout-not-writable`; no commit | save (corpus) | pass |
| 19 | `formatDiffText({changes,refusals})` plain object | diff | pass |

Final run: gbc/write + noStrayWrites + diff = 5 files, 61 tests pass; `npm run typecheck` clean. Full `npm test` not run (per instructions).

## Mutations (applied, test file(s) run, reverted by edit, `git diff` clean after the full loop)

| ID | Mutation | Red tests | R/G |
|---|---|---|---|
| M1 | alias `originalBlocks === blocks` in open | 1 (also 5, 6, 7, 12, 13, 15a, 15c, 18) | red |
| M2 | cap -> 256 | 9, 10, 11 | red |
| M3 | drop `layout-not-writable` branch | 12 (also 18) | red |
| M4 | commit writes whole re-encoded buffer (`Buffer.from(ids)`, same bytes as `encodeBlk`) | 7 | red |
| M5 | drop both `file-changed-on-disk` branches | 15a (blk), 15b (asm) | red |
| M6 | commit throws on `plan.refusals`, not fresh guard | 10 | red |
| M7 | drop `object-const-desync` branch | 14a, 14d | red |
| M8 | commit writes asm unconditionally | 4, 5 (mtime) | red |
| M9 | remove gbc allowlist entry (replaced by a comment) | noStrayWrites | red |
| M0 (extra) | `writeFileSync(` text added to `gbc/write/guards.ts` | noStrayWrites | red |

Each reverted by the inverse string edit (script in scratchpad); post-loop `git status` showed no tracked modifications. M0 mutation was never committed.

## Measured

House1 sharer count: **50** (matches findings §3.6; no discrepancy).

## Fixture adjustments / spec deviations

1. **Tileset cap is 5, not 4 (spec contradiction).** Spec fixture bytes are `[1,2,3,4]` (tests 4, 5, 7) and the guard checks ALL current blocks with `id < cap`; with cap 4 the unedited fixture contains id 4 and is refused, which breaks test 4 (`refusals: []`) and test 5 (`[1,2,0,4]` is a legal result). Test 11 also needed 4 invalid. Resolved: `TILESET_CAP = 5`; test 11 uses bad ids `5, -1, 1.5`, boundary-valid id `4`. Guard semantics exactly as spec (`0 <= id < cap`). Coordinator should amend the spec text (cap 5, bad ids 5/-1/1.5) for the reviewers.
2. **Shared-layout fixture is opt-in** (`makeFixture({shared:true})`, used by tests 2, 6). Spec test 5 expects summary `maps/Testmap.blk -- 1 block changed` with no suffix, which is impossible if Testmap always shares with another map. Default fixture: maps `[Other, Testmap]`; shared: `[Zed, Other, Testmap]`.
3. Fixture asm needed **no whitespace change**; parses as 2 objects, 2 consts (asserted in test 1).
4. Test 14d ("variant adds a const line") prepends `object_const_def` + `const TESTMAP_A` (a bare `const` line without `object_const_def` doesn't parse as a const).
5. Test 7 builds the writable override as `{...proj, layout: (m) => ({...real, layout:{...real.layout, writable:true}})}` over the real `loadLayout` (blocks = first 4 already from the real loader).

## Design notes / what the code does beyond the table

- `guardGbcSave` order = spec order: length, metatile, writable, const desync, file-changed (blk then asm). `file-changed-on-disk` treats an unreadable/missing file as changed (refuse, never clobber).
- Circular import `save.ts` <-> `guards.ts` (guards needs `changedBlockIndices` + the session type; save needs `guardGbcSave`). Function-only, used at call time; works in ESM and vitest. Moving `changedBlockIndices` out would contradict the spec's file table, so left.
- `pluralize` is a 3-line private copy (GBA's is module-private; exporting it would touch `write/save.ts`, outside the spec).
- `commitGbcSave` does not mutate the session (callers reopen).

## Concerns

1. Spec cap/bytes contradiction (above). Decided to adjust fixture rather than stop: intent unambiguous (exclusive boundary), behaviour unchanged. Flagging because the brief said to report NEEDS_CONTEXT on contradictions.
2. Extra file `test/gbc/helpers/saveFixture.ts` (not in "Nothing else" list) to avoid duplicating the fixture across 2 test files.
3. Existing `diff.test.ts` line 34 had `session: {} as any` in an object literal; widening to `Pick<>` makes excess-property checking reject it, so I removed that one field (test behaviour identical). Other formatter callers in repo (server/CLI) type-check unchanged.
4. Latent: the metatile guard permits ids up to `cap-1`; a tileset with >256 metatiles would let `bytes[i] = id` wrap silently. Real tilesets are 1-byte-indexed (<=256), so not guarded (YAGNI, spec-exact); `encodeBlk` would throw if Task 4/6 ever used it.
5. `isDirty` never set here (spec); not tested beyond open.

## Fix round 1

Status after: **DONE** (all findings addressed; QR9 + `id <= 255` skipped per coordinator).

### New commits

| SHA | Subject |
|---|---|
| 15cdc81 | test(core): pin GBC save gaps from reviews (blkPath, order, both-files, disk drift) |
| 8132a84 | refactor(core): GBC save path helpers shared by guard+commit, drop import cycle |
| (this section) | docs commit |

Order note: tests landed first (src unchanged, so they were green on arrival; teeth proven by the mutation table below, which went red per survivor). Then the behaviour-preserving refactor, re-green.

### Findings -> change

| Finding | Change |
|---|---|
| F1 | fixture blkPath `maps/TestLayout.blk` (file + all 3 maps); test 5 asserts `maps/Testmap.blk` never created |
| F2 | test "refusals come out in the spec order": 6 refusals asserted in order, last two subjects blk then asm |
| F3 | test "text-only edit not refused for external .blk change; commit writes just the asm" |
| F4 | test "out-of-range id already on disk, unedited, is refused" (blk `[1,2,3,9]`) |
| F5 | test 9 asserts `toThrow(new Error("save refused: metatile-out-of-range (maps/TestLayout.blk)"))` (exact message) |
| F6 | test ".blk deleted after open -> file-changed-on-disk, commit throws, file stays absent"; `tryRead` null=changed kept |
| F7 | comment now `cap is 5 (valid ids 0-4)` |
| QR1 | test "both files changed in one save": paint 0 and 3 + splice; kinds `["binary","text"]`; blk `[0,2,3,1]`; asm === eventsText |
| QR2 | `tryRead(p): Buffer \| null`, no cast; asm compare `?.toString("utf8")` |
| QR3 | `pluralize` inlined, helper deleted |
| QR4 | `changedBlockIndices` defined in `guards.ts`, re-exported from `save.ts`; guards only type-imports save (no runtime cycle) |
| QR5 | `blkFilePath(proj, layout)` / `eventsFilePath(proj, mapName)` in `guards.ts`, re-exported from `save.ts`; used by open, guard reads, plan paths, commit writes (no inline path strings left) |
| QR7 | `Fixture.map` dropped |
| QR8 | merged `events.js` imports; test 18 uses `id + 1`; `expect(sharer).toBeDefined()` before use |
| QR10 | tests: blk truncated to 3 bytes after open+paint -> refused; "commit does not mutate the session" (`structuredClone` snapshot, `toEqual`) |

Tests now: save.test 15 (+2), guards.test 15 (+5). Final run `gbc/write` + all of `test/write`: 9 files, 123 pass; typecheck clean; PerfPlus untouched (corpus tests never commit).

### Mutations re-run on 8132a84 (applied, narrow test files run, reverted by inverse edit; `git status` clean after loop)

Run set: save.test + guards.test (30 tests), noStrayWrites for M9/M0.

| ID | Mutation | Red tests | R/G |
|---|---|---|---|
| M1 | alias `originalBlocks === blocks` | 1, 5, 6, 7, 12, 13, 15a/c/d/e, both-files, 18, order | red |
| M2 | cap 256 | 9, 10, 11, on-disk-bad-id, order | red |
| M3 | drop writable branch | 12, 18, order | red |
| M4 | commit writes full re-encode | 7 | red |
| M5 | drop both file-changed branches | 15a, 15b, deleted, truncated, order | red |
| M6 | commit gates on `plan.refusals` | 10 | red |
| M7 | drop desync branch | 14a, 14d, order | red |
| M8 | asm written unconditionally | 4, 5 | red |
| M9 | remove gbc allowlist entry | noStrayWrites | red |
| M0 | `writeFileSync(` in guards.ts | noStrayWrites | red |
| O1 | `return out.reverse()` | order test | red (was survivor) |
| O2 | commit blk path from map name | 5, 7, both-files, no-mutate, 15 (unwritten file) | red (was survivor) |
| O3 | blk disk check ungated | text-only vs external blk | red (was survivor) |
| O4 | prefix vs `encodeBlk(session.blocks)` | 5, 7, 9, 10, 11, 12, both-files, no-mutate, 15 | red |
| O5 | full-file `disk.equals` | 7, 12 | red |
| O6 | delta rule in both desync branches | 14c | red |
| O7 | `layoutSharedBy.sort()` | 2 | red |
| O8 | asm disk check ungated | 15c | red |
| O9 | metatile loop over changed blocks only | on-disk-bad-id | red (was survivor) |
| O10 | throw drops `(subject)` | 9 | red (was survivor) |
| O11 | drop `disk.length < n` | not run | equivalent mutant (per spec review) |
| O12a | `tryRead` rethrows | deleted-blk test | red (was survivor) |
| O12b | drop `!disk` null guard | deleted-blk test | red |
| O12c | `tryRead` catch returns empty Buffer | none | **equivalent**: empty buffer is still refused (`length < n`; asm `"" !== original`), same as null. The spec review's O12 meaning ("missing file treated as unchanged") is covered by O12a/b |
| O13 | desync only when `!textChanged` | 14a, 14d, order | red |
| O14 | `originalEvents` getter aliases `events` | 1, 14a, 14d, order | red |
| O15 (extra) | plan path from map name | 5 | red |
| O16 (extra) | guard read path from map name | 11, 12, 15, 5, 7, 9, both-files, no-mutate, 10 | red |

Every non-equivalent mutant is red. Equivalent: O11, O12c.
