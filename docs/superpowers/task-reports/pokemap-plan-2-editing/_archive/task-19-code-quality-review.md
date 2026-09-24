# Task 19 code-quality review — the I5 merge gate for Plan 2

**Verdict: WITH FIXES.** Critical 0 · Important 2 · Minor 4.
Range: `ead9a6c..fc0b7dc` (cumulative). Reviewed the actual file, not the reports. Every claim below was re-derived here.

---

## 0. What I independently verified (not taken from either report)

| Check | Method | Result |
|---|---|---|
| All 24 new cases run on all 6 roots, zero silent skips | `npx vitest run packages/core/test/write/corpus.test.ts --reporter=verbose` | ✅ 37/37, every root named under each of the 4 new blocks, no `↓` lines |
| Whole repo green | `npx vitest run` | ✅ 73 files / 673 tests, exit 0 |
| Corpus untouched after a full parallel run | `git status --porcelain` in all 6 roots | ✅ subject = the documented 6 modified + 1 untracked baseline (`NavelRock*`, `layouts.json`, `fieldmap.h`, `docs/human-tasks-notes.md`); 5 reference roots clean |
| `AzaleaTown` collision-free | repo-wide grep | ✅ zero hits outside the two task-report `.md` files |
| Exclusion set is a no-op on reference roots | probe over every root's `map_groups.json` | ✅ 0 of the 7 names present in any of the 5 reference trees — the comment's claim at `:96-100` holds exactly |
| Actual target per root | probe replicating the selection loop verbatim | game→**AzaleaTown**, 4 roots→**PetalburgCity**, pokefirered→**BattleColosseum_2P**; skips `excl=3 noMap=0 noLayout=0 noBin=0 warp=0` on subject, all-zero elsewhere |
| Clamp can't collide with the encoder mask | probe | `blockMetatileIdMask+1 == metatilesTotal == 1024` on all 6 roots, so `:398`'s `metatilesTotal` clamp is exactly the mask clamp — no latent `encodeBlocks` throw |
| `paintCells` preserves collision/elevation | `packages/core/src/edit/paint.ts:50-54` | ✅ only `metatileId` moves, so the sustained painted window can't disturb id-agnostic corpus pins |

Parallelism is real and heavy: the full run did 66.7s of test work in 14.1s wall. `vitest.config.ts` sets no pool options and `package.json` runs plain `vitest run`, so default cross-file parallelism is on. That matters for §2.

---

## 1. Strengths

- **The fix round genuinely out-worked its own review.** The reviewer flagged one name; the implementer's follow-up grep found 5 more real write-collisions in `packages/server/test/{paintRoutes,saveRoutes}.test.ts` and excluded all of them. That is the right instinct, correctly executed.
- **`EXCLUDED_TARGET_NAMES` (`corpus.test.ts:87-110`) is exactly the shape requested.** Named `Set`, hoisted above the `describe`, one bullet per name naming the colliding file. An 8th entry is obvious to add. It *cross-references* Task 18's fix (`writeCommands.test.ts` Route33→37/34→38, commit `5de00c0`) instead of restating its reasoning — correct call, no duplication to collapse.
- **`expect(afterBlocks).toHaveLength(blocks.length)` (`:422`) sits in the right place**, between the `parseBlocks` that produces the array and the `:427` loop that is bounded by its length. Not bolted on; it validates the bound before the bound is used, and its comment says precisely why (`:416-421`).
- **The stub-`Project` deviation is sound and the reasoning is in the code, not only in a report** (`:51-75`). Reusing the pre-existing `stubProject`/`stubTileset` helper rather than inventing a second "build a partial Project" convention is a real discipline win. I sanity-checked the spec review's §2 trace against `guards.ts` and `save.ts` and agree with its verdict.
- **Each `it.each` block is independently readable.** Every block re-derives `paths`, `names`, `profile` locally; the only shared state is module-level and pure (`roots`, `mapNamesOf`, `profileOf`, `projFor`, `EXCLUDED_TARGET_NAMES`). Nothing leans on a block above it. Debugging one block never requires reading another.
- **No production-readiness debt**: no debug output, no commented-out alternates, no `.only`/`.skip`, every import used, comment voice consistent with the file's existing Plan 1 prose.
- **Not sprawl.** 437 lines / 7 `it.each` + 1 `it`, roughly half of it comment. One responsibility throughout — corpus-scale byte-identity — and the funnel block belongs with it because it *is* the plan's Success Criteria #1 expressed as identity-after-restore. No split warranted.

---

## 2. Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

#### I1 — `corpus.test.ts:431-433`: the `finally` writes two files `commitSave` provably never touches, and that write surface races whole-corpus scanners the name-exclusion list cannot protect

```ts
} finally {
  writeFileSync(blockdataPath, beforeBlockdata);
  writeFileSync(borderPath,    beforeBorder);   // <- commitSave never wrote this
  writeFileSync(mapJsonPath,   beforeMapJson);  // <- nor this
```

The test itself asserts both files are untouched at `:428-429`, and the implementer's fix-round note §5 proves it structurally (`planBorderWrite` returns `null` on an exact match; `jsonEdits`/`insertOps`/`removeOps` are all empty so `applyJsonOps` returns the identical string). So these two writes have **zero upside and nonzero cost**: `writeFileSync` truncates-then-writes, and vitest's `forks` pool means another test *process* can read the file mid-write.

The exclusion list does not help here, because the colliding readers do not name a map — they walk everything:

| Reader | What it pins | Breaks on a torn read of |
|---|---|---|
| `packages/core/test/load/blocks.test.ts:97-107` | `bad === []`, every subject `border.bin` length vs `border_width*border_height` | **border.bin** |
| `packages/core/test/load/blocks.test.ts:109-133` | `blocks === 869988` over all 1,020 `map.bin` + 1,020 `border.bin` | **border.bin**, map.bin |
| `packages/core/test/load/blocks.test.ts:66-95` | `over` length `19`, from per-file byte lengths | map.bin |
| `packages/core/test/load/blocks.test.ts:37-64` | exact collision/elevation histograms over both files | both |
| `packages/core/test/write/binary.test.ts:82-96` | `trailingBlockLayouts === 19` over every subject layout | map.bin |
| `packages/core/test/load/maps.test.ts:96-108` | `failures === []`, `JSON.parse` of all 1,209 subject `map.json` | **map.json** |
| `packages/core/test/load/maps.test.ts:44-58` | parses **every pokefirered `map.json`** | **map.json** — and the probe confirms the funnel's pokefirered target is `BattleColosseum_2P`, whose `map.json` this `finally` rewrites |

That last row also shows the comment at `:96-100` is scoped narrower than the code: it certifies "no reference-root test reads or writes a reference-root **map.bin** by name" — true — but the `finally` also writes reference-root **map.json**, and `maps.test.ts:55-57` reads all of them.

**Fix (2 lines, matches the precedent this file's own comment cites).** `writeCommands.test.ts:134-136` restores *only* the one file it actually wrote. Either delete the two writes, or read-guard them so the normal path writes nothing while keeping the safety net:

```ts
if (!readFileSync(borderPath).equals(beforeBorder))        writeFileSync(borderPath, beforeBorder);
if (readFileSync(mapJsonPath, "utf8") !== beforeMapJson)   writeFileSync(mapJsonPath, beforeMapJson);
```

This removes two of the three write surfaces outright and eliminates the `map.json` exposure on all 6 roots.

#### I2 — `corpus.test.ts:87-106`: the exclusion comment implies a completeness it does not have

The comment reads as "a name outside this set is safe to paint." It is not: the residual `map.bin` restore at `:431` is unavoidable (`commitSave` genuinely writes it) and still races the five whole-corpus `map.bin`/`border.bin` scanners in I1's table. They survive today only by luck of construction — their pins are metatileId-agnostic and `paintCells` (`paint.ts:50-54`) preserves collision/elevation, and the painted window never changes a file's length. A torn read during the restore breaks all five.

The next maintainer adding an 8th name will grep by name, find nothing, and conclude they are safe. Add one sentence to the block naming the second, separate hazard class — "whole-corpus scanners (`blocks.test.ts`, `binary.test.ts`, `maps.test.ts`) read every file regardless of name; this list cannot cover them, which is the other reason the `finally` must write as little as possible."

Severity note for both: these fail **loudly red**, never silently green, and the same hazard predates Task 19 in three other test files. So the gate's *validity* is not in question — but the project has already treated this exact class as blocking twice (commit `5de00c0`, and this task's own fix round), and the fix is cheaper than the first flake.

### Minor (Nice to Have)

1. **`corpus.test.ts:434` asserts inside `finally`.** If the try body throws *and* the restore is imperfect, the `finally`'s `expect` replaces the original error and the real reason the merge gate failed is lost. Low probability, bad timing when it happens.
2. **`corpus.test.ts:385` reads `borderPath` with no `existsSync` guard**, while the selection loop at `:372` guards only `blockdataFilepath`. A layout with blockdata but no `border.bin` throws instead of being skipped. All 6 roots currently have both (verified). Inherited from the plan; the spec review already noted it.
3. **4 of the 7 exclusion entries are unreachable.** Probe: only `NewBarkTown`, `CherrygroveCity`, `VioletCity` are hit before `AzaleaTown` (`excl=3`); `GoldenrodCity`/`EcruteakCity`/`OlivineCity`/`BlackthornCity` are never reached. Harmless and arguably good insurance against `map_groups.json` reordering, but the comment doesn't distinguish load-bearing from defensive, so a future reader can't tell which entries a reordering would start to matter for.
4. **`stubProject.ts:20-29` has silent benign defaults, not `unused()` throwers**, for `layouts: []`, `layoutByName/layoutById: () => undefined`, `mapNames: () => []`. This is the actual "silent rot" vector the architecture question asks about: a future `guards.ts` check reading `proj.layouts` or calling `proj.layoutByName(...)` would quietly see empty/undefined **in the merge gate** rather than throwing loudly, unlike `splitFor`/`tileset`/`constants`. `projFor`'s doc comment (`:51-75`) carefully enumerates real-vs-permissive but never mentions this. One sentence there closes it. (Pre-existing helper; Task 19 is what makes the gate depend on it.)

---

## 3. Recommendations

1. Read-guard or delete `corpus.test.ts:432-433` (I1). Biggest risk reduction per line in the whole file.
2. Add the whole-corpus-scanner sentence to the `EXCLUDED_TARGET_NAMES` comment (I2).
3. While in `projFor`'s doc comment, add the `stubProject` silent-default warning (Minor 4).
4. Leave everything else. The stub-`Project` design, the `toHaveLength` placement, the exclusion-list shape, the file's size and structure, and the comment density are all right as they stand.
5. Worth recording against the **plan text**, not the code: the spec review's §2a finding that plan line 6061's stated safety property ("this cast starts failing type-checking") is false — `as Parameters<typeof planSave>[0]` is an unchecked assertion. I re-checked and agree. Same plan block's `{ paths, profile }` cast and `map: {} as EditSession["map"]` both throw at runtime against current `guards.ts`. If plan text is ever reused as a template, it will reproduce the bug.

---

## 4. Assessment

**Ready to merge?** **With fixes** — I1 and I2, together a 2-line code change plus one comment sentence, no logic change.

**Reasoning:**

As the final gatekeeper for Plan 0 §6, the substance is there. The gate operationalizes Success Criteria #1 on real data across all 6 engines, every assertion pins a concrete value rather than a shape, the anti-vacuity floors are real-measured with margin, the byte-identical restore is proven both in-process and on disk, and I confirmed myself via `--reporter=verbose` that all 24 new cases genuinely execute on every root with zero skips — Plan 0 §7's rule is satisfied. The full 673-test suite is green and the corpus is byte-clean afterward. The two deviations from plan text (stub `Project`, expanded exclusions) are both forced by reality, both minimal, and both documented at their site. The extra `toHaveLength` is a real strengthening, not padding. Nothing here is overcorrection.

What holds me at "with fixes" rather than "yes" is that the fix round solved the *instance* (NewBarkTown, plus five more it found on its own — good work) but not the *class*. Two of the three `finally` writes are pure liability against files `commitSave` provably never touches, and the readers that collide with them scan the whole corpus by iteration, not by name, so no exclusion list can ever cover them — including one concrete cross-root case the current comment's scope misses (`maps.test.ts:44-58` vs. the pokefirered target's `map.json`). This project has already paid for this exact hazard twice. The remedy is two read-guarded lines and matches the precedent the file's own comment already points at. Once those land, I'd sign off on merging Plan 2 on this gate without reservation.
