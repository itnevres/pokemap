Needs changes

- **Important — `packages/core/src/blockEdit/gbcSheet.ts:123`: animation expressions now silently truncate at whitespace.** `dw vTiles2 tile $20 + 1, Frame` reserves `$20`, leaving the actual destination `$21` unprotected. Previously, the complete expression reached `parseNum` and was refused. Capture and validate the full operand; evaluate supported expressions or reject them with `RESERVATIONS_UNREADABLE`. Add a regression for this case.

The prior instruction/labeled-destination, roof-length, and source-row findings are resolved. No files edited or tests run; conductor verification evidence reviewed.