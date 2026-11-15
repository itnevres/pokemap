Approved -- Critical 0, Important 0, Minor 1 (new, non-blocking); prior findings: 6 Closed, 4 Deferred-acceptable

# Task 8 quality re-review, fix round 1 (plus a spec check of the new tests)

Scope: `git diff fde9ec5..1cc405b -- packages/` (one commit, `1cc405b`), read in the detached checkout `rv-t8`.
Two files changed: `packages/core/src/blockEdit/save.ts` (+9 -40) and `packages/core/test/blockEdit/save.test.ts` (+43 -3).
This was a static review. I ran no tests and no mutations, per the brief. The conductor's run (297 green, 23/23 mutants
killed) is taken as the empirical evidence. Below I check by hand that each new expectation is correct and that it kills
the mutant it names.

## Prior findings

| Finding | Status | Evidence |
|---|---|---|
| Quality I1 (untested GBC fallback) | **Closed** (option c) | `save.ts:66-78`: the try/catch, the facade and the `loadGbcTileset` import are gone. The comment at `:71-72` states the accepted limitation correctly and points to S7a. `readFileSync`, `resolve` and the `GbcProject` type are still used (`:91`, `:108`, `:67`), so no import is left dangling. |
| Quality M1 (restored edit plus corrupted disk throws) | **Closed by S7a** | With the fallback gone, every cold-alias parse failure throws by design until Task 10. That includes the restored-edit case, so S7a covers it. |
| Quality M2 (project-wide load failure throws) | Deferred-acceptable | Task 16 (addenda). It fails closed (a throw, never a wrong write). |
| Quality M3 (raw-path merge key) | **Closed** | `save.ts:23-25` checks both `prior` and `next`. The message matches S3a exactly. `posix.normalize("./data/tilesets/a.bin")` is `data/tilesets/a.bin`, so the new test (`save.test.ts:142-147`) does throw. The expected message string matches `:24` character for character. If the check is removed, merge returns one entry and `caught` fails, which is how M22 is killed. A duplicate inside one input is still caught first on the raw path, which is harmless. |
| Quality M4 (near-copy asserts) | Deferred-acceptable | Task 16. |
| Quality M5 (shared Buffers) | **Closed** | A doc comment was added at `save.ts:114`. |
| Quality M6 (redundancy, mirrored oracles) | Deferred-acceptable | Task 16. |
| Spec Minor 1 (singular/plural not pinned) | **Closed** | See the next section. |
| Spec Minor 2 (S9 order of steps 3 and 4 not pinned) | **Closed** | See the next section. |
| Spec Minor 3 (loose refusal match) | **Closed** | `save.test.ts:477-481` now filters `file-changed-on-disk` and uses `toEqual([one])`. Both fixtures stage two distinct changed files (GBA `:325-328`, GBC `:361-362`) and corrupt only `edits[0]`. So the filter pins exactly one refusal: no duplicate, and none for the untouched `edits[1]`. Other refusal codes are correctly left out of the filter. |
| Spec Minor 4 (S10 import list) | **Closed** | S10a covers the `Refusal` type import. The `gbc/load/tileset.ts` import was deleted with the fallback. |

## New tests checked by hand

- **`tilesetSaveChanges` (`save.test.ts:164-175`).**
  - `path` is `resolve(root, path)`, the same as `save.ts:108`.
  - `kind` is `text` only for `.asm`: `a.bin` and `b.bin` are binary and `c.asm` is text, which is correct.
  - The summaries are `(0 maps)`, `(1 map)` and `(2 maps)`. With `maps.length === 1 ? "" : "s"` these are 0 -> "s", 1 -> "", 2 -> "s". All three expectations are right.
  - An always-plural mutant (M13) fails on `b.bin`. An always-singular mutant fails on `a.bin` and `c.asm`. An inverted `=== 1` test fails on all three.
  - The expected values are literals, not reused output from the code under test.
- **S9 order (`save.test.ts:601-619`).**
  - The plan is taken clean, and the entries are prepared with the staged `after`.
  - Re-merging gives `before = edit.before` (from prior) and `after = edit.after + [7]`, so the session's `after` no longer matches the prepared entry: the entry is stale.
  - The disk is then corrupted, so step 4 would also fail.
  - Commit reads `session.tilesetEdits` live (`write/save.ts:334-335`, `gbc/write/save.ts:259-260`). The session object is the same one, so it sees the new `after`.
  - Step 1 (fresh refusals) does not include tileset baseline refusals (spec S7). So the first failure is the step-3 Error, whose message matches `save.ts:128` exactly for `mapName` and `edit.path`.
  - If the steps are swapped (M23/M24), step 4 throws `BlockEditRefusal` FILE_CHANGED, and both `not.toBeInstanceOf` and the message check fail. That holds for each family.
  - `expectDiskUnchanged` and `expectNoTemps` also guard against a run where neither check fires.
- **No test was weakened.** The only modified expectation (the refusal match) is stricter than before.

## New finding

### Minor N1. The S3a check is narrower than its message says

The check is at `save.ts:23-25`, and the message says "not a canonical repo-relative tileset path". But `posix.normalize` leaves
these paths unchanged, so all of them pass:
- absolute paths (`/x`, `C:/x`)
- parent escapes (`../x`)
- trailing slashes

`resolve(root, "/x")` or `resolve(root, "../x")` would then aim the atomic write outside the repo.

Failure scenario: a Task 9 hub bug stages `../outside.bin`. Merge accepts it, and commit writes outside the subject repo.

S11 puts containment out of Task 8's scope (Task 9/10). The atomic writer's `before` check still requires the baseline to
match that outside file, so this is not a regression introduced by this diff. Either make sure Task 9/10's containment
check covers `tilesetEdits` paths, or extend S3a to reject `isAbsolute`, a leading `../`, and drive-letter paths. That is
one line plus one test case. Not blocking.

Also, the new M3 test covers only the `./` spelling. A backslash spelling (`data\tilesets\a.bin`) goes through the same
`!==` branch, so one case is enough to kill M22. Noted only.

## Not checked

- No vitest or mutation run (brief). The kill claims above come from reading the code. M13, M22, M23 and M24 match the
  conductor's reported kills.
- No code outside `fde9ec5..1cc405b` was re-reviewed, except the commit call sites needed to confirm the S9 test's premise.
