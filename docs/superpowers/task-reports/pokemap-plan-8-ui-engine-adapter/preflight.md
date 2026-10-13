# Plan 8 Task 0: preflight and baseline (2026-10-12)

## Branch and decisions

- `master` @ `3f9f8ce` contains Plan 7 (`dbb1761`, itnevres/pokemap#13) and docs #14.
- Branch `plan-8-ui-engine-adapter` created from `master` in a scratch worktree (`git -c core.longpaths=true worktree add`, then `npm ci`). The main checkout stays on `issues-5-6-warp-popups` (`ef248a3`), and its uncommitted #5/#6 work is untouched.
- **User decision, #5/#6 ordering:** Plan 8 goes first. #5/#6 is rebased onto Plan 8's shared modules afterwards.
- **User decision, checkout:** a scratch worktree, with no WIP commit of #5/#6.

## External state (measured before and after the baseline gate; identical)

| Repo | HEAD | Porcelain | Other |
|---|---|---|---|
| PerfPlus | `81ededbe311267c774b5540d8c8b381a314dc6d6` | 0 lines | no `.pokemap`; `maps/NewBarkTown.blk` `0b7d45d83179cf3c5a2d96a0df3cc48c06118889`, `maps/NewBarkTown.asm` `56f87ef714147ab404442ada7378c5ed4ef1d080` |
| pret pokecrystal | `3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6` | 0 lines | — |
| GBA game | `718b89f739666056655be65fad703a28a4abeb9d` | 8 lines (the user's own; never restore) | `.pokemap/world.json` `9c8ab2a86d8fad7ac534629a138be0a87df30cea`, `dungeons.json` `f73f9b76922330a60da53d4913790df956a86846` |

The 8 GBA porcelain lines: ` M .claude/skills/delegating-work/SKILL.md`, ` M data/layouts/NavelRockZygardeChamber/map.bin`, ` M data/layouts/NavelRock_Fork/map.bin`, ` M data/layouts/layouts.json`, ` M data/maps/NavelRock_Fork/map.json`, ` M data/maps/NavelRock_ZygardeChamber/map.json`, ` M include/fieldmap.h`, `?? docs/human-tasks-notes.md`.

## Baseline gate at `3f9f8ce`

- `npm test` (one run): **2,572 pass / 2 fail**, 150 files, 106.65 s. Expected 2,574 / 0.
  - `WorldCanvasContext.test.tsx` › "exit requests › Escape that closes an open context menu does not also request an exit, whichever listener runs first": `TestingLibraryElementError: Unable to find an accessible element with the role "menu"`.
  - `gbc/GbcAppEditing.test.tsx` › "dirty guard: cancel keeps the map; confirm discards the server session BEFORE switching": `EPERM: operation not permitted, open '…\pokemap-gbc-JfZTKb\maps\ElmsHouse.asm'`, then `expected 5 to be less than -1`.
  - **Both pass in isolation:** `npx vitest run` on the two files gives 44/44.
  - Classified as **load-only flakes**, new to the known list. Treat a recurrence in either test as a flake only after an isolated rerun passes.
- `npm run typecheck`: pass. `npm run build -w @pokemap/ui`: pass.

## Duplication baseline (`wc -l`, identical to the plan's `580c710` table)

| GBA | lines | GBC | lines |
|---|---|---|---|
| `App.tsx` | 394 | `gbc/GbcApp.tsx` | 381 |
| `components/MapCanvas.tsx` | 1041 | `gbc/GbcMapCanvas.tsx` | 882 |
| `components/WorldCanvas.tsx` | 2399 | `gbc/GbcWorldCanvas.tsx` | 1494 |
| `components/MapEditingWorkspace.tsx` + `hooks/useMapEditing.ts` | 158 + 332 | `gbc/GbcMapEditing.tsx` | 204 |
| `hooks/useEditSession.ts` | 347 | `gbc/hooks/useGbcEditSession.ts` | 159 |
| `hooks/useCoverage.ts` | 55 | `gbc/hooks/useGbcCoverage.ts` | 19 |
| `hooks/useDungeons.ts` | 97 | `gbc/hooks/useGbcDungeons.ts` | 53 |
| `hooks/useMapGroups.ts` | 39 | `gbc/hooks/useGbcGroups.ts` | 19 |
| `hooks/useMapLayout.ts` | 78 | `gbc/hooks/useGbcMap.ts` | 39 |
| **Total GBA** | **4940** | **Total GBC** | **3250** |
