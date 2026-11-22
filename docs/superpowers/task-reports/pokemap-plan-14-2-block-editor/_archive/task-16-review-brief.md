# Task 16 final review brief (Plan 14.2 block editor)

Repo `C:\Programming Projects\PokeMap`, branch `plan-14-2-block-editor`. Review the whole branch: `git diff 3f4a762..HEAD`
(master base `3f4a762`). Read-only: do not edit source, do not run vitest (another process may hold the lock), do not
touch the subject repos.

Scope: 303 files / ~27.8k lines, of which non-test source is 66 files / ~3.85k lines
(`git diff --stat 3f4a762..HEAD -- packages ':!**/test/**' ':!**/*.test.*'`). Read all non-test source changes in full.
Sample tests only to judge whether a risky path is covered.

Read for requirements:
1. Spec `docs/superpowers/specs/2026-11-08-pokemap-plan-14-2-block-editor-design.md` (binding).
2. Plan `docs/superpowers/plans/archive/plan-14-2-block-editor.md`, especially "Rulings addendum (2026-11-15)".
3. Ledger rulings: `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/ledger.md` (grep `ruling`, `Ruling`,
   `S1`-`S5`, `D19`). Rulings there override the spec where they conflict.
4. `packages/ui/DESIGN.md` binds UI changes.

Focus (high risk): save/discard ownership of staged tileset files across maps; hub I/O and parsing of decomp/ROM data
(metatiles, attributes, tile sheets, PNGs); undo/redo and async ordering (stale responses, action barriers); GBA vs
GBC parity through the shared shell (one shell + canvas core, add-once features); error boundaries (500 vs 4xx,
messages naming file and map).

Known items (decide nothing; for each, say whether you confirm it, and its severity in your view):
- Task 15 live findings, `task-15-live.md` "Findings": F1 fresh page does not show hub-staged edits as dirty; F2
  duplicate React key 162 in GBA Behavior select; F3 ownership refusal omits requesting map; F4 GBC placement groups
  place run-time reserved tiles; **F5 "Edit block" enabled during a pending undo (`hasPendingSessionMutations` in
  `packages/ui/src/shared/useEditSessionCore.ts` tracks only `/event/create` and `/block/apply`; spec 3e requires every
  action barrier).**
- Deferred from earlier tasks (detail in ledger, grep `Task 16`): Task 6 quality Minor 3; Task 7 spec N1, quality
  N2-N4; Task 8 quality M2/M4/M6; Task 9 quality m3 (`statSync` on missing metatiles file → 500); Task 11a spec m4a,
  quality m2a, m2c; Task 13b long confirm list (cap with "and N more"), GBC palette select shows loaded tile's palette
  after placement (D19); Task 14a focus restore after menu/dialog closes; Task 14b Edit block tool enabled when adapter
  passes no `blockEditorSpec` or session lacks `blockCheck`; GBC toolbar overflow at 720 wide (`scrollWidth` 803).
  Accepted already (do not reopen unless you find harm): Task 11b mutant K12, Task 13a post-unmount assertions, 13b K5b.

Output: write your full report to
`docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-16-final-review.md`:
- Verdict line: APPROVE / APPROVE WITH FIXES / REJECT.
- New findings ranked Critical / Important / Minor, each with `file:line`, a concrete failure scenario (inputs/state →
  wrong result), and a suggested fix in one or two lines.
- A table of the known items above: item, confirmed?, your severity, recommendation (fix now / accept / Plan H).
Return only one status line plus the report path.

Budget: at 120 tool calls stop and write what you have.
