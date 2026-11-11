Needs changes

- **Important — `packages/core/src/blockEdit/gbcSheet.ts:83,92`:** Copying between distinct slots with identical pixels still re-encodes IDAT. A source PNG using different compression or multiple IDAT chunks therefore changes bytes despite no pixel change, violating the no-op losslessness requirement. The test covers only equal indices. Compare tile pixels before encoding and test identical tiles in differently encoded input.

- **Important — `packages/core/src/blockEdit/gbcSheet.ts:153`:** `findDefEqu` consumes only the first whitespace-delimited value. For `DEF ROOF_LENGTH EQU 9 + 1`, this reserves nine tiles instead of ten, leaving the last runtime roof tile available for allocation. Validate the complete definition and either evaluate it correctly or throw `RESERVATIONS_UNREADABLE` naming the constants file; add regression coverage.

No files edited or tests run.