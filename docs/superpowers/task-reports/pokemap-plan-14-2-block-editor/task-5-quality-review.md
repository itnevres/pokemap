# Task 5 quality re-review (fix round 1, 37a1524), Plan 14.2

**Verdict: Approved.** There are 0 Critical and 0 Important findings, plus 4 Minor ones. One evidence gap needs a
re-recorded mutation log.

Scope: `git diff dc73228..37a1524` in `wt-t5` (`usage.ts`, `types.ts`, `usage.test.ts`), checked against amended
rulings R2a/R6a/R8a/R9a/R9b/R11. I did not run vitest. I ran a read-only tsx probe:
`scratchpad/t5q/probe2.ts` (synthetic stubs over the real projects) and `scratchpad/t5q/bench.ts`.

## Status of round-0 findings

| # | Round-0 finding | Status |
|---|---|---|
| 1 | GBC border taken from the representative only | **Resolved** (R2a). `usage.ts:173-188` sums `border` and `block0AsBorder` over every consuming map in the group. Probe: I gave VermilionPortPassage border `$77` in a stub, and `gbcBlockUsage(..., 0x77)` returned the OlivinePortPassage entry with `border: 1`. Before the fix it returned 0. |
| 2 | GBA shared blockdata kept only the first target | **Resolved** (R9a). `usage.ts:374-451` sums distinct targets for interior and distinct (border file, target) pairs for border. `sharedGrids` now lists maps of all layouts on the file. |
| 3 | primary==secondary branch | **Resolved** (R8a). The special branch is deleted (`usage.ts:288-292`). The stable sort keeps primary before secondary. |
| 4 | `files` echoed the raw path | **Resolved** (R6a). `usage.ts:137-156` uses `key`, and an unconsumed path returns the empty usage. |
| 5 | Unknown GBA symbol threw | **Resolved** (R9b). `usage.ts:363-365` returns the empty usage before any map read. |
| 6 | GBA per-call cost | Not in scope (no change was requested). Unchanged: warm `gTileset_General` takes 148 ms (138 ms before). The extra `proj.layouts.filter` costs about 10 ms. |
| 7 | Readability and dead code | **Resolved.** The GBC disk cache is keyed by `blkPath` (`usage.ts:117-120`), the palMap key is hoisted (`usage.ts:217`), and the types moved to `types.ts` (R11). |

### Synthetic probe of R8a + R9a (not reachable in the corpus)

- Setup: a stub `Project` adds `LAYOUT_ZZ_FAKE`, a clone of a `gTileset_General`-primary layout (PetalburgCity) with
  `secondaryTileset = gTileset_General`. It shares `data/layouts/PetalburgCity/map.bin` and its border bin, and is
  backed by a fake map `ZzFake`.
- `gbaConsumingLayouts` gives `["primary","secondary"]` for the fake layout.
- Local 468 (split 512): interior 66 and border 1. A hand count of cells equal to 468 or 980 in `map.bin` gives 66,
  and the same count over the border bin gives 1.
- Local 85: interior 1, which is the single cell 597 (the secondary target). The hand count is 1.
- `sharedGrids` is `["PetalburgCity","ZzFake"]`.
- The counts are correct, and the PetalburgCity layout and the fake layout both use target 85 but it is counted once.

## Evidence gap (fix before closing Task 5)

The only mutation logs on disk do not support the claim that every mutant was "KILLED by its target test".

- `scratchpad/mut_t5b.out` (10:47) and `mut_t5b-run1.out` (10:56) are byte-identical, so the second file is a copy,
  not a second run.
- Both start with `== baseline: exit 1 | Tests 2 failed | 14 passed (16)`. The failing tests are the GBA tests
  "gbaConsumingLayouts lists both roles ..." and "gbaBlockUsage translates a secondary tileset id ...".
- `usage.test.ts` and `mut_t5b.py` were last modified at 10:50:17, after that run. The recorded run therefore used an
  older test file.
- In that run, M5 ("GBA secondary ignores split") fails only those 2 tests, which were already red. M5's kill is
  unproven. The other mutants show extra failures beyond the baseline and are plausibly real.
- The conductor's "16/16" and "+ rerun" may well be correct, but no green-baseline log exists to show it.
- Action: rerun `mut_t5b.py` at 37a1524, save the output to a new file, and confirm the baseline line reads
  `Tests 16 passed (16)` before Task 5 closes.

## New findings in the fix diff

### Minor

1. **Dead field: `layouts` in the GBA `byFile` record** (`usage.ts:377`, 404, 413).
   - The field is written and never read. For a primary==secondary layout, it also stores the same layout twice.
   - Delete it.
2. **Stale comment** (`usage.ts:429`).
   - The comment says "use alphabetically first consuming map present in grids", but line 431 searches
     `allMapNames`, which includes non-consuming maps. Line 430 says that correctly, so the two comment lines
     contradict each other.
   - Delete line 429.
3. **`proj.layouts.filter(l => l.blockdataFilepath === file)` runs once per file on every call** (`usage.ts:390`).
   - That is O(files x layouts): about 1M comparisons for `gTileset_General`, roughly 10 ms on the subject.
   - The layout-by-blockdata-file relation is static. It belongs in `GbaRelations`, built next to `mapsByLayout`,
     in line with R4's "cache only static relations".
4. **R2a and R8a/R9a have no automated guard.**
   - Reverting R2a to representative-only, or R9a to first-target-only, would pass all 16 tests. No corpus has
     differing borders on a shared `.blk`, a shared GBA blockdata file, or primary==secondary.
   - That makes this a "wrong answer not caught automatically" case under the project's high-risk rule.
   - On the conductor's question ("say if you think either needs a synthetic test"): yes, both are worth one cheap
     stub test each.
   - `probe2.ts` shows the shape. Use `Object.create(realProject)` and override `maps` (GBC) or
     `layouts`/`mapNames`/`map` (GBA). Then compare against hand counts from the raw `.blk`/`map.bin` bytes. Each
     test is about 30 lines and needs no corpus edits.
   - Kill targets:
     - R2a: border only from `group[0]` must fail.
     - R9a: drop `existing.targets.add` must fail.
     - R8a: restore the primary==secondary `continue` must fail.

## Checked, no issue

- R9b uses `tilesetSymbols().includes` before `gbaRelations` and `gbaMapsByLayout`, so an unknown symbol triggers no
  map.json reads.
- A symbol that is known but used by no layout still returns its two `files` and empty `maps`, which matches R9.
- Interior over distinct targets cannot double-count, because a cell equals at most one target. Border pairs are
  deduplicated per border file.
- `consumingMapNames` is deduplicated by `sorted` when the same layout appears twice (R8a).
- GBC `block0AsBorder` uses the file's effective grid, which is staged-first per R3, so it is the same grid for every
  map of the file. It is summed per bordered map as R2a requires.
- Test additions: the `if (!fixture) return;` guards (`usage.test.ts:1140`, 1342) come after a failing
  `expect(...).toBeDefined()`, so they cannot pass silently. No `.skip`, and no import of `usage.ts` logic in the
  oracle helpers.
