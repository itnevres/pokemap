# Task 18 code-quality re-review: dry-run refusal fix (commit `ead9a6c`)

Targeted re-review of the one Important issue (I1 in the prior review) from
`task-18-code-quality-review.md`. Not a full re-audit of Task 18.

## Verified

1. **Fix logic, exact.** `packages/cli/src/writeCommands.ts:41-50`:
   ```
   const plan = planSave(proj, session);
   const diffText = formatDiffText(plan);
   if (!yes) return `${label}\n${diffText}\n(dry run -- not written; pass --yes to commit)`;
   if (plan.refusals.length > 0) { throw new Error(...); }
   commitSave(proj, plan);
   return `${label}\n${diffText}\ncommitted`;
   ```
   `diffText` is now computed unconditionally before any branch. Dry-run path (`!yes`) returns
   immediately with `diffText` (which already embeds any `REFUSED [code] subject: message -- fix`
   lines per `write/diff.ts:7`) and never throws. The refusal throw now lives solely in the `yes`
   branch, evaluated only after the dry-run return has already happened. Matches the prescribed fix
   exactly.

2. **`--yes` + refusal still blocks the write.** Traced: when `yes === true`, control falls past the
   dry-run `return` (line 44) to the refusal check (line 45-47), which throws before line 48's
   `commitSave(proj, plan)` is ever reached. No reordering bug — `commitSave` is textually and
   control-flow-wise unreachable once a refusal throw fires. Confirmed by the new test
   (`writeCommands.test.ts:167-172`): `runPaint(..., yes: true)` on the refusal input throws
   `/metatile-out-of-range/` and `readFileSync(binPath)` is byte-identical to `before`.

3. **New tests are real, not hollow — claim independently re-derived, not trusted:**
   - `layouts.json:6127-6138` (subject decomp): Route32's layout has `primary_tileset:
     gTileset_Johto_General`, `secondary_tileset: gTileset_Route32`, `layout_version: "hns"`.
   - Primary metatiles: `data/tilesets/primary/johto_general/metatiles.bin` = 10240 bytes / 16
     bytes-per-metatile (`TILES_PER_METATILE=8` × 2, `tilesetData.ts:28,34`) = **640**.
   - Secondary metatiles: `data/tilesets/secondary/route_32/metatiles.bin` = 5440 bytes / 16 =
     **340**. Both match the test's own comment exactly.
   - Split boundary: `layout_version: "hns"` ≠ `"emerald"` → `resolveSplit` (`load/layouts.ts:53-56`)
     uses `metatilesInPrimary`, sourced from `NUM_METATILES_IN_PRIMARY` in
     `include/fieldmap.h:34` = **640** (not the commented-out 512 on line 26).
   - `idOutOfRange` (`guards.ts:14-20`): `ceiling = min(640 + 340, metatilesTotal=1024) = 980`.
     `1000 ≥ 640` (not primary-range check) → tests `1000 ≥ 980` → **true**, so id `1000` trips
     `metatile-out-of-range`. Claim confirmed independently, not just trusted.
   - `1000 ≤ 1023` (`engine.ts:59`, `blockMetatileIdMask: 0x3ff`), so `encodeBlocks` does not throw
     first — the refusal genuinely comes from `guardLayoutSave`, not an unrelated mask overflow.
   - Test 1 (`writeCommands.test.ts:140-165`) asserts `out` contains `"REFUSED"` and
     `"metatile-out-of-range"`, matches `/dry.?run|not written|--yes/i`, and the blockdata file is
     byte-unchanged. Test 2 (166-172) asserts `--yes` throws that same code and the file is
     unchanged. Both are real assertions against real guard output, not stubs.
   - Route32 is also read in `packages/server/test/paintRoutes.test.ts:195` (a 400-validation test
     that calls `/paint/begin` + an invalid `/apply`, never `/paint/end`) — never commits, never
     touches disk, so no cross-file race with these two new read/no-write CLI tests.

4. **No regressions.**
   - `npx vitest run packages/cli/test/writeCommands.test.ts` → **12/12 pass** (10 pre-existing + 2
     new).
   - `npx vitest run packages/cli` → **42/42 pass, 6 files** (up from 40; +2 matches the two new
     tests — the task brief's "41/41" expectation undercounts by one, actual is 42, correctly).
   - `npx vitest run` (full monorepo) → **649/649 pass, 73 files** (up from 647, +2, no other file
     changed count).

5. **Commit scope clean.** `git show --stat ead9a6c` touches exactly
   `packages/cli/src/writeCommands.ts` (+4/-2 net, 2 lines each way) and
   `packages/cli/test/writeCommands.test.ts` (+36). The modified plan doc
   (`docs/superpowers/plans/2026-08-26-pokemap-plan-2-editing.md`) and the untracked
   `docs/superpowers/task-reports/` directory are confirmed absent from this commit (visible only
   as separate working-tree state in `git status`).

## Issues

### Critical / Important / Minor

None. The only candidate flagged for scrutiny — `diffText` now computed unconditionally, including
on the `--yes`+refusal path where it's discarded before the throw — is not a real issue:
`formatDiffText` (`write/diff.ts:4-9`) is pure in-memory string formatting over an already-computed
`plan.changes`/`plan.refusals`, no I/O, no meaningful cost. Behavior is unchanged on every other
path (committed-success and dry-run-no-refusal both computed `diffText` before this fix too, just
in a different relative order to the same-branch checks).

## Assessment

**Ready to merge?** Yes

**Reasoning:** Fix precisely matches the prescribed shape — unconditional `diffText`, dry-run
returns before any throw, refusal-throw only in the `yes` branch immediately before `commitSave`.
Traced the `--yes`+refusal path line-by-line: `commitSave` is unreachable past the throw, so a
refusal still can never reach a real write. Independently re-derived the two new tests' central
claim (Route32 split ceiling 980, id 1000 out of range but inside the encode mask) from the actual
subject decomp files rather than trusting the test's own comment or the implementer's report, and
it holds exactly. Full suite and targeted suites re-run clean with no regressions. Commit is scoped
to exactly the two intended files.
