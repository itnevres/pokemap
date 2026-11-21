Approved

# Plan 14.2 Task 3: spec re-review 2 (scoped to the animation-operand finding)

Range: 7a1edf7..d3f731a, in worktree wt-t3. Read-only. I did not run any tests.

## Prior finding: resolved
- packages/core/src/blockEdit/gbcSheet.ts:123: the animation pattern now captures `([^,]+)`, which runs to the next comma or the end of the line, so it gets the whole operand. Line 127 then passes the trimmed capture to `parseNum`.
- `parseNum` accepts only the whole string `^\$hex$` or `^-?\d+$` (packages/core/src/gbc/load/asm.ts:155-159). So `$14 + 1` and `$20 + 1` now throw instead of being cut down to `$14`. The catch at gbcSheet.ts:130-131 turns that into a BlockEditRefusal with code `RESERVATIONS_UNREADABLE` and the message `engine/tilesets/tileset_anims.asm: parseNum: ...`. That names the animation file (ANIMS, gbcSheet.ts:10), as the spec requires.
- Order of steps: `stripComment` runs before matching (line 118), so a trailing `; comment` cannot get into the capture.
- The regression test at packages/core/test/blockEdit/gbcSheet.test.ts:139-143 covers both the `dw` form and the `ld hl,` form. It checks the code and the file name. The conductor reports that reverting the regex to `[^,\s]+` makes this test fail (M9 KILLED), and I would expect that: with the old regex, `$20` parses and no error is thrown.

## No new spec defect
- PerfPlus corpus: I checked C:/Programming Projects/pokecrystal-PerfPlus/engine/tilesets/tileset_anims.asm by hand. It has 53 `vTiles[25] tile` operands, and every one is a plain `$XX` followed by a comma or the end of the line. No `vTiles` mention takes another form. So the wider capture rejects no real PerfPlus line, which agrees with the conductor's 15/15 corpus result.
- Several operands on one line still split correctly, because the capture stops at each comma.
- The roof path (line 123, the roof branch) is unchanged.

## Minor (not blocking, no action needed)
- gbcSheet.ts:123: a hypothetical bracketed operand such as `ld a, [vTiles2 tile $20]` would capture `$20]` and be refused. This only happens if a fork adds such a line, and refusing it is the conservative choice the spec asks for. PerfPlus has no such line.
