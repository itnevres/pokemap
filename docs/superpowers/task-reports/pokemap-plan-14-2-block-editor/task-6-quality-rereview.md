Approved — 0 Critical, 0 Important, 3 Minor.

# Task 6 quality re-review, fix round 1 (Plan 14.2)

Reviewed `891361d` in the detached checkout `rv-t6`, fix-round diff `c4600c7..891361d -- packages/`. Static reading and git only. No vitest run.

## Review-1 findings

1. **All edit invalidates an earlier Local reuse: Closed.**
   `gbcOps.ts:157-158` splits the non-no-op changes into `all` and `local`, keeping entry order within each scope (`Map` insertion order, `:147-155`). `:176-179` applies every All rename to `paletteText` first. The Local loop at `:180-233` then re-parses `currentPalette` from the patched text (`:193`) before the reuse scan (`:195-203`). So a reuse candidate is judged by its post-All palette name.
   Hand trace of the reviewer's scenario (A GRAY, B RED, identical pixels; Local A→RED, All B→WATER):
   - The All loop renames B to WATER.
   - The Local reuse scan sees B as WATER and rejects it.
   - The free-slot path copies A to slot t and names t RED.
   - A's squares point at t, which is RED. This holds for either entry order.

   The new tests `expectLocalSurvivesAllRename("localFirst"/"allFirst")` (`gbcOps.test.ts`, the helper at about +290 and the tests at about +390) build exactly this scenario. B is a staged copy of the source in `free[1]`, already named `f.pal`; the All entry renames B to another name. Their expected values come from test-side helpers (`freeSlots`, `names`, `stagedCopy`) and are independent of `gbcOps.ts`.
   Mutation by reasoning, against the c4600c7 single-loop code: in `localFirst`, the Local entry would reuse B (identical pixels, `f.pal`, not reserved, not the source). The metatiles `after` would then hold B, not `slot`, and `expect(... metatiles ...).toEqual(expectedMeta)` would fail. So the `localFirst` case pins R5a. The `allFirst` case passed under the old code too and only guards against regression.

2. **Effective-file read failure escapes the refusal boundary: Closed.**
   `read` (`gbcOps.ts:100-113`) wraps `staged.get(key) ?? readFileSync(...)` and converts any failure into `BAD_VALUE` `<canonical path>: <native message>`. The result is subject-first, and the path is canonical (`key`). A failed read caches nothing in `before`, so a later call cannot return a partial result.
   The R1b wrapper (`:83-91`) also catches anything left over, including reads done through `gbcBlockUsage` and `proj.tileset`.
   Test: "a failed effective-file read refuses BAD_VALUE naming the file" unlinks the collision file in a temp copy and requires the message to start with `ts.collisionPath`. Mutation by reasoning: without the `read` try/catch, the R1b wrapper would produce `<map>: ENOENT...`, which fails the prefix check. So the test pins R1a specifically, not just "some BAD_VALUE".

## Focus checks

- **R1b wrapper (`:83-91`).** A `BlockEditRefusal` is re-thrown unchanged (`instanceof` check, `:87`), so codes such as `RESERVATIONS_UNREADABLE`, `NO_FREE_TILE` and `ALL_WITH_SAVE_AS_NEW` are never relabeled. The inner `parse` (`:114-119`) also re-throws refusals, so no message gets a second prefix. Everything else becomes `BAD_VALUE "<req.map>: <message>"`, as R1b requires. One side effect: a real programming error (a `TypeError` from a future bug) reaches the UI as a value refusal, with its stack and original type dropped. R1b requires this behavior; see Minor 1 for the cheap mitigation.
  Test: "an unknown map refuses BAD_VALUE naming the map (R1b)" fails without the wrapper, because `proj.map` throws a plain error.
- **R1a guarded `read`.** Correct, as described in finding 2.
- **All-before-Local ordering and refusal precedence.**
  - The All loop runs to completion before the first Local check, so every All `BAD_VALUE` (the `:177` guard or a patcher refusal) comes before any Local refusal (`BAD_VALUE`, `LOCAL_SHEET_MISMATCH`, `RESERVED_TILE`, `NO_FREE_TILE`), as R5a requires.
  - The R6 mode refusals (`:159-168`) still run before both loops.
  - Free-slot candidates still exclude draft tiles (`:218`), so an All tile in the draft can never be taken as a Local copy target.
  - `confirm` still uses the non-no-op `all` (`:249`).
- **R6a.** The `:160` message starts with `metaPath` and offers "use Local or OK". The test checks the substrings `Local` and `OK`; the old message contained neither, so the test fails without the fix.
- **Error subjects.** Every new message starts with its subject: the canonical path in `:108`, `req.map` in `:89`, `metaPath` in `:160`.
- **Fix-round tests as the oracle.** I checked each new expectation by hand. The two-Local test, the Local-during-Save-as-new test, the reserved-skip and draft-skip free-slot tests, the no-palette-entry test, the collision-record losslessness helper (`expectOnlyCollisionRecordChanged`), and the rewritten mixed-draft test all compute expected values with test-side helpers or patchers on independent inputs. None calls `planGbcBlockEdit` to build its oracle.
  - The mixed-draft test no longer compares whole palette text produced by `patchGbcPaletteMap`. It now compares the `names()` map plus the changed-line set, which removes its dependence on the patcher.
  - Mutation evidence (`mut_t6b.out`): M7, M8, M3 and M14 are killed by the new free-slot and untouched-tile tests.

## New findings

**Minor 1: `gbcOps.ts:89`. The R1b wrapper drops the original error's stack and type, and garbles non-Error throws.**
`(error as Error).message` is `undefined` for a thrown string or object, which gives the message `"<map>: undefined"`. For a real bug such as `TypeError: Cannot read properties of undefined`, the caller gets a `BAD_VALUE` with no stack, so it can only be debugged from the message text.
Scenario: a future regression throws a `TypeError` inside the Local loop. The UI shows "Map: Cannot read properties of undefined (reading 'tiles')" as a value refusal, and the stack is gone.
Fix: use `error instanceof Error ? error.message : String(error)`, and attach the original as `cause` (set `.cause` after construction, since `BlockEditRefusal` takes no options). This needs no change to the R1b contract. The same `as Error` pattern appears in `:108` and `:117`.

**Minor 2: `gbcOps.test.ts:743-760`. The new test "confirm true when another map reaches the block only through raw-zero border cells" does not test what its name says.**
Only `other`'s grid is staged (all zeros). Every other map, including any third map that draws `id` in its disk grid, uses its disk grid, so `confirm` can be true without the border clause.
Evidence: in `mut_t6b.out`, mutant M18 ("confirm ignores border", which replaces `other.border === req.blockId ||` with `false ||`) is killed only by the older test "confirm true when another map only uses it as its border". The new test is not in that kill list, so it passes with the border logic removed.
The border logic stays guarded by the older test, so nothing is unguarded today. But this test is a no-op oracle under its own name. Fix: stage zero grids for every map other than `map` (or pick a pair where no third map draws `id`), then re-run M18.

**Minor 3: `gbcOps.ts:177`. The All-loop palette-entry guard duplicates `patchGbcPaletteMap`'s range guard (`gbcPatch.ts:174-176`), and the tile-label formats differ.**
For the null-entry range (0x60-0x7F) and for ids of 0xE0 and above, the patcher already throws `BAD_VALUE "<palPath>: tile $60 has no palette-map entry"`. The `:177` guard throws almost the same message, but with the decimal `tile 96`. Removing `:177` changes only the number format, so no test can pin it.
Tile labels in planner messages are mixed: decimal in `:144`, `:152`, `:177`, `:181` and `:192`; `$XX` hex in `:189` and in the patcher. Scenario: one user action can produce "tile 96" from one path and "tile $60" from another, which is confusing.
Fix (optional): drop `:177`, or format through the same hex label. The Local-loop guard at `:181` is not redundant: without it, a Local entry on 0x60 would fail later, at `:192`, with a gfx-path subject.

Nits (not counted):
- The assertion `expect(expectedMeta[f.id * 16 + bSquare!]).toBe(b)` in `expectLocalSurvivesAllRename` checks the test's own oracle construction and cannot fail.
- `sharing` (`gbcOps.ts:182-183`) is loop-invariant but is recomputed for each Local entry. This predates the fix round.

No dead code was introduced, and no test was weakened. The mixed-draft rewrite is stricter than before.

## Not done

I ran no mutation myself (the brief rules out test commands). The R5a, R1a, R1b and R6a kills above come from reasoning against the c4600c7 code. The conductor's 20-mutant set (M1-M19 plus M2b) has no explicit mutants for those four rulings, so a conductor mutation run is advisable: revert the scope split, drop the `read` try/catch, drop the wrapper, and restore the old R6a message.
