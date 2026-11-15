# Task 7 fix round 1, hop A: GBA planner tests only

Tier: high (binary-file oracle work and refusal-boundary parsing). Scope: tests only, in `packages/core/test/blockEdit/gbaOps.test.ts`. The fixture builder `gbaFixture.ts` was not changed: every existing layout, tileset and byte is untouched, and no extra layout or tileset was needed. No source file was changed and no dependency was added.

## What changed

- Added a `segment(message, id, ids)` helper: it returns the warning text from a layout id up to the next layout id, so a source symbol cannot be borrowed from a neighbouring layout.
- Turned the cross-half warning cases into an explicit case table with per-layout expected source pairs and kept the `gbaCrossHalfWarnings`/`planGbaBlockEdit` equality check.
- Reformatted every case this round touched into readable lines; the rest of the file is unchanged except for the additions below.

## Cases added or tightened, and today's result

Expected to fail against the current reviewed implementation (these pin the fix):

1. `saveAsNew from the map refuses a cell outside the layout: 2,0` and `...: 0,2` (G2a): Emerald is 2x2; both cases expect `BAD_VALUE` with a message starting with `Emerald`. Current planner only rejects missing/negative/non-integer cells, so both currently succeed.
2. `append limit names S's metatiles file, layout F and its 20-metatile limit` (G6a): stages 21 S metatiles and 21 attribute words, saves as new from Emerald, expects `SPLIT_LIMIT`, message starts with S's `metatiles.bin`, names `F`, contains `20 metatiles` and `cannot append metatile 21`. Current message starts with the tileset symbol and lacks the limit.
3. `append limit for a primary names A's metatiles file, layout E and its 8-metatile limit` (G6a): same check for A staged with 9 blocks/words from Frlg; expects E and `8 metatiles` / `cannot append metatile 9`.
4. `append limit refuses SPLIT_LIMIT under the tighter split` (tightened, G6a): the old case now also requires the metatiles path prefix and `20 metatiles`. It passed before the tightening; the new expectation fails today.
5. `append limit precedes structural refusal and applies to every primary split` (tightened, G6a): now also requires the A metatiles path prefix and `8 metatiles`. It passed before the tightening; the new expectation fails today.
6. `an unknown map is a BAD_VALUE naming the map` (R1b): expects `BAD_VALUE` starting with `Nope`. `layoutForMap` currently throws a plain `Error`.
7. `a failed border read inside usage is a BAD_VALUE naming the map` (R1b): deletes `data/layouts/O/border.bin`, then plans a save-as-new from the palette on an S block from Emerald; expects `BAD_VALUE` starting with `Emerald`. `gbaBlockUsage` currently lets the native ENOENT escape.
8. `BAD_VALUE: a null draft entry` (G2b): current validation dereferences the null entry before any refusal, so a `TypeError` escapes.
9. `BAD_VALUE: behavior missing` (G2b): an undefined behavior is silently skipped by the patcher today, so the plan succeeds.
10. `BAD_VALUE: one surplus attribute word (ok)` and `(saveAsNew)` (G2b): 5 staged words for 4 metatiles; expects `BAD_VALUE` naming the attributes path with `5 attribute words for 4 metatiles`. Accepted today.
11. `BAD_VALUE: one attribute word short (ok)` and `(saveAsNew)` (G2b): 3 staged words for 4 metatiles; expects `3 attribute words for 4 metatiles`. Accepted today.

Expected to pass today and keep passing (they pin behaviour the fix must preserve):

- `structural check uses every consuming layout: tile 25 from F is invalid in E` (G4): 25 is valid under F's split (25 - 12 = 13 < 16) but invalid under E (25 - 8 = 17 >= 16); refusal starts with `gTileset_A` and names E.
- `structural check uses every consuming layout: palette 5 from X is invalid in E` (G4): valid in X (T has 13 palettes), invalid in E (S has 5).
- `structural check accepts tile 20 from every consuming layout` (G4): E 12/16, F 8/16, H/X 12/16; the plan is accepted and produces an edit (a warning is allowed).
- `saveAsNew from the palette on a shared grid plans a new block without SHARED_GRID` (G2): SharedA plans `newBlockId` 4, no placement, no confirmation, two edits.
- `unchanged S local 0 at the primary/secondary boundary is a valid secondary block (Emerald)` and `(Frlg)` (G1): id 8 / id 12, no edits and usage tileset `gTileset_S`.
- `a failed tileset read is BAD_VALUE naming the path` (R1a): the request/draft is built before the attributes file is deleted, so the failure is the planner's own read; the message starts with the attributes path.
- `confirmation for a secondary-role edit uses each layout's own target id` (G8): S local 1, only Frlg's staged grid draws 13 (its own target), giving `confirm` true; without 13 it is false. A planner that used `local` (1) for every layout would answer true in the second case because every border holds 1.
- `usage for a secondary block counts each layout's map-visible id` (G8): independent masked byte counts for E/9, F/13, O/9 including border bins (0), full `BlockUsage` equality.
- The three cross-half cases now assert, per consuming layout, that its id is followed by the tileset it resolves to before the next layout id (G5): E→S, F→A, H→T, X→T for the two A cases; E→A, F→A, O→B for the S case. They also keep the entry index, kind, dedupe, and direct-API equality checks.
- `shared grid uses the alphabetically first staged map for usage and confirmation` (R3/G8): the original SharedA/SharedB usage assertions remain; two extra plans use local 2 (target 2, which no border contains) where only the R3 winner decides confirmation — SharedA staged wins and confirms false, only SharedB staged wins and confirms true.

All other pre-existing cases are unchanged and must keep passing.

## Verification

`npm run typecheck` could not be executed in this hop: the session's shell tool is denied (`permission.rejected: Permission denied: shell`), for both `npm` and `npm.cmd`. The changes were statically reviewed against `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`) and the vitest 2 `it.each` patterns already used in this file. The conductor must run `npm run typecheck` and the red suite; no typecheck pass is claimed here.

## Notes for the implementation hop

- The G2a/G2b/G6a/R1b failures above are the intended red cases; every passing case in the list must remain green.
- G2b's attribute-count message is pinned verbatim (`N attribute words for M metatiles`, prefixed by the attributes path).
- G6a's message assertions are intentionally format-light: path prefix, layout id as a whole token, `<limit> metatiles`, and `cannot append metatile <count>`.
- Item 12's confirmation pin uses local 2 because every fixture border holds 1; using local 1 would let the border decide confirmation instead of the R3 winner.
