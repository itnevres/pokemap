# Plan 6 Task 2 -- implementer report

**Status:** DONE

## Files

New:
- `packages/core/src/family.ts` -- `EngineFamily`, `detectEngineFamily(root)`.
- `packages/core/src/gbc/model/types.ts` -- `Block { metatileId }`, `Metatile { tiles: number[] }`.
- `packages/core/src/gbc/load/blocks.ts` -- `parseBlk`, `encodeBlk`.
- `packages/core/src/gbc/load/tileset.ts` -- `parseMetatiles`, `encodeMetatiles`.
- `packages/core/src/gbc/load/incbin.ts` -- `parseIncbins`, `IncbinEntry`.
- `packages/core/test/family.test.ts` (8 tests).
- `packages/core/test/gbc/helpers/corpus.ts` (helper, no dedicated test, mirrors `packages/core/test/helpers/corpus.ts`).
- `packages/core/test/gbc/load/blocks.test.ts` (10 tests).
- `packages/core/test/gbc/load/tileset.test.ts` (11 tests).
- `packages/core/test/gbc/load/incbin.test.ts` (11 tests).

Modified:
- `pokemap.config.json` -- added top-level `"gbc": { "projectPath": "C:/Programming Projects/pokecrystal-PerfPlus", "referenceProjects": [] }`, existing keys byte-identical otherwise.

No GBA source or test file touched. `git status --porcelain` confirms only the above (plus the config edit).

## Test counts

710 existing + 40 new = **750 passed**, 77 test files. `npm run typecheck` clean (had to fix 2 real `noUncheckedIndexedAccess` issues in `incbin.ts`/`blocks.ts` prod code with `readUInt8`/`!`-asserts on regex capture groups, and 5 in `tileset.test.ts` with `!`-asserts on array access -- all pre-existing tsconfig strictness, not new relaxation).

PerfPlus: `git -C "C:/Programming Projects/pokecrystal-PerfPlus" status --porcelain` empty before and after. Read-only respected throughout.

## Measured pins (re-derived myself, per instructions -- did not trust the findings doc)

All matched the findings doc **except one**, noted below.

- `data/maps/blocks.asm`: 305 INCBINs, 439 labels total, 305 distinct paths. Matches.
- `maps/House1.blk`: 50 labels precede its INCBIN. Matches (findings flagged this as unmeasured; now pinned).
- `maps/NewBarkTown.blk`: 90 bytes; first 20 ids `05 05 18 1f 19 05 05 05 05 05 05 47 1c 77 1e 05 18 19 05 05`. Matches.
- `maps/CeruleanCave2F.blk` / `CeruleanCaveB1.blk`: both 400 bytes, round-trip whole. Matches.
- All 305 `.blk` INCBIN paths: `encodeBlk(parseBlk(buf))` byte-equals `buf` for every one, 0 failures.
- `johto_metatiles.bin` first 3 metatiles: all-`0x00`, all-`0x06`, all-`0x05`. Matches.
- Metatile counts: 128 x5 (johto, johto_modern, kanto, battle_tower_outside, unused_johto), 40 x1 (forest). Matches.

**Discrepancy found and re-verified twice with independent throwaway scripts + a `grep -n` sanity check + cross-check against `data/tilesets.asm`'s `tileset` table:**

`gfx/tilesets.asm` has **36** distinct `*_metatiles.bin` INCBIN paths, not 37 as the findings doc states. So the 64-count bucket is **30** tilesets, not 31 (5 + 1 + 30 = 36).

Root cause: `data/tilesets.asm`'s `Tilesets::` table lists 37 `tileset` entries, but two of them are aliases that share a stacked label with another tileset's `Meta` INCBIN rather than having their own:
- `Tileset0Meta::` / `TilesetJohtoMeta::` stack onto one `INCBIN "data/tilesets/johto_metatiles.bin"`.
- `TilesetCaveMeta::` / `TilesetDarkCaveMeta::` stack onto one `INCBIN "data/tilesets/cave_metatiles.bin"`.

37 table entries − 2 aliased-not-separate + 1 unreferenced extra (`unused_johto`, not in the table) = 36 actual INCBINs/files. I pinned **36** in `tileset.test.ts` (with a comment explaining the correction) rather than the doc's 37. This does not affect any other Task 2 deliverable -- the round-trip and count-map assertions are correct either way since they derive `metatilesBinPaths` from `parseIncbins` directly rather than from a hardcoded 37.

## Mutation checks (all performed, all caught, all reverted -- confirmed via `git status --porcelain` = clean diff limited to the intended new/modified files)

a. `encodeBlk`: replaced the throw with `buf[i] = b.metatileId & 0xff` (silent clamp). Result: 3 of the refusal tests in `blocks.test.ts` went red (`256`, `-1`, `1.5` no longer throw). Reverted, re-ran green.
b. `parseMetatiles`: swapped row-major for column-major within each 4x4 grid. Result: the 36-path round-trip corpus pin went red (`expect(failures).toEqual([])` failed with all 36 paths listed), 2 of 11 tests red. The uniform-value tests (all-same-byte metatiles) stayed green, as expected -- a column-major permutation of an all-`0x06` row is still all-`0x06`, so only the round-trip identity test (not the "first 3 metatiles" test) is guaranteed to catch this class of bug; it did. Reverted, re-ran green.
c. `parseIncbins`: replaced `pending.push(label[1]!)` with `pending = [label[1]!]` (keep only the last stacked label). Result: the 439-labels-total pin and the House1-50-labels pin both went red (measured 305 and 1 respectively instead of 439/50), 3 of 11 tests red. Reverted, re-ran green.

## Self-review / concerns

- `detectEngineFamily`'s "both match" and "yellow shape" checks are ordered so a root with `fieldmap.h` present can never be misrouted into the Yellow-shape branch (the yellow check only runs after both `isGba` and `isGbc` are false). Not exercised by a real-root test (no root has both fieldmap.h and the Yellow dir), only by the synthetic suite.
- `parseIncbins`'s "blank line between label and INCBIN" question: measured zero occurrences in both real files (`blocks.asm`, `tilesets.asm`), so blank lines are simply skipped (inert), never tested against a real blank-line case because none exists. If Task 3/5 hits a file where it does occur, this is the place to revisit.
- `Metatile.tiles` is a plain `number[]`, not a fixed 16-tuple type -- `encodeMetatiles` enforces the length at runtime instead. Kept it simple (ponytail: a tuple type would need a distinct literal-length TS type or a helper, for a property already runtime-checked at the only place it matters).
- Corpus tests use `readFileSync` with paths straight from `parseIncbins`/config; no writes anywhere under PerfPlus (grep-verified: no `writeFileSync`/`fs.write*` calls anywhere in the new test or src files).

## Commit(s)
See final reply for SHA(s).

## Fix round 1

Spec review (`docs/superpowers/task-reports/pokemap-plan-6-gbc-foundation/task-2-spec-review.md`) found 2 blocking issues + 3 recommended test gaps. All addressed, no other src bug found -- both blocking issues were test-wiring/doc gaps, not implementation bugs (`family.ts`, `gbc/load/*.ts` are byte-identical to the first commit).

**1. `gbcCorpusRoots()` never called (❌).** Fixed: the two whole-corpus round-trip tests (`blocks.test.ts` "every .blk INCBIN path...", `tileset.test.ts` "distinct *_metatiles.bin paths...") now `for (const root of gbcCorpusRoots())`, re-deriving `paths` per root from that root's own `blocks.asm`/`tilesets.asm` rather than a `beforeAll`-cached subject-only list. Subject-specific pins (305 `.blk` paths, 36 metatiles paths) are gated `if (root === GBC_SUBJECT_ROOT)` inside the loop, so a future vanilla-pokecrystal reference root (different map count, no CeruleanCave) is checked for round-trip identity but not against the subject's counts.
   - Verified the wiring mechanically works for N>1 roots with a throwaway script (`fakeRoots = [PerfPlus, PerfPlus]`): 2 root iterations, 610 = 305×2 path checks. Not committed; deleted after.
   - No mutation-kill is currently possible for "loop vs. hardcode": `gbc.referenceProjects` is `[]` today, so `gbcCorpusRoots()` returns the same single-element array either way -- this is the exact "silent gap" the reviewer named (M15), not a bug with an observable failure yet. It becomes observable (and killable) the day a reference root is added.

**2. Findings doc 37→36 and related corrections.** Edited `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md`:
   - §3.2 table: "all other 31" → "30", with a pointer to the corrected count.
   - Task 2 consequences (was L564): explains 37 `tileset` table entries vs 36 distinct `_metatiles.bin` INCBIN paths (`Tileset0Meta::`/`TilesetJohtoMeta::` and `TilesetCaveMeta::`/`TilesetDarkCaveMeta::` are stacked-label aliases, not separate files; `unused_johto` isn't in the table but has its own file).
   - Extra findings / tileset aliases (was L380): DarkCave shares cave's metatiles, collision AND palette map (verified all three stacking sites in `gfx/tilesets.asm`/`gfx/tileset_palette_maps.asm`) -- **but not GFX**: `TilesetDarkCaveGFX::` INCBINs its own `dark_cave.2bpp.lz`, unstacked. Named the 3 on-disk orphan files (`dark_cave_metatiles.bin`, `_collision.asm`, `_palette_map.asm`).
   - Task 4 consequences (was L582): 37 `*_collision.asm` exist on disk, but `gfx/tilesets.asm` `INCLUDE`s only 32 (5 orphans: dark_cave + the 4 non-beta word rooms, all stacked onto `cave_collision.asm`/`beta_word_room_collision.asm` instead). Recommended Task 4/5 splice/round-trip the 32 `INCLUDE`d files (the reachable set), noting the 5 orphans are valid `tilecoll` files that could optionally extend the round-trip later.
   - Verified but **left unchanged** per the coordinator's caution: L151/L199/L200/L284's "37 palette maps"/"37 collision files" are on-disk file-shape claims (measured 37 on disk for both palette-map and collision files, independent of INCLUDE reachability), and both counts check out true as written.

**3. Test gaps.**
   - (a) `family.test.ts`: added "throws (not gbc) when only attributes.asm exists, without map_constants.asm" -- passed immediately (existing `&&` logic was already correct); mutation-checked by changing `isGbc` to `||`, which turned this test and the real-pokeyellow test red (3 of 9 failed); reverted, green.
   - (b) `incbin.test.ts`: added "keeps a label across a blank line before its INCBIN" -- passed immediately (blank lines were already inert); mutation-checked by making a blank line reset `pending`, which turned it red (1 of 12 failed); reverted, green.
   - (c) covered by fix 1.

**Verification after all fixes:** `npx vitest run` = 77 files / **752** tests passed (750 + 2 new gap-filling tests). `npm run typecheck` exit 0. `git -C pokecrystal-PerfPlus status --porcelain` empty. PokeMap diff scope: `docs/.../findings.md` + the 4 test files modified; `src/family.ts` and `src/gbc/**` untouched (no code bug existed, only test/doc gaps).

## Re-review 1

Coordinator's re-review found 1 blocking issue + 1 doc nit.

**1. Vacuous-pass hole (M17, ❌ blocking).** Both `gbcCorpusRoots()` loops (added in Fix round 1) would pass trivially if `gbcCorpusRoots()` ever returned `[]` -- an empty loop makes `failures` stay `[]` and skips the in-loop 305/36 pins entirely. Fixed by adding `expect(gbcCorpusRoots()).toContain(GBC_SUBJECT_ROOT)` as the first line of each test body, before the loop, in both `blocks.test.ts` and `tileset.test.ts`.
   - Mutation-checked directly against the real helper: temporarily changed `packages/core/test/gbc/helpers/corpus.ts`'s `gbcCorpusRoots` to `() => []`. Both guarded tests went red (`expected [] to include 'C:/Programming Projects/pokecrystal-P…'`). Reverted `corpus.ts` to its original body (`[GBC_SUBJECT_ROOT, ...GBC_REFERENCE_ROOTS].filter(hasGbcProject)`) -- confirmed byte-identical to before the mutation via re-running the full suite green; `corpus.ts` is not in this round's diff.

**2. Findings doc L380 word-room orphan count (⚠️ doc nit, fixed).** The Fix-round-1 wording said "like the 4 word-room collision/palette-map files below," conflating two different counts. Verified directly:
   - Collision: `TilesetBetaWordRoomColl::`/`HoOh`/`Kabuto`/`Omanyte`/`Aerodactyl` all stack onto **`beta_word_room_collision.asm`** (Beta's own file is the one used) -- so only **4** word-room collision files are orphans (ho_oh/kabuto/omanyte/aerodactyl).
   - Palette map: `TilesetRuinsOfAlphPalMap:`/`BetaWordRoom`/`HoOhWordRoom`/`KabutoWordRoom`/`OmanyteWordRoom`/`AerodactylWordRoom` all stack onto **`ruins_of_alph_palette_map.asm`** -- Beta's own `beta_word_room_palette_map.asm` is *not* the one used here, unlike collision. `diff` confirms it is byte-identical to `ruins_of_alph_palette_map.asm` but never `INCLUDE`d. So **5** word-room palette-map files are orphans (beta included).
   - Corrected the L380 sentence to state 4 collision orphans and 5 palette-map orphans separately, with the reason (Beta anchors its own collision group but not its own palette-map group).

**Verification after re-review fixes:** `npx vitest run` = 77 files / **752** tests passed (unchanged count -- these were test-hardening + doc edits, no new tests). `npm run typecheck` exit 0. `git -C pokecrystal-PerfPlus status --porcelain` empty. Diff scope: `docs/.../findings.md` + `blocks.test.ts` + `tileset.test.ts` only.

