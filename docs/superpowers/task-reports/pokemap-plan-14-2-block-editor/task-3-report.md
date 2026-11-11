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


## Fix round 1

Status: implementation and regression tests written; verification BLOCKED by PowerShell execution policy. No commit created.

### Scope and routing ledger

- Baseline: `f0bb6bd8ffa56ef21fb77303ed28d12578e205da`, branch `p14-2-t3` per brief. Initial status contained only the two untracked task-3 review reports; preserved unchanged.
- High risk: PNG losslessness and assembly parsing/error boundaries. Continued the existing Codex implementer fix round under the explicit user brief, without dispatching a fresh implementer or taking over conductor review work. Read delegate, TDD and verification-before-completion skills. No helpers or offload calls; no Anthropic usage.
- Only `gbcSheet.ts`, its named test file, and this required report were edited. Existing CRLF endings preserved. No shared helpers, asm.ts, launch files, or subject repositories edited. Test writes remain under a fresh temp root.

### Findings addressed

1. Compare all 64 decoded source/target pixels before copying. Identical distinct tiles return the original Buffer before IDAT encoding. Regression constructs a valid grayscale PNG with level-0 compression and two IDAT chunks, then asserts Buffer identity for 0 -> 1.
2. Use `findDefEquLine`, strip comments, require the complete EQU value to match one token, then parse that full token with `parseNum`. `9 + 1` refuses with RESERVATIONS_UNREADABLE naming constants/tileset_constants.asm. Regression also accepts a plain hex literal with a trailing comment.
3. Scan every live animation operand occurrence, including instructions, labels and multiple bank references on one line. Roof start remains restricted to the ld de copy destination, retaining whole roof-operand validation. Synthetic exact-set assertion includes $5b, labeled $2d, a second vTiles5 operand ($83), $38 and a commented $00 exclusion. PerfPlus assertions now require $5b/$38/$2d alongside $14 and the roof range.
4. Sheet tile rows now differ at each tile's first pixel column by their tile-row number (0, 1, 2), so row zero cannot substitute for row one. Parameterized copies 15 -> 33 and 20 -> 33 compare every pixel of all 48 tiles, assert a visible change and assert source bytes unchanged.

### Verification evidence and remaining work

Tests were edited before production code. Attempted:

`npx vitest run packages/core/test/blockEdit/gbcSheet.test.ts --maxWorkers=4 --minWorkers=1`

Exit 1 before collection or execution:

```text
npx : File C:\Program Files\nodejs\npx.ps1 cannot be loaded because running scripts is disabled on this system.
CategoryInfo : SecurityError: (:) [], PSSecurityException
FullyQualifiedErrorId : UnauthorizedAccess
```

Per the explicit sandbox note, did not bypass the policy or commit. No behavioral red/green result is claimed. Typecheck, UI build, full gate (pass/fail/file counts), subject HEAD/porcelain/manifest check and mutations were not run; conductor must execute them. No UI change requires a live check. `git diff --check` passed after code/test edits; final scope status is recorded by the final read-only check.

Mutation assertions for conductor after green:

- Remove identical-pixel early return: split-IDAT/different-compression regression's `toBe(split)` must fail.
- Revert to first-token ROOF_LENGTH parsing: the temp-root `9 + 1` refusal must fail.
- Restrict animations to leading dw or first operand: synthetic exact-set assertion and real PerfPlus $5b/$38/$2d assertions must fail.
- Force sourceY = 0: source-20 all-tiles comparison must fail at target tile 33's first pixel column (expected row-one increment 1; mutant row-zero increment 0).
- Existing gray inversion, target stride, bank offset and ancillary preservation mutations remain required.

No mutations or reviews claimed passed. Preserve existing reviews in place until the conductor's follow-up reviews pass.

## Conductor verification, fix round 1 (s3)

- Typecheck pass. gbcSheet.test.ts 14/14 (unmutated baseline).
- Mutations: M1-M4 (round 0) still KILLED; M5 constant `sourceY` → KILLED (copy from source 20); M6 identical-pixel
  shortcut removed → KILLED (split IDAT bytes preserved); M7 anims `dw`-only → KILLED (PerfPlus corpus + instruction
  operands test); M8 ROOF_LENGTH single-literal check off → KILLED (refusal test).

## Fix round 2 (conductor inline, s3)

- Re-review 1 (spec + quality, same finding): animation operand regex `[^,\s]+` truncated `$20 + 1` to `$20`.
  Fix: capture to the comma and `parseNum` the trimmed whole operand, so expressions refuse with
  `RESERVATIONS_UNREADABLE` (tileset_anims.asm). Regression test for `dw` and `ld hl` forms.
- Typecheck pass; gbcSheet.test.ts 15/15 (PerfPlus corpus still parses). M9 regex back to `[^,\s]+` → KILLED.
