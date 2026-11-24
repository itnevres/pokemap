# Plan H F1e: the UI shows the broken-path defect (Medium tier)

Branch `claude/plan-h-f1e` from master `0eb1340`. Tier Medium: UI only, a wrong answer fails a test (plan row F1e). Route per `delegate`: Sonnet-tier implementation through `chain.py --tier sonnet --no-codex` (Codex parked until Nov 25): deepseek-v4.1-flash-free hit its free cap, `openrouter/baidu/ernie-5.5-flash-preview:free` implemented it (commit 5890b74). Review: one combined spec and quality pass, Claude Sonnet (`quality-reviewer`; OpenCode pool was capped), APPROVED, `task-F1e-review.md`. Orchestrator added two hook tests for the review's minor 4 (invalid defect body; selection to null) inline (tiny, 2 cases).

## What changed
- `hooks/useMapLayout.ts`: `BrokenPathError`, `brokenPathToDefect`, `brokenPath` in the result. `fetchLayout` parses a 409 `{code:"broken-path", defect}` body into the typed error; any other failure keeps `GET /api/map/<name> -> <status>`. Cleared at load start, on success and on a null name.
- `shell/adapter.ts`: optional `FamilyRuntime.map.defects`. `gba/adapter.tsx` fills it. GBC untouched.
- `shell/FamilyApp.tsx`: canvas and warp popup show `DefectsBanner` plus "<map> cannot be opened until this is fixed." instead of "Could not load ...".
- Tests: `useMapLayout.test.ts` (+6 hook cases, 2 helper cases), new `BrokenPathBanner.test.tsx` (real `FamilyApp` + `gbaAdapter`, 409 shows message, file:line, fix, alert, no bare `GET /api/map` text; plain 500 keeps "Could not load").

## Live check (real UI, servers from this worktree, scratch copy of the subject with VioletCity's `blockdata_filepath` set to `../../outside.bin`; real subject untouched)
Vite served the changed `useMapLayout.ts` and `FamilyApp.tsx` (grep found `BrokenPathError` and `BrokenPathPlaceholder`). `/api/map/VioletCity` answered 409 broken-path. Selecting VioletCity in the tree showed the red alert "Build error layout LAYOUT_VIOLET_CITY: blockdata_filepath "../../outside.bin" leaves the project. data/layouts/layouts.json Change blockdata_filepath ... to a path inside the project." and "VioletCity cannot be opened until this is fixed." Selecting CherrygroveCity then opened the normal editor with no banner. Servers stopped.

## Review minors left
Warp-popup branch has no test of its own (shares `BrokenPathPlaceholder` with the canvas branch). `line` is not type-checked in the body guard (server-controlled). `reload()` failing on a now-broken map reports the defect message instead of the HTTP status (within spec).

## Gate
Gate at `2dd85bb` (master `0eb1340`, nothing newer on origin/master; one lock run): 5605 pass / 1 fail / 302 files (301 passed); typecheck pass, UI build pass; subjects unchanged (git status of both subject roots identical before and after). The 1 fail is the known `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" env fail (RESUME and LESSONS list it). A "Timeout terminating forks worker" line for `ui/test/shell/adapter.test.ts` was logged at teardown; that file passed. The two touched test files also passed alone first: 2 files, 25 tests.
Re-verify after merging origin/master `1d07455` (RESUME conflict only, kept both sides): 4 files / 66 tests pass (useMapLayout, BrokenPathBanner, App, shell/adapter), typecheck pass, UI build pass, through the lock.
