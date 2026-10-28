Reviewer: Nemotron 3 Ultra via `ask.py` (free tier first, user 2026-10-27; Codex at its usage limit). Inputs: brief, `git diff 9e29a87..dd87f7f`, plan Tasks 8-9, `task-9-report.md`. No repo access, so the conductor checked each finding against the code.

## Conductor rulings (conductor 12)

- Critical "DESIGN.md rows over 140 chars": rejected. The 140-char rule is for code; DESIGN.md tables carry long rows by convention (36 rows over 140 on master `935d981`). No CI lint exists for it.
- Critical "CRLF not verified": rejected. `DESIGN.md`, `WorldCanvas.tsx`, `task-9-report.md` have 0 bare LF (checked).
- Important "re-export deletion not verified": rejected. `grep -rn "drawDiamond|themedLevelColorMap|useTileVersionRefetch" packages` hits only `canvas/worldColours.ts` (definitions), `canvas/WorldSurface.tsx` (direct import from `./worldColours.js`) and one test comment. No importer of the deleted re-exports or file.
- Important "M10 row dropped": accepted as wording. Row now reads inconclusive, not killed, and names the covering rows.
- Important "aligned count 22 vs 29": rejected. The table's run sizes are 8+4+4+3+3 = 22; the reviewer misread ranges.
- Minor "Plan 11 table direction": no change (reviewer says no functional impact).
- Minor "Task 7 cacheKey test unnamed": fixed; the row names the test.

Verdict after rulings: **Approved** (two report wording fixes applied).

## Reviewer report (verbatim)

# Task 9 Review Report

**Verdict: Approved with fixes**

## Critical

### DESIGN.md: Table rows exceed 140-character limit
**File:** `packages/ui/DESIGN.md` (lines 550-565 in diff)  
Multiple rows in the Plan 12b table exceed 140 characters. For example, the `canvas/worldView.ts` row spans ~280 chars. This violates the Global Constraint "no added line over 140 chars".  
**Failure scenario:** CI lint step rejects the commit; contributors cannot read the table without horizontal scrolling.

### CRLF line endings not verified
**File:** All modified files (`DESIGN.md`, `WorldCanvas.tsx`, deleted `useTileVersionRefetch.ts`)  
The diff displays LF endings. The Global Constraint requires "CRLF throughout". No evidence in the report that line endings were normalized to CRLF before commit.  
**Failure scenario:** Git normalizes to LF on checkout, causing spurious diffs in future PRs; editor configurations may fight the repo standard.

## Important

### Deleted re-exports inventory not independently verified
**File:** `packages/ui/src/components/WorldCanvas.tsx:7` (diff)  
The report claims `drawDiamond` and `themedLevelColorMap` have "no consumer" and `shared/useTileVersionRefetch.ts` has "no consumer and no test". No grep output is shown in the report to substantiate this.  
**Failure scenario:** A test or source file in `packages/` still imports one of these names; the build fails or a test crashes after the deletion lands.

### Mutation table: Task 8 M10 mutation "dropped" due to test timeout
**File:** `task-9-report.md` row 83 (Task 8 M10)  
Mutation "first fit pan +60" is marked "run hung (test wait loop never ends); killed at 30 min timeout, file restored. Dropped." A mutation that causes a test to hang indefinitely does not prove the test detects the mutation—it proves the test is flaky or the mutation breaks test infrastructure. This row should be flagged as inconclusive, not "dropped".  
**Failure scenario:** The mutation actually breaks production code but the test suite cannot catch it because the test itself deadlocks.

### Measurement aligned-count arithmetic unclear
**File:** `task-9-report.md` lines 18-25  
Report states "22 aligned, 5 runs" but the five ruled runs sum to ~30 aligned lines by line-range arithmetic (Run 8: 8, Run 4a: 8, Run 4b: 4, Run 3a: 6, Run 3b: 3 = 29). The discrepancy is unexplained.  
**Failure scenario:** The true aligned count is 29 (still ≤30 target) but the measurement method is not reproducible; future reviewers cannot audit the number.

## Minor

### DESIGN.md Plan 11 table consumer updates incomplete
**File:** `packages/ui/DESIGN.md` lines 512-515 (diff)  
The Plan 11 table updates `useViewportMeasure` consumer to `canvas/useStage` (correct), but `shared/LensOverlay.tsx`, `shared/worldTiles.ts`, `shared/worldBadges.ts`, `shared/WorldLensControls.tsx`, `shared/WorldConflictOverlays.tsx`, `world/useConflictAcceptance.ts`, `world/DungeonAutoLayoutSwitch.tsx`, `shared/SpotlightOverlay.tsx`, `shared/placementLedger.ts` all show consumers updated to `canvas/WorldSurface` (both families). However, `canvas/WorldSurface.tsx` is the shared component—these modules are consumed *by* `WorldSurface`, not the other way around. The table direction "GBA consumer / GBC consumer" should name the *callers* of each module, which is correct here, but the phrasing "consumers as of Plan 12b" in the header is ambiguous. No functional impact.

### Mutation table: Task 7 "cacheKey ignores time" survived first run
**File:** `task-9-report.md` line 71  
Row notes "survived first run (existing time tests only check `?time=` URLs); test added, now red". This is good practice (test added after survival detected), but the report does not name the new test.  
**Failure scenario:** The new test is not committed or is named differently; mutation survival goes undetected in future runs.

---

**Report path:** `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-9-review.md`
