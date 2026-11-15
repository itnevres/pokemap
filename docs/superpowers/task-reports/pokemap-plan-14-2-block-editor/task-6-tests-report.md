
## Fixture and oracle design

This is high risk because fixtures include independent numeric scans, source parsing, and error boundaries. The native GPT writer route was selected for an iterative multi-file task; the conductor provides separate independent reviews. Baseline `e2dfa278545a7a4fd4081cf48cd199493dbb0c60`; 35-minute budget, one repair round. No Anthropic tool was available. No commits were made.

Every corpus case uses `itWithGbcCorpus` with a 60-second timeout. `forest()` scans for an unshared Forest map. `localFixture()` scans map-used tilesets, compares canonical paths for local compatibility, reads metatile bytes across every tileset sharing the sheet, parses `tilepal` names, decodes sheet pixels, and scans reservations and source block bytes. It selects a source and target name with no existing reusable non-reserved match and at least two free slots. The tests compare decoded pixels, not encoded PNG bytes. The permitted patchers are used to construct expected palette/PNG changes, not to choose candidates. Project calls supply map metadata and static file associations; bytes are read separately. Explicit expectations identify missing scanned fixtures.

## Test inventory

- `2x2 at block edge clipped`: synthetic identity mapping and 4x4 block; R10 clipping and immutable input.
- `past sheet end skipped`: synthetic short sheet; R10 sheet limit.
- `row edge not wrapped`: synthetic index 15; R10 source row boundary.
- `unmapped source skipped`: synthetic null mapping; R10.
- `1x1 replaces only the selected square`: synthetic block; R10.
- `4x4 across $5F/$80 continues at $80`: Forest sheet and mapping; R10–R11 bank transition.
- `gbcSheetToTileId chooses the lowest id for duplicate mappings`: Forest tiles with synthetic duplicate bank entries; R11.
- `gbcSheetToTileId maps banks and rejects past sheet`: Forest sheet; R11.
- `OK edits only block N's 16 bytes and collision record N`: Forest block 1 and raw files; R1/R2, replacement isolation, file sorting and `before`.
- `saveAsNew on forest replaces surplus record 40`: Forest, verifies 40 blocks and 64 collision records; R7.
- `saveAsNew from palette has no placement`: scanned unshared Forest map; R7/R8.
- `saveAsNew from map places on the clicked cell`: scanned unshared Forest map; R7.
- `saveAsNew on a shared grid refuses SHARED_GRID naming both maps`: named Port Passage maps and verified common path; R6.
- `cap refuses BLOCK_CAP naming the file`: Forest with staged 256-block binary; R6.
- `All rewrites one tilepal name`: first mapped tile in Forest block 1, palette text scan; R5.
- `Local copies to the lowest free non-reserved slot and repoints only this block's squares that used the tile`: scanned Local fixture; R1/R5/Q11.
- `Local reuses an identical non-reserved copy`: scanned Local fixture with copy and palette staged at lowest free slot; R1/R5 reuse.
- `identical copy in a reserved slot is not reused`: scanned Local fixture and reserved sheet tile, staged matching pixels/name; R5 reservations/reuse.
- `Local on reserved source refuses RESERVED_TILE`: scanned Local fixture and reserved sheet tile; R5.
- `Local with no free slot refuses NO_FREE_TILE naming the sheet`: scanned Local fixture with staged metatiles covering all sheet tile ids; R5.
- `Local on Cave metatiles refuses LOCAL_SHEET_MISMATCH naming TilesetCave and TilesetDarkCave`: named tilesets, verified shared meta/different sheets; R5.
- `palette-map-only mismatch also refuses`: thin wrapper over real project adds synthetic map/tileset alias sharing metatiles and sheet but using another existing palette-map path; R5.
- `free-slot scan counts blocks of every metatiles file loaded with the sheet, staged ones included`: scanned Local fixture and map-used sheet alias; if absent, a thin project wrapper creates an alias on another existing metatiles path and stages a copy of the already-counted source records there. The staged second file claims the first free tile; R1/R5.
- `reservations unreadable: Local refuses RESERVATIONS_UNREADABLE, All still plans`: local fixture in temp subject copy with animation source removed; R5.
- `All + saveAsNew refuses ALL_WITH_SAVE_AS_NEW`: scanned Local source with scope changed to All; R6.
- `mixed draft`: scanned Local source at square 5 plus different mapped tile at square 0; independently constructed metatile, pixel and palette expectations; R5.
- `painted cell targets its staged block`: verified Port Passage shared path and two conflicting staged grids; R3 alphabetical winner.
- `raw block 0 cell targets the border block`: scans raw map grids for a nonzero cell, stages zero there, and checks an outside cell; R3.
- `staged bytes compose (two plans in a row)`: Forest blocks 1 and 2 with first plan edits staged into second; R1.
- `revision`: Forest effective files/grid, independently hashes sorted path/length/bytes and ids; alters one file, one id and unrelated overlay entry; R9.
- `BAD_VALUE draft validation`: Forest block with seven malformed drafts; R4.
- `invalid targets and missing save placement refuse BAD_VALUE`: Forest effective count and missing cell; R2.
- `palette no-op and conflicting entries`: scanned Local tile's current palette, same-source duplicate scope/name combinations; R5/R6.
- `unchanged garbage tile is retained`: staged Forest block's $60 byte and changed valid neighbor; R4.
- `same block staged bytes are the draft baseline`: staged Forest block and edited another square; R1.
- `effective palette and collision ignore divergent project overlay`: staged disk bytes with a different project overlay for both files; R1.
- `shared-grid winner controls confirmation and revision per map`: two synthetic maps over a real Forest grid, conflicting staged grids; R3/R8/R9.
- `refusal precedence follows validation, All, shared grid, cap, local`: staged capped binaries and shared/unshared maps; R6.
- `confirm is false when the draft changes nothing`: Forest unchanged draft; R8.
- `confirm true when another map draws the block in its interior`: scans unshared maps with same metatiles and stages their grids; R8.
- `confirm true when another map only uses it as its border`: scans same-file maps and stages all grids away from other map's border id; R8.
- `confirm false for same-map-only uses`: scans same-file maps and block absent from all borders, stages it only on request map; R8.
- `confirm true for an All edit when another map draws a different block using the tile`: scans two block records sharing a palette-mapped tile and stages the second map to draw the other block; R8.

## Verification and limitations

`npm.cmd run typecheck` passed. Vitest and mutation checks were not run, as explicitly directed. Thus fixture availability and behavior against an implementation remain unverified. Not every invalid draft combination, Local allocation sequence, or effective-file combination is exhaustively covered. Usage is independently counted from raw grid bytes, map metadata, and tile-file associations in both modes. The mixed fixture explicitly scans for the required distinct mapped square-0 and square-5 tiles and fails if unavailable. Corpus named files are loaded only via the configured scratch-copy helper, except the unreadable-reservation test's own temporary copy.

## Independent review findings and disposition

Two independent native reviewers were routed by the conductor: gpt-6-astra for specification and gpt-6.1-terra for oracle quality; an Opus model was unavailable. Their review identified: (1) synthetic aliases lacked matching `map()` overrides, now added; (2) the staged second-sheet file erased old references, now appended to and effective candidates rescanned; (3) the first free slot might already have the desired palette, now excluded during fixture selection; (4) refusal message prefixes, names, and tile hex case needed stricter checks, now checked with case-insensitive hex; (5) the 4x4 mapping sheet guard was too low, now checks the last source index; (6) R6 ordering, no-op/conflicts, unchanged garbage and staged same-block baseline lacked tests, now covered; (7) raw-zero resolution now uses staged grids and a synthetic shared-grid case tests confirmation/revision; (8) Local expected bytes now start from independently read bytes, changed paths are checked, map placement uses a different staged cell block, and negative/out-of-map inputs are checked. Usage now uses an independent byte-counting oracle rather than the production usage function. The explicit prohibition on Vitest still leaves fixture availability and mutation behavior unverified.

Final targeted review corrections: shared-grid revision uses the test-owned SHA-1 oracle; refusal assertions check ordered names without requiring a particular punctuation format; usage counts zero cells once from the representative grid; the raw-zero test overrides a nonzero disk cell; the synthetic sheet-alias fallback retains the known source references and a known remaining free slot. `npm.cmd run typecheck` passed after these corrections.

Final review: the specification reviewer approved the targeted corrections. The oracle reviewer found that a shared-grid message may name the request map once in its prefix; the ordered-name scan must include that prefix. The orchestrator made the one-line `SHARED_GRID` search-offset correction inline because another implementation brief would exceed this tiny edit's cost. Cave name ordering continues to start after its file prefix. The report was normalized to UTF-8. No Vitest or mutation checks were run.
