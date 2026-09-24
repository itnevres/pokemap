# Plan 6 Task 9 spec re-check: fix round 1 (commit 623ee41)

## What was checked

- **Commit:** `623ee41` on top of `494380f`, in worktree `/home/user/pokemap/.claude/worktrees/agent-a5471bd90c343f9d4`.
- **Scope:** only the 4 issues and 8 minors from `task-9-spec-review.md`, plus any new defect introduced by this round.
- **Inputs:** `git show 623ee41` and the "## Fix round 1" section of `task-9-implementer.md`.
- **Subject repo:** `/home/user/pokecrystal-PerfPlus`, read-only. `git status --porcelain` shows it is still untouched.

## Verdict: ❌ ISSUES (1)

All 4 original blocking issues are fixed, and every minor the round claims to fix is fixed. Of the 11 mutations aimed at the round's new guards (listed below), 3 survive:
- N4 is equivalent, so it is not counted.
- N6 and N7 are real survivors. They show that the new `roofPngPathFor` strictness is untested. That refusal also doesn't name `file:line`, which the spec requires for INCBIN-shape refusals.

## Gates

| Gate | Result |
|---|---|
| `npx vitest run packages/core/test/gbc` | **13 files, 370 tests, all passed, 0 skipped** |
| `npm run typecheck` | clean |
| Worktree after mutations | `git diff` shows only the local `pokemap.config.json` |

## Original issues

| # | Issue | Status | Evidence |
|---|---|---|---|
| 1 | Ring exclusion for `unmappedTileCount` was untested (R2) | ✅ fixed | New test in `map.test.ts` ("excludes the border ring…"). The border metatile has 5 unmapped slots. With `border: 1` the count is 0; placed as an interior block it counts 5. **R2 is now killed.** |
| 2 | Bank-1 handling and the null palMap entry were untested (R8, R8b) | ✅ fixed | New `renderGbcMetatile` test places tile `0x85` (`bank: 1`, PNG index `0x65`, shade 2, pal 1) next to tile `0x05` (bank 0). A decoy tile sits at raw index `0x85`. The unmapped test now places an explicit `null` at tile id 2. **R8 and R8b are now killed.** |
| 3 | `GbcProject` caching was untested (R10–R12) | ✅ fixed | New `packages/core/test/gbc/project.test.ts` has corpus identity assertions for `tileset` (two consts, plus "different consts give different objects"), `paletteTables` and `roofs`. **R10, R11 and R12 are now killed.** |
| 4 | Tile-animation doc comment was missing | ✅ fixed | `renderGbcMap`'s doc comment now says animated tiles (`\1Anim`, `tileset_anims.asm`) render as their static PNG frame. |

## Minors

| # | Minor | Status |
|---|---|---|
| m1 | Needless `null as unknown as` cast | ✅ Removed. A literal `null` is used directly. |
| m2 | Defect `file` fields not pinned | ✅ The corpus test now pins `{name, files}` for both CeruleanCave maps. |
| m3 | `file:line` not asserted in refusal tests | ✅ Tests now assert `roofs.asm:13:`, `:45:` and `:47:`. I checked these against the real file's numbering and they are correct. |
| m4 | "WAIT" note and duplicate assertion in the ElmsLab test | ✅ Both tidied. |
| m5 | Table counts not validated | ✅ Two new checks: `parseRoofsAsm` requires the `Roofs:` count to equal the number of `ROOF_*` consts, and `loadGbcRoofs` requires the `MapGroupRoofs` length to equal the `newgroup` count + 1. The real corpus gives 27 = 26 + 1 (pinned) and 5 roofs. |
| m6 | `blocksOverride` drops layout defects | ✅ Documented on both fields. No behaviour change. |
| m7 | `pngPathFor` had been loosened | ✅ Restored to accept `.2bpp.lz` only, with a unit test. `roofs.ts` now has its own `.2bpp`-only `roofPngPathFor`. |

## Mutations

Each mutation was run with `scratchpad/mut2.py` against the full `packages/core/test/gbc` suite. Every file was restored after each run.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| R2 | `unmappedTileCount` counts ring blocks | killed (1) | new ring-exclusion test |
| R8 | `tiles[tileId & 0x7f]` (bank ignored) | killed (1) | new bank-1 test |
| R8b | `tiles[tileId] ?? tiles[idx]` | killed (1) | new bank-1 test (decoy tile) |
| R10 | `tileset()` cache off | killed (1) | `project.test.ts` |
| R11 | `paletteTables()` cache off | killed (1) | `project.test.ts` |
| R12 | `roofs()` cache off | killed (1) | `project.test.ts` |
| N1 | `Roofs:`-count vs `ROOF_*`-count check removed | killed (1) | count-mismatch unit test |
| N9 | That count check weakened to `< size - 1` | killed (1) | count-mismatch unit test |
| N2 | `MapGroupRoofs` vs `newgroup + 1` check removed | killed (1) | newgroup-mismatch unit test |
| N3 | `newgroup` check without the `+1` | killed (9) | corpus and fixture `loadGbcRoofs` tests |
| N5 | `countNewgroups` counts any line containing "newgroup" | killed (7) | corpus: the `MACRO newgroup` line and the comment line inflate the count |
| N4 | `countNewgroups` without `stripMacroDefs` | survives, but **equivalent** | `matchCall` needs `^\s*newgroup\s`, so `MACRO newgroup` never matches, and the macro body has no `newgroup` call. No real or fixture input can tell the difference, so this is not counted. |
| N8 | `pngPathFor` loosened back to `.2bpp(.lz)?` | killed (1) | new `pngPathFor` unit test |
| **N6** | **`roofPngPathFor` also accepts `.2bpp.lz`** | **SURVIVES** | none |
| **N7** | **`roofPngPathFor` accepts any path (optional `.2bpp`)** | **SURVIVES** | none |

## Issue (❌ blocking)

1. **The new `roofPngPathFor` refusal is untested and doesn't name `file:line`** (`roofs.ts:16-20`, called at `roofs.ts:132`).
   - **Untested.** N6 (accept `.2bpp.lz`) and N7 (accept anything) both leave the suite green. Under N6, `INCBIN "…/violet.2bpp.lz"` would silently resolve to `violet.png`, which exists, so an INCBIN shape the parser doesn't understand gets through.
   - **No `file:line`.** Task-9 spec deliverable 2 says `parseRoofsAsm` "refuses (throws, naming file:line) … any table_width/INCBIN shape it doesn't understand". The real refusal is `Error: roofPngPathFor: GFX path "gfx/tilesets/roofs/violet.2bpp.lz" doesn't end in ".2bpp"`, which names neither `data/maps/roofs.asm` nor the line. I probed this directly against the real file text.
   - **Pre-existing.** The original `pngPathFor` path had the same `file:line` gap; I missed it in review 1. This round made that path a dedicated guard.
   - **Fix, part 1:** in the `roofsIncbin` phase, route the resolver failure through `fail(lineIndex, …)`. Either catch the error, or test `/\.2bpp$/` inline before calling `roofPngPathFor`.
   - **Fix, part 2:** add a `parseRoofsAsm` unit test where `INCBIN "gfx/tilesets/roofs/violet.2bpp.lz"` (and optionally `violet.bin`) throws `/data\/maps\/roofs\.asm:47:/`. That kills N6 and N7.

## Minor (non-blocking)

- The new refusals for `Roofs:` count and `newgroup` count name the file but not a line. Neither is in the spec's list of refusals that must name `file:line`, so this is acceptable.
- `countNewgroups` is a second `newgroup` counter alongside `map.ts`'s `parseMapConstants`. Its doc comment justifies this, and it is harmless.
