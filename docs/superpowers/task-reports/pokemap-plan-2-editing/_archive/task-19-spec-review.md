# Task 19 spec review — the I5 merge gate for Plan 2

**Verdict: ❌ 1 issue found (+ 4 non-blocking observations).**
Range reviewed: `ead9a6c..6d6ccdd`. Everything in the report was independently re-verified; all numeric claims held.

---

## 1. Independent verification summary

| Claim | Method | Result |
|---|---|---|
| 4 new `it.each(roots)` blocks, all 6 roots | ran with `--reporter=verbose`, read each root name | ✅ 24 new cases, every root named |
| `corpus.test.ts` 37/37 | `npx vitest run packages/core/test/write/corpus.test.ts` | ✅ 37/37 |
| full core 325/325 / 38 files | `npx vitest run packages/core` | ✅ 325/325, 38 files |
| typecheck clean | `npm run typecheck` (both tsconfigs) | ✅ clean |
| Step 10, 6-root git-status before/after | captured `git status --porcelain` in all 6 roots, ran suite, re-captured, `diff` | ✅ byte-identical, twice (after corpus file, and again after full core suite) |
| Step 11, commit scope | `git show --stat 6d6ccdd` | ✅ exactly 1 file, `packages/core/test/write/corpus.test.ts`, 258+/3-, message verbatim from spec line 6088 |
| no production code touched | `git diff --stat ead9a6c..6d6ccdd` | ✅ no `src/` file in the diff |
| floor margins (report's table) | re-measured pokeclassic + pokefirered from raw `map.json` / `layouts.json`, independent of `parseMapGroups`/`parseLayouts` | ✅ exact match: pokeclassic 315 oe / 1370 bins; pokefirered 358 oe / 730 bins. Floors 100 / 500 hold |
| tests 1–3 match spec text | diffed against plan lines 5829-5963 | ✅ verbatim, comments included |

Baseline note: subject root is **6 modified + 1 untracked**, not "5 modified + 1 untracked" as the report's table text says (the report's own parenthetical lists all 7 paths correctly). Cosmetic.

---

## 2. The stub-`Project` deviation — my verdict: **ACCEPTABLE**, narrowly scoped, correctly reasoned

### 2a. The task's own literal cast really is broken (implementer's core claim: CONFIRMED)

Traced the call chain by hand, not from the report:

- `save.ts:136` `planSave` → `save.ts:122-127` `collectRefusals` → `guards.ts:44` `guardLayoutSave` → `guards.ts:14-20` `idOutOfRange`, which calls `proj.splitFor(layout)` (`guards.ts:15`), `proj.tileset(...)` (`:16`, `:17`) and `proj.constants.metatilesTotal` (`:18`) **unconditionally, per block**. With `{ paths, profile } as ...`, `proj.splitFor` is `undefined` → `TypeError` on the first block. The `blocks` array is never empty here (real map.bin), so the loop at `guards.ts:43` always reaches it.
- `collectRefusals` also calls `guardMapSave`, which does `for (const warp of prevMap.warpEvents)` at `guards.ts:86`. With `map: {} as EditSession["map"]`, that is `for (const x of undefined)` → throws.

Both deviations are forced, not stylistic.

**Additional finding the implementer missed:** the plan's own justification at plan line 6061 — *"If a future change makes `planSave`/`commitSave` read anything else off `Project`, this cast starts failing type-checking (not silently passing with `undefined`), which is the correct failure mode"* — is **false**. `expr as Parameters<typeof planSave>[0]` is an unchecked type assertion, and TS permits it because `Project` is assignable to `{ paths, profile }`; it would compile silently and fail only at runtime. The plan's stated safety property never existed. Worth recording against the plan text.

### 2b. `stubProject` is genuinely pre-existing (CONFIRMED)

`packages/core/test/helpers/stubProject.ts` was created in `80fb249` ("refactor(core): address code-quality review on guards.ts/guards.test.ts"), verified an ancestor of the review base `ead9a6c`. Already imported by `guards.test.ts:7` and `save.test.ts`. Not invented for this task. Its `unused()` pattern (`stubProject.ts:15`) makes an un-overridden field throw loudly rather than pass as `undefined` — the right shape for this use.

### 2c. The permissive `tileset()` IS strictly weaker — but it is **not load-bearing**, and I verified that empirically

`corpus.test.ts:83` returns `metatileCount = profile.blockMetatileIdMask + 1 = 1024` for both tilesets. Against `idOutOfRange` (`guards.ts:19`) that makes the primary-branch bound `1024` and the ceiling `min(split.metatiles + 1024, metatilesTotal)` → saturates to `metatilesTotal`. Real counts are much tighter. So yes: **strictly more permissive, never stricter.**

I did not take the report's word that this is safe. I wrote a throwaway probe (created, run, deleted — `git status` in all 6 roots unchanged afterward) that replicates the funnel test's target selection exactly and, for every root where `openProject` works, computes what the **real** `idOutOfRange` verdict would be on the exact `paintedId` the test uses:

| root | target map / layout | split.metatiles | orig id → painted id | real primary / secondary | real ceiling | **refused by real project?** |
|---|---|---|---|---|---|---|
| game | NewBarkTown / NewBarkTown_Layout | 640 | 20 → 21 | 640 / 144 | 784 | **no** |
| pokeemerald | PetalburgCity | 512 | 468 → 469 | 512 / 144 | 656 | **no** |
| pokefirered | BattleColosseum_2P | 640 | 744 → 745 | 640 / 256 | 896 | **no** |
| pokeemerald-expansion | PetalburgCity | 512 | 468 → 469 | 512 / 144 | 656 | **no** |
| modern-emerald | PetalburgCity | 512 | 468 → 469 | 512 / 144 | 656 | **no** |
| pokeclassic | PetalburgCity | 640 | 468 → 469 | *(openProject ENOENT — the structural gap)* | — | unverifiable by construction |

So the stub's generosity **changes no outcome on 5 of 6 roots**, and the 6th is precisely the root whose missing `src/data/tilesets/headers.h` is the documented reason this whole file avoids `openProject` (`corpus.test.ts:20-32`, a Plan 1 comment that predates this task).

Two further reasons the weakening cannot produce a false green **in this gate**:
- The funnel test only ever asserts `refusals === []` (`corpus.test.ts:382`). It never poses a "this id *should* be refused" case, so an artificially generous ceiling cannot let a should-refuse case pass — there is no such case to let through.
- The three guard paths this funnel *can* reach are all driven by **fully real data**: `missing-layout-version` (real `profile.supportsLayoutVersion` + real `layout.layoutVersion`), `border-size-mismatch` (real `border.bin` parsed off disk vs real `borderWidth × borderHeight`), `warp-tile-moved` (real `warpEvents` via `parseMap`, real prev/next block arrays).

The `metatile-out-of-range` sub-check the stub relaxes does have dedicated coverage: `guards.test.ts:60-87` is the split-differentiating "whole thesis" test (id 600 refused on a 512-primary layout, allowed on a 640-primary one — the same id, opposite verdicts, purely from the split), plus `guards.test.ts:89-103` for the message/fix text. The report calls that **hand-derived-fixture** coverage, which is accurate — those are hand-picked counts (640/80, 512/100), not corpus data. It did not overclaim "real fixtures."

**Verdict:** this is a legitimate, narrowly-scoped fix for a genuine plan/reality mismatch, documented in-code at `corpus.test.ts:59-75`, and it does not weaken what Plan 0 §6 actually requires of an I5 gate. The one residual gap — that the funnel does not prove a real `openProject`-built `Project` would also produce zero refusals — I closed myself for 5/6 roots via the probe above; on pokeclassic it is structurally unclosable.

### 2d. Skip / clamp branches: not vacuity, and empirically never taken

Probe output, all 6 roots: `scanned: 1, skippedNoLayout: 0, skippedNoBin: 0, skippedWarp: 0, clampFired: false`. Every root's target is literally the **first** map in `map_groups.json`; neither the warp-at-(0,0) skip (`corpus.test.ts:348`) nor the ceiling clamp (`:372`) has ever fired. The implementer's "no fallback exercised" claim is confirmed.

Neither branch can silently empty the test either: `expect(target).toBeDefined()` (`:352`) fails if the loop skips everything, and `expect(afterBlockdata).not.toEqual(beforeBlockdata)` (`:391`) plus `expect(plan.changes).toHaveLength(1)` (`:383`) prove a real write happened. The clamp is also the exact remedy plan Step 7 (line 6068) explicitly sanctions.

### 2e. The "every OTHER block unchanged" assertion is genuinely discriminating

`corpus.test.ts:394`: `for (let i = 1; i < afterBlocks.length; i++) expect(afterBlocks[i]).toEqual(blocks[i])`. `blocks` is `parseBlocks(beforeBlockdata, …)` and `paintCells` never mutates its input (`paint.ts:40` copies every block, documented at `paint.ts:31-34`), so `blocks` is a pristine pre-paint snapshot held independently of `paintedBlocks`. A `commitSave`/`encodeBlocks` that corrupted the whole buffer would therefore fail at the first corrupted index. Not vacuous. Same for `originalBlocks: blocks` in the session (`:379`) — no aliasing hazard of the kind `save.ts:50-58` warns about, and `map`/`originalMap` are two separate `parseMap()` calls, also unaliased.

---

## 3. ❌ Issue: the funnel test reintroduces a cross-test-file reader/writer race the project already fixed twice

**`packages/core/test/write/corpus.test.ts:320-403`** (specifically the target selection at `:339-351` and the `commitSave` at `:385`).

This commit makes `corpus.test.ts` the **first test in that file to write to real corpus files** — before it, the file's `node:fs` import was `readFileSync, existsSync` only; `writeFileSync` is added by this diff. The funnel test picks the *first resolvable* map, which for `SUBJECT_ROOT` is deterministically **NewBarkTown** (probe: `scanned: 1`), flips `NewBarkTown/map.bin` block 0 from metatileId **20 → 21** on real disk, runs ~1169 `toEqual` assertions, then restores in `finally`.

Meanwhile, in a **different test file**:

- `packages/core/test/load/blocks.test.ts:19-35` reads `${SUBJECT_ROOT}/data/layouts/NewBarkTown/map.bin` and asserts exact pinned values: `expect(blocks.slice(0, 6)).toEqual([{ metatileId: 20, collision: 1, elevation: 0 }, …])` — **the exact block the funnel test temporarily changes.**

`vitest.config.ts` sets no pool options and `package.json:9` is plain `vitest run`, so vitest 2.x file parallelism is on. Two files, concurrent, one writing and one asserting pinned values on the same bytes → a real flake, not a theoretical one. Window is the ~1169 `toEqual` calls plus 3 `readFileSync`s between `commitSave` and the `finally` restore.

This is *exactly* the hazard the project has already diagnosed and fixed twice, with the reasoning written into the code:
- `packages/cli/test/writeCommands.test.ts:113-131` (Route33 → Route37) — *"Under vitest's default parallel-file execution that's a real reader/writer race against the same file from two independent test files"*
- `packages/cli/test/writeCommands.test.ts:178-190` (Route34 → Route38)
- commit `5de00c0` — *"use map names in writeCommands.test.ts that don't race real test-file writes elsewhere"*

The new gate not only reintroduces the pattern, it lands on the single most heavily-pinned fixture map in the suite. The plan's Step 6 text says "first map whose layout and blockdata resolve" and never considered the race; the established in-repo discipline should have overridden it.

Reference roots are safe — I checked every test file importing `availableReferenceRoots`/`referenceRoot`/`REFERENCE_ROOTS` (`engine.test.ts`, `layouts.test.ts`, `maps.test.ts`, `tilesetData.test.ts`); none reads reference-root `map.bin`. Only the subject root collides.

**Fix:** same remedy as the two precedents — pick a target no other test file reads. Cheapest version that keeps the spec's "first resolvable" shape: add the map names other tests pin to the existing skip predicate at `corpus.test.ts:348`, or walk the name list from the end. Either is a one-line change inside the existing loop.

---

## 4. Non-blocking observations

1. **`corpus.test.ts:394` has no length assertion.** The loop is bounded by `afterBlocks.length`, so a `commitSave` that *truncated* the file would pass the funnel test (`afterBlockdata !== beforeBlockdata` also passes on truncation). Inherited verbatim from the plan (line 6049), and covered elsewhere — new test 3 round-trips all 500+ bins per root, and `binary.test.ts:82-92` scans all 1,020 subject layouts. Adding `expect(afterBlocks).toHaveLength(blocks.length)` would close it for one line.
2. **`corpus.test.ts:399-400` rewrites `borderPath` and `mapJsonPath` unconditionally** in `finally`, even though `commitSave` never touched either (asserted at `:395-396`). Content-identical, so no `git status` effect — but `writeFileSync` is not atomic on Windows, giving a torn-read window against `packages/core/test/load/maps.test.ts:25,66,92`, which read NewBarkTown's `map.json`. Same root cause as issue 3; disappears with the same fix. Inherited from the plan's literal code.
3. **`borderPath` is read (`:358`) without an `existsSync` guard**, while the selection loop guards only `blockdataFilepath` (`:346`). A layout with blockdata but no `border.bin` would throw instead of being skipped. All 6 roots currently have both. Inherited from the plan.
4. **Dead defensive branches**: the warp-at-(0,0) skip and the paintedId clamp are never taken on any configured root (§2d). Harmless and justified, but they are not currently exercised by anything, so their own correctness is unverified.

---

## 5. Spec-compliance checklist

| Spec item | Status |
|---|---|
| Step 1 reuse `roots`/`mapNamesOf` | ✅ reused, not rebuilt |
| Step 2 array-splice append round-trip, floors `checked > 100` / `neverDiffered` / `notRestored` | ✅ verbatim (`:212-243`) |
| Step 3 no `jsonEdit.ts` change | ✅ no `src/` in diff |
| Step 4 index-0 prepend, same floors | ✅ verbatim (`:252-277`) |
| Step 4 binary round-trip, `checked > 500`, both `map.bin` and `border.bin` | ✅ verbatim (`:287-313`) |
| Step 5 no `blocks.ts` change | ✅ |
| Step 6 full funnel: `refusals === []`, `changes.length === 1`, `kind === "binary"`, `commitSave`, painted id exact, every other block equal, map.json + border.bin untouched, 3-file `finally` restore + verify | ✅ all present (`:382-401`); `Project` construction deviates, justified in §2 |
| Step 7 clamp rather than loosen on refusal | ✅ clamp used, assertion not loosened |
| Steps 8–9 full file + full core suite | ✅ re-run: 37/37, 325/325 |
| Step 10 6-root before/after proof | ✅ independently reproduced twice |
| Step 11 commit only the one test file | ✅ |
| Test-construction discipline (vitest parallel-file reader/writer races) | ❌ — see §3 |
