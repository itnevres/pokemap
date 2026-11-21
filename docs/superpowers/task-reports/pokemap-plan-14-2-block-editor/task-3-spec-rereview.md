Needs changes

Both prior findings are resolved: identical tiles preserve the original PNG bytes, and compound `ROOF_LENGTH` definitions are rejected with the required filename.

- **Important — `packages/core/src/blockEdit/gbcSheet.ts:123`:** The new animation regex truncates operands at whitespace. For `dw vTiles2 tile $14 + 1`, it reserves `$14`, leaving the actual destination `$15` allocatable. Previously, the complete expression reached `parseNum` and was rejected. Validate the complete operand; either evaluate it correctly or throw `RESERVATIONS_UNREADABLE` naming the animation file. Add regression coverage.

No files edited or tests run.