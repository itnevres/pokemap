# Plan 14.2 Task 3 implementer report

Status: BLOCKED (implementation and tests written; execution-policy restrictions prevent verification).

## Scope and task ledger

- Baseline HEAD: `924ff1b3c186faa96c0483f2a76c5fe3f43755a2`.
- Initial working tree: clean; git emitted permission warnings for the global ignore file, but status completed.
- Risk tier: High, because PNG serialization and assembly/file error boundaries require byte-level correctness.
- Read the delegate skill before the source read/implementation. Route: direct Codex implementation under the explicit implementer brief's no-subagents/no-reviews instruction. No offload calls, helper attempts, reviews, or commits.
- Read and applied TDD and Ponytail instructions within the user brief's sandbox exception. Tests were written before production code; the attempted red run was blocked before Vitest started. Neither a behavioral red nor green result is claimed.
- Acceptance: lossless decoded pixels outside the destination slot; original non-IDAT chunks preserved verbatim; grayscale depth-2 encoding with inverted samples; runtime destination extraction and file-specific refusals.

## Files changed

1. `packages/core/src/blockEdit/gbcSheet.ts` (new).
   - Implements `encodeGrayPng`, `copySheetTile`, `parseGbcReservedTiles`, and `loadGbcReservedTiles` with the requested signatures.
   - Uses `deflateSync` and `crc32`, filter-zero packed rows, IHDR/IDAT/IEND, grayscale sample `3 - shade`.
   - Reuses `readShadesPng` rather than duplicating decoding. Validates signature, chunk bounds/CRCs, first/unique IHDR, IEND, source format, 16-tile sheet width, complete rows and tile bounds. Replaces only IDAT chunks; retains every other source chunk byte-for-byte.
   - Reuses `codeLines`, `stripComment`, `parseNum`, `findDefEqu`, and the existing `BlockEditRefusal`. Roof destinations come from live `ld de` lines; animation destinations come from live `dw` lines. vTiles5 adds 0x80. Reads ROOF_LENGTH from `constants/tileset_constants.asm`.
2. `packages/core/test/blockEdit/gbcSheet.test.ts` (new, 11 cases).
   - Every PerfPlus tileset PNG round-trips through the existing decoder; width/height and output header checked.
   - Partial packed-byte widths and chunk CRCs checked.
   - All pixels in all 48 synthetic tiles compared after copying tile 15 to tile 33 (crosses both sheet row and column); source input remains unchanged, and a visible change is required.
   - No-op buffer identity, ancillary chunks on both sides of IDAT, valid RGBA refusal, misplaced IHDR, truncation, and invalid tile indices checked.
   - Synthetic roof/bank expectations, comments, missing live destinations, actual PerfPlus roof range/$14/not-$00, missing input files, and missing ROOF_LENGTH checked.
3. This report (new).

No support files, existing tests, shared fixtures, launch files, or real subject files changed. All test filesystem writes are under a fresh `os.tmpdir()` root; corpus reads use `GBC_SUBJECT_ROOT` from the scratch-root helper.

## Commands and evidence

1. After writing the test file, before production code:

   `npx vitest run packages/core/test/blockEdit/gbcSheet.test.ts`

   Exit 1, before test execution:

   ```text
   npx : File C:\Program Files\nodejs\npx.ps1 cannot be loaded because running scripts is disabled on this system.
   CategoryInfo          : SecurityError: (:) [], PSSecurityException
   FullyQualifiedErrorId : UnauthorizedAccess
   ```

   No tests collected or run. Did not bypass the execution policy.

2. After implementation:

   `npm run typecheck`

   Exit 1, before TypeScript execution:

   ```text
   npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
   CategoryInfo          : SecurityError: (:) [], PSSecurityException
   FullyQualifiedErrorId : UnauthorizedAccess
   ```

3. `file packages/core/src/blockEdit/gbcSheet.ts packages/core/test/blockEdit/gbcSheet.test.ts packages/core/src/gbc/load/png.ts`

   ```text
   packages/core/src/blockEdit/gbcSheet.ts:       JavaScript source, ASCII text
   packages/core/test/blockEdit/gbcSheet.test.ts: JavaScript source, ASCII text
   packages/core/src/gbc/load/png.ts:             JavaScript source, ASCII text, with CRLF line terminators
   ```

   New files use LF; existing CRLF sources were not edited. No non-ASCII bytes changed.

4. `git diff --check`: exit 0, no whitespace errors (new files remain untracked, so this command does not validate their contents).
5. `git status --short`: only the two new Task 3 TypeScript files before this report was added; global-ignore permission warnings persisted.

## Mutation targets for conductor

No mutations executed here; all remain pending green verification.

- Remove shade inversion: `encode round-trip for every PerfPlus tileset PNG` compares every decoded shade, and `encodes partial packed bytes and valid chunk CRCs` independently supplies all four shade values.
- Change sheet row stride/index arithmetic: `copy changes only the target tile (all tiles compared)` checks every pixel against source coordinates using 128 pixels per row, 16 tiles per row, and 8 pixels per tile.
- Remove vTiles5 offset: `parses roof range and both VRAM banks (including synthetic $83)` requires 0x83 from $03 + 0x80. Its roof range is independently 0x0a through 0x12 inclusive (nine entries).

## Concerns and required follow-up

- Focused Vitest, typecheck, mutations, full gate/file count, UI build, and subject HEAD/porcelain/manifest checks have not passed here. The conductor must run these before acceptance. No UI was changed.
- The requested original-header equality has one documented corpus exception: `port.png` is RGBA depth 8, while `encodeGrayPng` must always emit grayscale depth 2. The corpus test checks exact decoded shades and dimensions for every PNG, source depth/type equality for grayscale PNGs, and the mandated output header for every PNG. RGBA copying is separately refused using a valid synthetic RGBA PNG with correct CRCs.
- No commits created, as required for a Codex implementer. All changes remain available in this scratch worktree for conductor verification and commit.

## Conductor verification (s3, 2026-11-10)

- Inline fix: `const output: Buffer[]` in `copySheetTile` (typecheck TS2345 `Buffer<ArrayBufferLike>`).
- `npm run typecheck`: pass. `npx vitest run gbcSheet.test.ts gbcPatch.test.ts`: 2 files, 30 passed (gbcSheet 11).
- Mutations (one vitest run each on gbcSheet.test.ts): M1 gray not inverted → KILLED (encode round-trip; partial
  packed bytes); M2 copy target row stride off by one → KILLED (copy changes only the target tile); M3 vTiles5 not
  offset → KILLED (synthetic $83); M4 ancillary chunks dropped → KILLED (preserves every non-IDAT chunk).
- Deviation: the round-trip test compares depth/colour type only for grayscale originals (an RGBA sheet is normalized
  to 2-bit gray); width/height always compared.
