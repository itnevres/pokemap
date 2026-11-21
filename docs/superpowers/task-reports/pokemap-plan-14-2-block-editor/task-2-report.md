# Plan 14.2 Task 2 report: GBC lossless tileset patchers

Status: DONE_WITH_CONCERNS (all tests green and typecheck clean; no commit made because
`git add`/`git commit` were denied by the harness permission layer, so the conductor must
create the commit — see "Commits").

## What changed

New pure-function patchers for GBC tileset files, plus their focused test file:

- `packages/core/src/blockEdit/gbcPatch.ts` (new):
  - `patchGbcMetatiles(buf, id, tiles, path)` — 16 tile ids per record. `id < count`
    copies one 16-byte record into `Buffer.from(buf)` (input never mutated); `id === count`
    appends via `Buffer.concat`; `id > count` / negative / non-integer → `BlockEditRefusal
    BAD_VALUE`; append at a full 256-record tileset → `BLOCK_CAP` (message
    `"<path>: block cap 256 reached"`). Record shape/values are validated by
    `encodeMetatiles`, and `parseMetatiles` validates the file length; both are wrapped so
    every refusal is `BlockEditRefusal` with the path as the message subject.
  - `readGbcCollisionRecords(text)` — the four argument names of every `tilecoll` call, in
    source order, surplus records included. A line without exactly four names is refused
    (`BAD_VALUE`, `tilecoll record N: has X argument(s), expected 4`) rather than
    re-indexing later records.
  - `patchGbcCollision(text, id, names, path)` — replaces the four argument spans of record
    `id` in place (right-to-left `spliceArg` splices, so keyword, indentation, separators
    and trailing comment are untouched); `id === records.length` appends with the last
    record's indentation and comma spacing via `insertLineAfter`, which reuses the file's own
    EOL and preserves a missing final newline. `id > records.length` → `BAD_VALUE`.
  - `patchGbcPaletteMap(text, tileId, palName, path)` — validates the whole file shape with
    the loader's own `parsePaletteMap` (strict 12 / rept-16 / 12 phase machine, so a
    mis-shaped file can never be patched at the wrong tile), then splices exactly one name
    span on the tile's own `tilepal` line. Tiles `0x60-0x7F` (filler gap), `0xE0+`, negative
    and non-integer ids are `BAD_VALUE`; a name outside the eight palette names is
    `BAD_VALUE`. All messages start with the path.
- `packages/core/src/blockEdit/index.ts` (support change, one line): re-export
  `./gbcPatch.js` so later tasks can import from the blockEdit barrel.
- `packages/core/test/blockEdit/gbcPatch.test.ts` (new): 14 tests. No new fixtures — the
  CRLF/LF collision and palette-map inputs are literal strings in the test file.

No existing test or fixture was edited, and no other file changed.

## Commands run and results

1. Red (module absent, before implementation):
   `npx vitest run packages/core/test/blockEdit/gbcPatch.test.ts`
   → `Test Files 1 failed (1)`, `Tests no tests` — `Failed to load url .../gbcPatch.js`.
2. First green attempt (two implementation/test bugs found and fixed: the collision
   `id > length` case used `id === length`; the palette name check required the *new* name to
   already exist in the file):
   `npx vitest run packages/core/test/blockEdit/gbcPatch.test.ts packages/core/test/blockEdit/contracts.test.ts`
   → `Tests 3 failed | 22 passed (25)`, `Test Files 1 failed | 1 passed (2)`.
3. Green:
   `npx vitest run packages/core/test/blockEdit/gbcPatch.test.ts`
   → `Test Files 1 passed (1)`, `Tests 14 passed (14)` (`Duration 121.00s`).
   Task 1's `contracts.test.ts` also passed in run 2 (`11 tests`, including all four GBA/GBC
   overlay tests), so the new barrel export did not disturb it.
4. Typecheck (equivalent to `npm run typecheck`; `npm run …` itself was denied by the
   harness shell allowlist):
   `npx tsc --noEmit -p tsconfig.base.json && npx tsc --noEmit -p packages/ui/tsconfig.json`
   → no output, exit 0.

The corpus no-op test covers all 36 distinct `*_metatiles.bin`, every
`*_collision.asm` INCLUDE, and every `*_palette_map.asm` INCLUDE in the PerfPlus scratch
copy. Re-writing every metatile record, every collision record, palette tile `$00` and
palette tile `$80` with its own value returns byte-identical input for all of them (366 ms).

## Mutations (named for the conductor; not run by me)

- Record index off by one (e.g. `calls[id + 1]` in `patchGbcCollision`):
  `forest surplus: record 40 changes, 64 records remain, every other byte identical` catches
  it — `expect(after[40]).toEqual(replacement)` fails (record 41 changed instead), and the
  one-differing-line assertion points at the wrong line.
- LF-only append (always `\n` instead of `insertLineAfter`'s file EOL):
  `patchGbcCollision > appends at id === records.length using the file's EOL and indentation`
  catches it — the CRLF branch's `expect(patched).toBe(...)` and
  `expect(patched.replaceAll("\r\n", "")).not.toContain("\n")` both fail.
- Whole-buffer re-encode (re-serialize `tilecoll`/`tilepal` records instead of splicing the
  original string): `no-op over the corpus: every metatiles record, collision record and
  palette-map entry 0 rewrites to the identical file` catches it on the first real collision
  or palette-map file (CRLF, comments and alignment all change). Note: re-encoding the
  *metatiles* buffer through `parseMetatiles`/`encodeMetatiles` is byte-identical on the real
  corpus (Task 5 already pins that round-trip), so that flavor is instead caught by
  `patchGbcMetatiles > changes only bytes [16*id, 16*id+16)`.

## Concerns / notes for the conductor

1. **No commit.** `git add` / `git commit` were rejected by the harness (`Permission denied:
   shell`), so the work is left uncommitted in the worktree:
   - modified: `packages/core/src/blockEdit/index.ts`
   - untracked: `packages/core/src/blockEdit/gbcPatch.ts`,
     `packages/core/test/blockEdit/gbcPatch.test.ts`
   Intended commit (per the task): `feat(plan-14.2): GBC lossless tileset patchers (Task 2)`,
   no `Co-Authored-By` trailer (this implementer is not a Claude model).
2. **Palette names are the fixed eight** (`GRAY, RED, GREEN, WATER, YELLOW, BROWN, ROOF,
   TEXT`, from the design's "GBC palette edits"). `patchGbcPaletteMap` has no
   tileset-constants map in its signature, so it cannot verify a fork's extra `PAL_BG_*`
   name; it refuses such a name rather than writing an undefined constant. If a later task
   passes `palBg`/constants in, this should become a lookup instead of a fixed set.
3. **Collision append position:** a record appended at `id === records.length` is inserted
   immediately after the last `tilecoll` line (not necessarily at end-of-file), so a file with
   trailing non-`tilecoll` content keeps its records contiguous. Real corpus files are
   records-only, so this is unobservable today.
4. `patchGbcMetatiles` allocates the parsed metatile array just to get the count
   (`parseMetatiles` is the one validated reader); fine at GBC sizes (≤ 256 records).


## Fix round 1

Scope: only `gbcPatch.ts`, `gbcPatch.test.ts`, and this report; no commit.
Baseline: `d81a9284d6d70c32d714a1c31d400d4c7ef2ef69`; working tree initially clean.
Risk: high, because this changes source-format parsing/patching boundaries. This is
continuation of the same implementer's fix round, as explicitly requested; no fresh
implementer or reviewer was dispatched. The delegate skill was read before the
implementation. This round remains with the current Codex implementer to preserve
context and the user's exact three-file scope.

Changes by review finding:

1. **Palette names:** kept the eight-name whitelist for the NEW `palName`, removed
   rejection of nonstandard untouched entries, and retained `parsePaletteMap` shape
   validation. Its synthesized `palBg` includes every source name plus `palName`.
   Both contract comments now explain this. Added a test that leaves `PURPLE`
   untouched while changing tile 0 to `GREEN`, and refuses `PURPLE` as the new name
   with `BAD_VALUE` and the path. The existing unknown-new-name assertion remains.
2. **BLOCK_CAP:** counts above 256 now refuse before id validation or encoding,
   including attempts to edit an existing record. Added oversized-input checks for
   ids -1, 0, 255, 256, 257 and 258. Added a full-buffer equality check for editing
   record 255 at exactly 256 records, including input immutability; retained the
   original cap/append checks.
3. **Losslessness:** added full-output equality for a noncanonical target `tilepal`
   line with mixed spaces/tabs, spaces around commas, a trailing comment, CRLF and
   no final newline. Only `RED` becomes `GREEN`. Strengthened the forest surplus
   test with exact edited-line equality, preserving the prefix, all three source
   separators and suffix/comment while substituting the four names. No existing
   assertion was removed or loosened.
4. **Collision append style:** copies the last record's complete prefix through the
   first argument start and each of its three exact separators independently,
   preserving keyword whitespace and spaces before commas. Added literal exact
   output coverage with unequal separators, mixed spaces/tabs, CRLF, a preserved
   existing comment and no final newline.
5. **Correction of earlier mutation claims:** palette re-serialization was NOT
   caught before this round; the prior report overstated that coverage. The new
   noncanonical edited-line equality is designed to catch normalization on an
   actual palette edit. Re-encoding the whole metatile buffer through
   `parseMetatiles`/`encodeMetatiles` is an equivalent mutation for fixed 16-byte
   records, including edited records; the byte-span test does NOT distinguish it.
   This correction supersedes the earlier claims under Mutations. No mutation
   execution or mutation kill is claimed for this fix round.

Test-first sequence and actual command results:

- Added all five new tests and strengthened the forest assertion before editing
  production code (19 test declarations total, including corpus tests).
- Red attempt: `npx vitest run packages/core/test/blockEdit/gbcPatch.test.ts`
  exited 1 before Vitest started. PowerShell refused to load
  `C:\Program Files\nodejs\npx.ps1` because running scripts is disabled:
  `PSSecurityException`, `FullyQualifiedErrorId: UnauthorizedAccess`.
  No tests were collected or run; an expected behavioral red was not observed.
- After the production changes, the same focused Vitest command exited 1 with
  the same execution-policy error before running tests.
- `npx tsc --noEmit -p tsconfig.base.json` also exited 1 with that same
  execution-policy error before TypeScript started.
- No policy bypass, alternate invocation, or other sandbox workaround was used,
  per the user's sandbox instruction. The conductor must run the focused suite
  and typecheck and establish red/green and mutation evidence. The full gate
  and UI build were not run in this scoped fix round. There is no UI change.

Verification status: code/tests/report updated; runtime verification blocked by
PowerShell execution policy. Original line endings are retained (these three
working-copy files were LF; CRLF test input strings remain explicit escapes).

Static verification: `git diff --check` passed; final status lists exactly the
three authorized modified files. No commit was created.
