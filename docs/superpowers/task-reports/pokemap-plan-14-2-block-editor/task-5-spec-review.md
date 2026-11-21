# Task 5 spec re-review (fix round 1, 37a1524)

**Verdict: Approved** (0 Critical, 0 Important, 3 Minor)

Scope: `git diff dc73228..37a1524` in `wt-t5`, checked against rulings R1-R10 plus the amendments R2a, R6a, R8a, R9a, R9b and R11. I did not run vitest. Mutation evidence comes from the conductor (M1-M11 all killed). I verified statically that each new test targets the logic named.

## Review 1 findings: resolution

- **I1 (GBA `sharedGrids` untested): resolved.**
  - The GBA oracle now builds `sharedGrids` from the maps of every layout on the file, per R9a.
  - The gTileset_General, staged, secondary and border tests all assert `usage.sharedGrids` toEqual the oracle.
  - A new test requires a non-empty GBA `sharedGrids` (M6 killed).
- **I2 (overlay / generation untested): resolved.**
  - The new test "gbcTileUsage honours tileset overlay" stages metatile bytes with no disk write, so the tile enters one more block.
  - It asserts that `tilesetGeneration` advanced, that the new id appears, and that clearing the overlay restores the original ids (M7 killed).
- **M1 (GBC `sharedGrids` checked only by `find`): resolved.** All GBC usage tests now compare `sharedGrids` toEqual the oracle.
- **M2 (types location): resolved.** `MapUse` and `BlockUsage` moved to types.ts, per R11. usage.ts imports them, and the barrel is unchanged.
- **M3 (GBA `files` checked only by shape): resolved.** `parseGbaTilesetFiles` derives both paths from `headers.h` and `metatiles.h` text, independently of the project. `files` is compared by toEqual (M10 killed).
- **M4 (border branches): resolved.**
  - A GBA border fixture asserts `border > 0` and that it equals the oracle (M8 killed).
  - An R7 test stages a non-containing grid and still expects the map, through its border block (M9 killed).

## Amendments: implementation check

- **R2a.** GBC `border` counts the consuming maps on the file whose border matches. `block0AsBorder` sums the raw-0 cells of the file's effective grid for each such map when id != 0 (usage.ts, `gbcBlockUsage` loop). The disk cache is now keyed by `blkPath`, so every map of the file sees one grid, as R2a says. The representative is unchanged.
- **R6a.**
  - An unconsumed path returns all-empty usage.
  - `files` uses the canonical `key`. A backslash spelling of the input gives the same `files`, which is tested.
  - Collision paths come from the loader, which is already canonical.
- **R8a.** The primary == secondary special branch is deleted. Two uses are added, primary first. The sort by layout id is stable, so primary stays before secondary.
- **R9a.**
  - `interior` sums over the distinct targets.
  - `border` sums over the distinct (borderFilepath, target) pairs.
  - The representative is the first map of the consuming layouts.
  - `sharedGrids` and the staged lookup use the maps of every layout on the file (usage.ts:390).
- **R9b.** An unknown symbol returns empty usage before any map read (the first statement). This is tested (M11 killed).
- **R11.** Done.

I found no new spec deviation in the fix diff.

## Conductor's question: synthetic tests

- **R2a: not needed, but half of it is testable on the corpus without a synthetic project.**
  - Every shared GBC `.blk` has border `$00` (I scanned `attributes.asm` against `blocks.asm`, e.g. PortPassage x2, House1 x50, Pokecenter1F x21). So the border-count half of R2a runs today: query id 0 on a shared file, and the PortPassage entry must report `border: 2`.
  - The current tests reach that case only if the block-0 test's metatiles file happens to include a shared `.blk` (zeroUsage toEqual the oracle). See Minor N1.
  - The `block0AsBorder` sum needs a shared `.blk` with a non-zero border, which no corpus file has. No synthetic test is required for that half.
- **R8a / R9a multi-target: no synthetic test required.**
  - Both branches are short and match the rulings line by line.
  - The oracle implements them independently.
  - No corpus layout reaches them, and the failure mode (double count, or a missing secondary use) is visible in review.
  - Add one only if a later task makes a shared or self-paired layout reachable from the UI.

## Minor

**N1. The R2a border-sum half is not pinned by an explicit assertion.**
- Failure scenario: revert R2a to representative-only, `border = rep.border === id ? 1 : 0`. Whether a test fails depends on which tileset `candidates[0]` lands on in the block-0 test.
- Fix: one corpus assertion, `gbcBlockUsage(proj, <PortPassage metatiles>, 0, new Map())`. The PortPassage entry must have `border === 2` and `block0AsBorder === 0`.

**N2. A stale comment at usage.ts:429** says "use alphabetically first consuming map present in grids". The next line correctly uses `allMapNames`, meaning any map backed by the file. Reword the comment so it does not mislead a later fix.

**N3. A meaningless fixture filter at usage.test.ts:1120.** `tileBlockIds(o.root, ts.metatilesPath, map.border)` passes the border *block* id as a *tile* id. The filter is harmless, because the real fixture comes from the border block's bytes on the next lines, but it confuses readers and can skip valid maps. Drop it, or replace it with a bounds check that the border block exists in the file.
