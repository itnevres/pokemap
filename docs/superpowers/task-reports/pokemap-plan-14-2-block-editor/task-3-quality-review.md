Needs changes

- **Important — `packages/core/src/blockEdit/gbcSheet.ts:113`: runtime destinations are omitted from the real subject.** Requiring animation lines to begin with `dw` skips `ld hl, vTiles2 tile $5b` / `$38` and labeled declarations such as `WhirlpoolFrames1: dw vTiles2 tile $32, ...`. These occur in PerfPlus’s animation file. Those slots remain eligible for Local allocation/reuse despite runtime replacement. Scan every live destination expression, including labeled declarations and instruction operands; assert these actual corpus destinations.

- **Important — `packages/core/src/blockEdit/gbcSheet.ts:153`: roof-length expressions silently under-reserve.** The reused `findDefEqu` parses only the first whitespace-delimited token. `DEF ROOF_LENGTH EQU 9 + 1` therefore becomes 9 instead of 10, leaving the final roof slot unprotected without a refusal. Validate the complete expression and refuse unsupported syntax with `RESERVATIONS_UNREADABLE`, or evaluate it correctly.

- **Important — `packages/core/test/blockEdit/gbcSheet.test.ts:35`: the copy fixture cannot detect incorrect source-row selection.** Its pixels repeat every four rows, making corresponding tiles in every tile row identical. The only copy uses source tile 15, already in row zero; replacing production `sourceY` with constant zero would survive. Use distinct tile-row content and copy from a nonzero source row, then verify that mutation is killed.

No files edited or tests run.