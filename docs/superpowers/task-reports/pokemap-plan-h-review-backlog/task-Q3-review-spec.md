# Q3 spec-compliance review (Plan H, High: hub I/O error boundary)

Range: 80cd94e..2fa289e (2a0dc4b tests, 2fa289e implementation). Read from git objects only; no tests, typecheck, or builds were run (per the brief).

Verdict: **PASS.** No Critical or Important findings. Two Minor findings.

## Spec clauses

| Clause | Status | Evidence |
|---|---|---|
| Shared helper `savedMetatileCount(root, metatilesPath)` in blockEditOwnership.ts, `floor(size/16)` | Met | blockEditOwnership.ts:53-60 |
| Catches only ENOENT/ENOTDIR and throws `BlockEditRefusal("BAD_VALUE", "<path>: metatiles file is missing")`; anything else rethrows | Met | blockEditOwnership.ts:56-58 |
| Short comment on why a missing file is 409 and not 500 | Met | blockEditOwnership.ts:47-52 |
| GBA `guardIds` uses the helper | Met | index.ts:988. The unused `statSync`/`resolve` imports were removed (index.ts:4, :16) |
| GBC `paintApply` uses the helper | Met | gbcEditRoutes.ts:215. Unused imports removed |
| Catch blocks left untouched; 409 body is `{ error: "<map>: <message>", code }` | Met | index.ts paint/apply `.catch` (`send(409, { error: \`${name}: ${e.message}\`, code: e.code })`). GBC run().catch at gbcEditRoutes.ts:530 has the same shape. The final text is `"<map>: <canonical path>: metatiles file is missing"`, which matches the spec's `"<map>: <path>: ..."` |
| The path is canonical and project-relative | Met | GBA: `project.tilesetPaths(...).metatilesBin` is already `canonicalTilesetPath`'d (core project.ts:183) and is wrapped again. GBC: `metatilesPath` is canonical (core gbc/load/tileset.ts:554) and is wrapped again |
| Shift and id-less paint never stat | Met | GBA: the shift branch never calls `guardIds`, and `guardIds` skips a tileset whose `localIds` is empty (`continue`), so a stamp with no metatileId never stats. GBC: shift leaves `ids` empty, and the helper runs only under `if (ids.length > 0)` |
| No session change on refusal | Met | Both routes guard before the `entry.session.blocks = ...` assignment, so the throw skips the write |

## Other statSync / metatiles-size sites (500 hazard)

`git grep statSync` over packages/server/src and packages/core/src at HEAD finds:
- The helper itself.
- hub.ts:165/195/265: directory checks on project open. These are not paint paths and are already guarded by existsSync or their own handling.
- core addEvent/entryPoints.ts:82: wrapped in `inFile`, so not a metatiles path.

No other `size / 16` or saved-count computation exists. The only `refuseUnsavedBlockRefs` callers are the two converted sites. The block-editor routes are explicitly out of scope per the brief and were not changed.

## Tests (non-vacuity)

- **GBA** (paintRoutes.test.ts, Q3 describe): uses a hermetic copy (`copyGbaTilesetProject`). For each of the primary and secondary tilesets:
  - `rmSync`s the real canonical file after `paint/begin`.
  - Asserts status 409, code BAD_VALUE, and that `error` contains the canonical path, for pencil, rect, and bucket.
  - Asserts that GET session blocks equal the begin snapshot after each refusal.
  - Asserts that shift answers 200.
  - Restores the file in `finally`.

  The id choice (1, or split+1) routes each case to the deleted tileset, and the other tileset's file is still present, so each case exercises exactly one stat. If the catch were removed, the route would answer 500 and the status assertion would fail. If the path were dropped from the message, the `toContain` assertion would fail.
- **GBC** (gbcEditRoutes.test.ts "3b"): deletes the real NewBarkTown metatiles file inside the hermetic `tmp`, then makes the same three-tool 409 assertions. It checks shift `dx:0, dy:0` returns 200 and that `paint/end` blocks equal the begin snapshot. It restores the file and discards in `finally`.
- **Unit** (blockEditOwnership.test.ts):
  - Checks `floor` on 48, 50, and 0 bytes.
  - Checks that a missing file gives BAD_VALUE with the path.
  - Checks that a path under a regular file counts as missing.
  - Checks that a NUL-byte path rethrows a non-refusal: `ERR_INVALID_ARG_VALUE` is not ENOENT, so this guards the "other errors rethrow" clause.

## Findings

### Minor 1: the "blocks unchanged" assertions may be vacuous against an apply-then-guard reordering
Locations: paintRoutes.test.ts (Q3 describe, the `toEqual(before)` after each refused tool) and gbcEditRoutes.test.ts 3b (the final `toEqual(before)`).

The refused paints target cell (0,0) with id 1 (GBA primary), id split+1 (GBA secondary), or id 24 (GBC). If the subject map already holds that id at (0,0), the 2x2 rect area, or the bucket region, a mutation that paints first and guards second would still leave the blocks equal. The status assertions would still fail, because the throw comes after the paint, so the mutation is caught overall. The unchanged-session assertion on its own may not be independent evidence, though. I did not verify this against the subject map data, because that data lives outside the repo.

Concrete scenario: Route101 cell (0,0) is already metatile 1. Swap the two lines at index.ts:992-993 so `paintCells` runs before `guardIds`. The pencil case's blocks check still passes.

Fix if wanted: choose a target id that differs from the current cell, for example `before[0]` id + 1 within the saved range, or assert that `before` differs from what an unguarded paint would produce.

### Minor 2: the ENOTDIR branch is not exercised on Windows
Location: blockEditOwnership.test.ts, the test "a path under a regular file (ENOTDIR on POSIX, ENOENT on Windows)".

The test names this itself: on Windows, stat of `file/child` returns ENOENT, so deleting `|| code === "ENOTDIR"` at blockEditOwnership.ts:57 would not fail any test on the dev machine. It would fail on POSIX CI. This is acceptable as documented, and is noted only for the mutation record.

## Out of scope (named, not findings)
- If the metatiles file is already missing before any session or tileset load, `paint/begin` or `sendSession` (via `project.tileset(...)` counts, index.ts:276-278) may fail before the guard is reached. That is a session-open / load-path hazard, not the Q3 paint-guard `statSync`. Q3's spec covers the apply-time stat only. The tests delete the file after `begin`, and their shift-200 assertion confirms that the session reply survives with a warm tileset.
- The block-editor routes, as the brief says.
