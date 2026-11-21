Needs changes -- Critical 0, Important 1, Minor 6

# Task 8 quality review (core save integration: tileset edits in the save set)

Scope: `git diff 7219c95..fde9ec5 -- packages/`, read in the detached checkout `rv-t8` at `fde9ec5`. This was a static
review: no vitest run, per the brief. I read the GBC fixture corpus (`C:/Programming Projects/pokecrystal-PerfPlus`)
directly to work out whether the fallback is exercised.

## What holds up

- Commit order matches S9 in both families: fresh refusals, then `entries`, then the constants check (GBC), then
  `assertPreparedTilesetEdits`, then `checkTilesetBaselines`, then `writeFilesAtomically`
  (`write/save.ts:333-336`, `gbc/write/save.ts:249-261`). Nothing writes before the last step.
- Purity: `mergeTilesetEdits`, `changedTilesetEdits`, the effects, the refusals and the entry builders never write to
  their inputs (`filter`/`map`/new `Map` only). Commit never touches `session.tilesetEdits`.
- Import cycles (S10): `blockEdit/save.ts` imports only types from `project.ts`, `gbc/project.ts`, `write/atomic.ts`
  and `write/guards.ts`. At runtime it imports `usage.ts`, `canonicalTilesetPath.ts`, `types.ts` and
  `gbc/load/tileset.ts`. None of those import `write/save.ts` or `gbc/write/save.ts`; I checked with grep over
  `src/gbc/load`, `src/load` and `src/blockEdit/usage.ts`. There is no cycle.
- Shared code: both save modules call the same nine helpers. The only remaining near-copy is noted in M4.
- Windows paths: every on-disk target is `resolve(root, edit.path)`, the same way `constEdits` resolve.
  `assertPreparedTilesetEdits` runs `resolve` on both sides, so a forward-slash GBC root (`norm(root)`) and a
  backslash prepared entry compare equal. A drive-letter case mismatch fails closed ("missing or stale"); it never
  writes the wrong file.
- The new exports in the barrel do not collide with any other `src` export (checked with grep).
- TOCTOU: `checkTilesetBaselines` runs right before `writeFilesAtomically`, and the atomic writer checks
  `before == edit.before` (S8) again on its own.

## Important

### I1. The `gbcTilesetEffects` fallback is untested in practice, and Task 10's overlay pre-empts the one case it rescues

`packages/core/src/blockEdit/save.ts:73-107`

Why it can fail: `gbcTilesetsForFile` -> `buildGbcRelations` (`usage.ts:51-60`) calls `proj.tileset(c)` for every map's
tileset const. That fully parses metatiles, palette map, collision and gfx PNG just to learn four paths. If a staged
file was corrupted externally (for example, a metatiles length that is not a multiple of 16, which makes
`parseMetatiles` throw) and some tileset const reading it is not yet cached, the load throws. Without a fallback,
`planGbcSave` would throw instead of returning the S7 `file-changed-on-disk` refusal.

Which test needs it: by my static derivation, none.
- The only GBC external-edit plan test is `save.test.ts:450`. Its fixture (`gbcFixture`, `save.test.ts:324-345`)
  corrupts `data/tilesets/johto_metatiles.bin` (`f.edits[0]`) after `proj.tileset("TILESET_JOHTO")` is already
  cached (`save.test.ts:333`, `:340`).
- In PerfPlus, `gfx/tilesets.asm:22-28` points only `Tileset0Meta` / `TilesetJohtoMeta` at that file. `Tileset0` is
  `TILESET_0`, which no map in `data/maps/maps.asm` uses. All 29 `TILESET_JOHTO` maps hit the warm cache.
- So `effects(proj)` succeeds, and the `catch` body never runs.
- The alias test (`save.test.ts:670`) does no corruption.
- The conductor's in-progress mutation run should confirm this: replace the whole `try/catch` with
  `return effects(proj);`. I expect the GBC suite to stay green.

The rescued case does not survive Task 10: once the hub sets the overlay with the staged bytes, `readTilesetFile`
(`gbc/project.ts:102`) serves those paths from the overlay. Corrupt disk bytes for a staged file never reach the
loader. The fallback then only covers the Task-8-only state "staged edits, no overlay".

Correctness, as written:
- It does not mask errors. It rethrows `loadError` when no baseline was used, and `retryError` when the baseline
  load also fails. When no changed edit mismatches, it rethrows the original error (`:76`).
- It does not leak. The facade is a fresh object, so its `gbcRelations` entry sits in a `WeakMap` and is collected.
  Spreading `...proj` snapshots the `tilesetGeneration` getter, which is harmless for a single scan.
- The comment at `:78-80` is inaccurate. The facade delegates to `proj.tileset`, so every successful cold load during
  the retry is added to the real project's `tilesetCache`. That is harmless (the bytes are identical), but the
  comment claims the cache stays untouched.
- The fallback reader (`:96`) bypasses the project overlay and reads disk for unstaged files. That diverges from the
  real reader once an overlay exists. It is harmless for path relations, but it is a second read path to maintain.
- The `if (!usedBaseline) throw loadError` inside a `try` whose `catch` rethrows `loadError` (`:97-101`) is correct
  but needlessly convoluted.

Failure scenario: someone changes the fallback (a wrong map key, a dropped `canonicalTilesetPath`, a missing
rethrow) and every test stays green. Production then either throws from `planGbcSave` or reports wrong `maps` counts
in the save dialog, for the external-corruption-plus-cold-alias case the code was written for.

Fix (pick one):
- (a) Simplest and correct: resolve tileset file paths without parsing contents. A path-only helper factored from
  `loadGbcTilesetByName` (`gbc/load/tileset.ts:473-500`) only needs `constants/tileset_constants.asm`,
  `data/tilesets.asm`, `gfx/tilesets.asm` and `gfx/tileset_palette_maps.asm`. None of those is a staged tileset
  file. With it the effects scan can no longer fail on staged-file corruption, the fallback disappears, and the
  scan stops decoding every tileset PNG on each plan.
- (b) Keep the fallback, but add one GBC test that hits it. Corrupt a file read by a const that no earlier call has
  loaded, or open a fresh project after the corruption. Also fix the comment.
- (c) Delete the fallback and record in the rulings that a cold-alias parse failure throws until Task 10's overlay.

## Minor

### M1. A restored edit with a corrupted disk file can still make `planGbcSave` throw

`blockEdit/save.ts:75-76`

The fallback's `baselines` holds only changed, mismatching edits. Scenario:
- The session holds edit A (changed, disk still matches) and edit B (restored, `after == before`, an S2 non-change).
- B's file is externally truncated, and a cold tileset const reads it.
- `effects(proj)` throws, `baselines` is empty, and the parse error escapes `planGbcSave`.

S2 says a restored edit has no baseline requirement, so a plan that throws here is surprising. The case is rare, and
Task 10's overlay removes it too. Fix (a) under I1 removes it as well.

### M2. Any project-wide load failure now makes planning throw, once a session has a changed tileset edit

- GBC: `gbcTilesetEffects` loads every map's tileset (`usage.ts:55-58`). A broken, unrelated tileset anywhere in the
  project throws from `planGbcSave`, while a session without tileset edits still plans.
- GBA: `gbaTilesetEffects` calls `proj.layoutForMap` for every map (`blockEdit/save.ts:54`). That throws on any map
  whose `layout` id is not in `layouts.json` (`project.ts:187-196`). `usage.ts:332-343` (`gbaMapsByLayout`) uses
  `proj.map(name).layout` and tolerates such a map.

Failure scenario: a decomp with one dangling layout reference can paint, but cannot save a block edit on any map.
This matches the usage index's existing exposure on GBC, so it is Minor. Consider reusing `usage.ts`'s cached
`gbaRelations` (`consumingBySymbol` + `mapsByLayout`) instead of a third symbol-to-maps derivation. That also avoids
re-reading every `map.json` relation on each plan.

### M3. `mergeTilesetEdits` keys on the raw path and never canonicalises or checks it

`blockEdit/save.ts:19-25`

Scenario:
- The prior edit is `data/tilesets/a.bin` and the next is `data\tilesets\a.bin`, or `./data/...`.
- Both survive as separate entries with separate baselines.
- The plan lists two changes for one file, and `prepare` emits two entries for one target.
- At commit, `assertPreparedTilesetEdits` sees `matches.length === 2` and refuses.

That fails closed, but the error ("missing or stale") misleads. S1 makes the canonical path the caller's (Task 9 hub)
duty, so this is Minor. A one-line `canonicalTilesetPath(edit.path) === edit.path` check that raises `BAD_VALUE`
would pin it.

### M4. The GBC constants assertion and `assertPreparedTilesetEdits` are near-copies

`gbc/write/save.ts:250-258` vs `blockEdit/save.ts:152-162`

These are the same filter, the same `matches.length !== 1`, and the same `before?.equals` / `after.equals`, with a
different noun. The rulings keep the constants check in place, so this is optional. A shared
`assertPreparedEntry(root, mapName, path, before, after, noun)` would remove the drift risk.

### M5. Prepared entries share the session's Buffers

`blockEdit/save.ts:144-148`

`AtomicEntry.before` and `.after` are the same objects as `edit.before` and `edit.after`. S3 and S8 allow this, and no
current code mutates entry buffers in place (the GBA script path reassigns `entry.after`; it does not mutate it).
Any future in-place change, for example a CRLF normaliser that edits `entry.after`, would silently corrupt the
owner's baseline. Document the aliasing on `prepareTilesetEdits`, or freeze nothing and leave a one-line warning.

### M6. Small dead or inconsistent bits

- `blockEdit/save.ts:49`: `canonicalTilesetPath(file)` is redundant, because `proj.tilesetPaths` already returns
  canonical paths (`project.ts:177-184`). It is harmless.
- `blockEdit/save.ts:44` short-circuits on no changed edits, but `gbcTilesetEffects` has no such guard. It still
  returns `[]` without building relations, because `changed.map` over `[]` never calls `gbcTilesetsForFile`, but the
  two read differently.
- Test oracles: `expectedGbaMaps` (`save.test.ts:217-227`) restates `gbaTilesetEffects` call for call
  (`tilesetSymbols` / `tilesetPaths` / `layoutForMap`), and `expectedGbcMaps` loads tilesets the same way
  `buildGbcRelations` does. A shared bug in the project API would pass both. The Cave/DarkCave test
  (`save.test.ts:686-690`) partly offsets this with name-level containment checks. The spec pass should weigh this.

## Not checked

- I ran no tests and no mutations, per the brief. I1's "the catch never runs" is a static derivation from the
  fixture and the PerfPlus asm. Please confirm it with the conductor's mutation run.
- The GBA corpus fixture (`copyGbaTilesetProject`): I did not check its aliasing or which tilesets it caches.
- The `writeFilesAtomically` internals beyond its documented `before` check. I did not re-verify rollback.
- The S1-S11 test-by-test pinning analysis (spec role).
