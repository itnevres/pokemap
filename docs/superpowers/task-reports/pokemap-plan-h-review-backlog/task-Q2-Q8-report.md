# Plan H Q2 + Q8 report (stream C `h-server`, overnight 2026-11-22)

## Q2: block check refuses a non-owner (High, error boundary)
- Change: `/block/check` answers HTTP 200 + `refusal: { code: "NOT_OWNER", error: "<map>: <text>" }`, `confirm: false`, `usage: null`, `warnings: []` when another map owns the tileset file; checked after the stale-revision check (same order as apply). Header comment of `blockEditRoutes.ts` rewritten (redo routes reacquire ownership; note kept).
- Hops: `gpt-6.2-sol` dead (no diff) → `gpt-6.1-sol` done (`ee5dcb5`); comment fix by hand (`844b6a2`).
- Verify: blockEditRoutes + gbcBlockEditRoutes 91 pass, typecheck clean.
- Mutation M1 (drop the ownership call in the check branch): 2 tests fail. The GET-refusal test pins existing behaviour, so it has no mutation.
- Reviews (Codex `gpt-6-astra`, read-only): spec APPROVE, quality APPROVE, no findings.

## Q8: confirm-list cap + GBC palette fallback (Medium)
- Change: confirm list shows the first 8 maps then `and N more`; GBC GET gains `sheet.tilePalettes` (palette name per tile id, length `palMap.length`); dialog uses one `paletteName(square)` helper (explicit draft entry, then placed tile's sheet palette, then loaded block's) for the select value and the onChange comparison.
- Hops: chain `--tier sonnet`: DeepSeek V4.1 Flash x2, Ernie 5.5 x2, Inkling, Nemotron Ultra x2, Ling, Codex hops all marked failed or parked. Cause found: the Q8 worktree's `node_modules` junctions pointed at `C:\C:\Programming Projects\...`, so vitest ended with an unhandled ENOENT after every test passed ("verify exit 1"). Junctions recreated; DeepSeek's stashed diff (`051fd93`) then verified: typecheck clean, 96/96 in `gbcBlockEditRoutes` + `BlockEditorDialog`.
- Review: self-review of the diff against the brief, plus Nemotron Ultra (OpenCode `--agent plan`) APPROVE (Codex at its usage limit, OpenCode Zen free quota exhausted). No mutation checks (Medium).
- Lesson for later runs: after making a worktree, check `(Get-Item <wt>\node_modules -Force).Target` is a sane path.

## Gate
Gate at `1aaa4ed` (code identical to `7d7e947`): 5,163 pass / 1 fail / 273 files; typecheck pass, UI build pass; subjects unchanged. The one fail is the known `engine.test.ts > parses the subject repo's real porymap.project.cfg` env fail (RESUME lists it).

## Q8 live check (RULES 3b, real app, headless-free browser pane)
Servers started from the #41 branch worktree (served `BlockEditorDialog.tsx` contained `paletteName`/`tilePalettes`); subjects read-only, both clean after (`git status --porcelain` 0 lines).
- **GBA** (Route101, Edit block on a grass metatile, X flip ticked, OK): confirm section lists 8 maps then `and 41 more` (49 maps affected). Cancelled before Apply; nothing written.
- **GBC** (Route38, Edit block, tile `$B7` from the sheet placed into square 2 whose loaded palette was GREEN): Palette select shows BROWN, equal to `sheet.tilePalettes[0xB7]`, not the old GREEN. `GET .../block` carries `sheet.tilePalettes` (224 entries). Dialog closed with Escape; Save/Undo stayed disabled.
- Note: a first OK on GBA with an untouched draft (my form-input tick did not reach React state) went check, `confirm:false`, then apply as a no-op; subject stayed clean and Save stayed disabled.
