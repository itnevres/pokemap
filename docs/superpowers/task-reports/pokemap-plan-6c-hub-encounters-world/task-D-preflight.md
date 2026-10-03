# Phase D preflight — 2026-10-01

Branch: `plan-6c-hub-encounters-world`

PokeMap starting state:
- HEAD: `cf62bdfd969188d876daa9b83b8b246766d1b67e`
- Existing untracked files: `.claude/settings.local.json`, `.codex/` (preserve)

GBA subject (`C:\Programming Projects\Pokemon Game\game`):
- HEAD: `718b89f739666056655be65fad703a28a4abeb9d`
- `git status --porcelain`:
  ```
   M data/layouts/NavelRockZygardeChamber/map.bin
   M data/layouts/NavelRock_Fork/map.bin
   M data/layouts/layouts.json
   M data/maps/NavelRock_Fork/map.json
   M data/maps/NavelRock_ZygardeChamber/map.json
   M include/fieldmap.h
  ?? docs/human-tasks-notes.md
  ```
- `.pokemap/world.json` SHA-1: `4983f9725c7e763a2c7f205912bf2ce7428a757f`
- `.pokemap/dungeons.json` SHA-1: `f73f9b76922330a60da53d4913790df956a86846`

PerfPlus (`C:\Programming Projects\pokecrystal-PerfPlus`):
- HEAD: `81ededbe311267c774b5540d8c8b381a314dc6d6`
- `git status --porcelain`: clean
- `.pokemap/`: absent

Baseline results (2026-10-02, output in sibling `baseline-phase-d.log`):
- `npm test`: 1,985 passed / 2 failed (118 files). Failures: `packages/server/test/world.test.ts` > `returns placements, components, conflicts and vertical links` (186 vs 1,209) and `respects the dungeonAutoLayout flag` (186 not greater than 186).
- Both failures reproduced alone in `baseline-world-placements-isolated.log` and `baseline-world-toggle-isolated.log`. Current GBA sidecar reports `dungeonAutoLayout: false`, which explains both 186-placement results.
- `npm run typecheck`: clean (`baseline-typecheck.log`).
- `npx vite build packages/ui`: passes (`baseline-vite-build.log`).
- GBA `.pokemap/world.json` SHA-1 after test suite: `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f`, which differs from recorded start `4983f9725c7e763a2c7f205912bf2ce7428a757f`. `.pokemap/dungeons.json` still matches start. Do not write more to the GBA corpus until the world sidecar's preflight bytes are recovered or user confirms current state.

A read-only `node --import tsx` corpus probe failed before loading project code with `uv_os_get_passwd returned ENOMEM`; PowerShell parsed `maps.asm` independently and confirmed the census above. No Node listeners were active for the baseline run.

Review-model blocker: available subagent models do not include Opus, which Phase D2 requires for its spec review.
