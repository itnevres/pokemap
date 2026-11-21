Approved -- Critical 0, Important 0, Minor 4

# Task 8 spec review (Plan 14.2, core save integration)

Scope: `git diff 7219c95..fde9ec5 -- packages/` in the read-only checkout `rv-t8` (detached at fde9ec5).
Static review only: no vitest run, as the brief requires. Mutations were traced by reading the code, not run.

## Ruling-by-ruling verdict

- **S1 Paths: implemented exactly.** `PendingChange.path` = `resolve(root, path)` (`blockEdit/save.ts:140`),
  `AtomicEntry.path` = `resolve(root, edit.path)` (`:148`), and the commit match uses `resolve(entry.path) === resolve(root, edit.path)` (`:156-157`).
  Refusal subject, path and message use the repo-relative path (`:132-133`, `:34`). Root is `proj.paths.root`
  (`write/save.ts:251-253,303,334-335`) and `proj.root` (`gbc/write/save.ts:195-197,219,259-260`).
- **S2 Changed edit: implemented exactly.** One predicate, `changedTilesetEdits` (`blockEdit/save.ts:117-119`, `!after.equals(before)`),
  feeds effects, changes (through effects), refusals, prepared entries, the assertion and the baseline check. Restored
  entries are kept by merge (`:16-28`).
- **S3 mergeTilesetEdits: implemented exactly.** Before comes from prior and after from next (`:25`). Prior-only and next-only entries
  pass through unchanged and are not copied. Output is a new array sorted by path (`:28`). Inputs are not mutated. A duplicate path
  inside either input (the `seen` set is reset per input, `:18`) gives BAD_VALUE with the exact message (`:21`). A path that
  appears once in each input does not count as a duplicate.
- **S4 checkTilesetBaselines: implemented exactly.** It checks changed edits only, in path order. A missing or unreadable file
  and a byte mismatch are both caught by the try/catch (`:121-127`). It throws FILE_CHANGED with the exact message (`:34`), only reads,
  and returns nothing.
- **S5 Effects: implemented exactly.**
  - GBA (`:39-62`) maps each symbol's canonical `metatilesBin`/`attributesBin` to symbols, then matches the primary or secondary
    tileset of `layoutForMap` over `mapNames()`. Distinct and sorted. An unknown path gets `maps: []`. `tilesetPaths` is already canonical
    (`project.ts:177-184`), so re-canonicalising is a harmless no-op.
  - GBC (`:64-110`) builds maps from `gbcTilesetsForFile`, distinct and sorted. The try/catch fallback that reloads from baselines
    is not in the ruling but does not change the result. It only runs when a relation scan throws while a changed file
    mismatches its baseline, which is exactly the S7 "planning never throws" case: `buildGbcRelations` (`usage.ts:57-60`) loads
    every map's tileset, so a cold alias of an externally corrupted file would otherwise throw. Its correctness, masking and
    simpler alternatives belong to the quality pass.
- **S6 Session: implemented exactly.** The field is added to both session interfaces (`write/save.ts:74`, `gbc/write/save.ts:62`). Every use site
  reads `?? []`.
- **S7 Plan: implemented exactly.** `tilesetEffects` is always present. Changes are appended after all existing changes
  (`write/save.ts:251-252` follows script appends; `gbc/write/save.ts:195-196` follows constEdits). Kind is `.asm` → text. The summary
  wording and singular/plural are correct (`blockEdit/save.ts:142`). The refusal shape matches field for field (`:131-135`), one per
  mismatching changed path. The mismatch predicate does not throw. Plan-time refusals are not added to `collectRefusals` /
  `guardGbcSave`, so commit's step 1 does not turn FILE_CHANGED into a generic "save refused" Error (the commit
  test pins this, see below).
- **S8 Prepare: implemented exactly.** Entries are appended last in path order, with `before` = the session baseline and no disk read (`:146-150`).
- **S9 Commit: implemented exactly, order 1-5.** GBA: fresh refusals → `entries = prepared ?? prepareSave` → assert →
  baselines → write (`write/save.ts:330-336`). GBC: same, with the existing constants check kept before the tileset assert
  (`gbc/write/save.ts:249-261`). The assert requires exactly one entry with non-null `before` equal to the baseline and `after` equal to the staged bytes, and uses the exact message
  (`blockEdit/save.ts:152-161`). Every step before `writeFilesAtomically` writes nothing. Commit never assigns to the session.
- **S10 Placement: implemented.** Both save modules add calls only (no copied logic). `index.ts` re-exports `save.js`. Neither
  `write/save.ts` nor `gbc/write/save.ts` is imported by `blockEdit/save.ts`, so there is no cycle. See Minor 4 for the import list.
- **S11: respected.** No hub, overlay or containment code was added.

## Tests: what each pins, and whether a wrong implementation could pass

Oracles are independent. Expected maps come from `expectedGbaMaps` and `expectedGbcMaps` (`save.test.ts:217-235`), which scan directly and do not use
`usage.ts` or the effects functions. Expected grid bytes are a hand patch of one raw word (`:302-304`, `:339-340`). No expectation reads
the output of the code under test, except `:645-646`, which compares absent-plan output with `[]`-plan output. That comparison is
what S6 asserts.

- Merge (`:79-99`) pins S3 first-before and last-after across three merges, using `toBe`, so buffers are not copied. **Plan mutation "merge keeps
  the latest before"** fails at `:88` and `:90`. `:101-124` pins prior-only and next-only entries, sorting, and purity (a frozen array makes an
  in-place sort throw). `:126-140` pins an undefined prior and kept restored entries. `:142-154` pins BAD_VALUE in both inputs.
- Baselines (`:158-212`) pin accept, mismatch, missing, unreadable (a directory), skipping restored edits, and path order. A mutation that
  drops the sort fails at `:211`.
- Effects (`:409-419`). For GBA, a primary-metatiles edit and a secondary-attributes edit are each asserted non-empty (`:415`), so
  dropping either the secondary check or the attributesBin check gives `[]` and fails. For GBC, the oracle covers all four identity
  files. The orphan edit pins `maps: []`, and the restored edit pins its omission.
- Plan (`:421-448`) pins exact change order (grid, then tileset paths in path order, starting from reversed input), the change
  objects, `.asm` → text (GBC asserts one binary and one text change), and no writes.
- Plan after external edit (`:450-471`) pins not throwing, the exact refusal, and that S8 `before` is the baseline rather than a disk read. A fresh-read
  mutation fails at `:466`.
- Commit atomic set (`:473-514`) pins prepared entry order and contents, one atomic set (every temp write before the first rename,
  renames in entry order), the resulting bytes, and that the session is unchanged after success.
- **Plan mutation "commit skips the baseline re-check"** fails at `:517-542`. With `prepared` supplied, the next call is
  `writeFilesAtomically` with throwing IO, so the error is not a BlockEditRefusal. With `prepared` undefined, the same happens. Because this test
  expects BlockEditRefusal FILE_CHANGED, it also fails if the tileset refusal is folded into commit's step-1 check.
- **Plan mutation "prepared-entry match skipped"** fails at `:545-579`. For "stale", the baseline check passes and the write would succeed,
  so nothing is thrown. For "wrong before" and "null before", the atomic writer throws a different message, which fails the exact-message expectation at `:572`. For
  "duplicate", a `find`-style match lets the call through to the writer. For "missing", nothing is thrown. Each also pins the map name in the message.
- Rollback (`:581-605`), restored edits (`:607-632`, which pin all four S2 exemptions including the commit baseline check and the
  prepared-entry requirement), absent/`[]` (`:634-649`), fingerprint (`:651-666`), and GBC aliasing (`:670-694`) all pin what they name.

## Findings

**Minor 1 -- singular "1 map" and "0 maps" in the change summary are not pinned.** `save.test.ts:433-439` computes the expected
summary with the same pluralisation formula as `blockEdit/save.ts:142`. The plan test only uses the fixture's real
tileset files, and each loads the tileset of a well-used map, so the count is almost certainly above 1. The orphan `maps: []` case is
checked only in the effects test, never in a plan's summary. Failure scenario: a mutation to `` `(${n} maps)` `` would likely
pass the whole suite, and the UI would then show "1 maps". Fix: plan once with a session that adds an orphan changed file
(expect `(0 maps)`), and a unit test of `tilesetSaveChanges` with `maps: ["X"]` (expect `(1 map)`).

**Minor 2 -- S9 order between step 3 (prepared assert) and step 4 (baseline check) is not pinned.** No test has both a bad
prepared entry and an external edit. Failure scenario: swapping `blockEdit/save.ts` calls at `write/save.ts:334-335` (or
`gbc/write/save.ts:259-260`) passes every test, and the user would get FILE_CHANGED where the ruling says "missing or stale". Both
outcomes refuse and write nothing, so the impact is only the error wording.

**Minor 3 -- "one refusal per mismatching path" is pinned only loosely.** `save.test.ts:457` uses `toContainEqual`, so a
duplicated refusal or an extra refusal for the second, unchanged-on-disk path would still pass. The implementation is correct
(`blockEdit/save.ts:131`). Tightening to `plan.refusals.filter(r => r.code === "file-changed-on-disk")` `toEqual([that one])`
would close the gap.

**Minor 4 -- S10's import list is broader than the ruling lists, with no cycle.** `blockEdit/save.ts:6` type-imports `Refusal` from
`write/guards.ts`, and `:10` runtime-imports `loadGbcTileset` from `gbc/load/tileset.ts`. Neither appears in S10's "may import"
list. Neither imports either save module (`write/guards.ts` imports types only; `gbc/load/tileset.ts` imports
`blockEdit/canonicalTilesetPath.js` plus `gbc/load/*` and `config/paths.js`). So the ruling's intent of no cycle and no import from the save modules
holds. Recorded so the conductor can either accept it or amend S10's wording. No code change is needed for correctness.

Observation (not a deviation): if a *restored* edit's file is externally corrupted and a cold GBC alias tileset loads it,
`gbcTilesetEffects` rethrows the load error (`blockEdit/save.ts:79`, because baselines exclude restored edits), so `planGbcSave`
throws. S7's "never throws" covers baseline-mismatch refusals of changed edits only, and a corrupted file without any edit behaves
the same way today. The quality pass should decide whether that matters.

## Not checked

- No tests or mutations were run (forbidden by the brief). The mutation conclusions above come from reading the code paths. The conductor's own
  mutation run is the empirical check.
- Whether the actual GBA and GBC fixture map counts make any summary read "1 map" (this needs a run).
- Quality-pass topics: the GBC fallback's design (object spread of `GbcProject` and per-call relation-cache misses), duplicated
  checks between the GBC constants assert and the tileset assert, and Windows `resolve` case sensitivity.
- Typecheck ambiguity of the new `export *` names through `core/src/index.ts`. The conductor reports typecheck passing.
