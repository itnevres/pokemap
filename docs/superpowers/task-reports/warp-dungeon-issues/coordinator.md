# Warp and dungeon issues #5/#6

User authorized the proposed work on 2026-10-11: verify the existing dungeon grouping/warp lines (#6), then finish editable warp destination popups (#5) using existing map editing workspaces, including save/undo and unsaved-close handling. Both GBA and GBC are in scope. World/dungeon viewport and membership must survive popup entry/exit. No server locking, new dependencies or external corpus writes.

Baseline: `ef248a3` on `plan-7-gbc-editing`. Existing untracked `.codex/` and `.claude/settings.local.json` are preserved. This session permits source edits but Git metadata is read-only. No branch, commit, push or PR is authorized through a permissions workaround.

Implementation uses App-owned selection/edit sessions: opening a warp must pass dirty-switch protection before changing ownership; popup close/Escape must preserve pending and dirty edits; save refreshes affected map pixels and warp endpoints; child dialogs must receive Escape independently. Existing standalone preview callers remain compatible.

Dispatches: `warp_implementer` (`gpt-6.1-sol`, no inherited history) implements popups and regressions. `dungeon_verify` (`gpt-6.1-sol`, no inherited history) maps #6 acceptance to code/tests and investigates any demonstrated gaps. Fix rounds reuse the implementer. Independent reviews will cover spec and quality separately because session ownership and asynchronous completion are involved.

Status: source implementation and independent source reviews complete; final runtime acceptance blocked. External baseline is `external-before.json`. Browser MCP listing was rejected because it requires approval while this session's approval policy is never; live acceptance cannot be claimed without access. The resumed Vitest runner also fails before collecting tests.

## Resumed coordinator work (2026-10-11)

The existing implementer was resumed after the user requested another attempt. No replacement implementer was dispatched. Spec and quality reviewers independently checked the final source and identified the remaining post-save reload failure path: an unsuccessful refresh could release the editor with its pre-save discard seed. The same implementer is adding visible recovery, blocking further edits until Retry succeeds, plus the async dirty-open focus restoration follow-up. Review history remains in the respective reports.

Coordinator-owned issue 6 repair: GBA `/api/world?scope=dungeon` computes indoor placements using a shallow sidecar copy with `dungeonAutoLayout:true`, while returning the original saved sidecar. Ordinary world requests and saved-off precedence over `?dungeons=1` remain unchanged. The isolated world fixture regression saves false, checks the scoped population and an indoor map, and compares the saved-off sidecar bytes in memory before restoring its original fixture bytes in `finally`. The initial targeted command failed before test collection with `EPERM` resolving `node_modules/vitest/dist/spy.js`; this is not an observed behavior RED or a passing regression.

The final gate uses a copied GBA corpus because existing broader server tests write subject files. The earlier scratch copy is being copied into this resumed session's current temporary directory; the runner verifies its task prefix, changes only the local test config temporarily, captures a single serial suite/typecheck/build run, and restores the original config bytes in `finally`. No gate success is claimed yet.

External after measurement: all four recorded hashes match (GBA world/dungeons and PerfPlus NewBarkTown blk/asm), and PerfPlus still has no `.pokemap`. Git HEAD/status reads for all three external repositories now fail with permission denied; final repository-state reconciliation is unavailable, not a match. Raw results are in `external-after.json`. No external writes or Git cleanup were attempted. Current PokeMap HEAD remains `ef248a3`; changes are uncommitted and report files remain active until acceptance is established.

## Frozen source and captured final gate

The same implementer completed saved-refresh failure recovery in both families, asynchronous dirty-open opener restoration, and successful Retry focus restoration. Independent spec and read-only quality rereviews now report SOURCE REVIEW PASS with no open findings. Those reports explicitly do not certify the unexecuted final regressions. Clean implementer/verifier/reviewer records are moved intact into `_archive/`; this coordinator report and gate evidence remain active because runtime acceptance is pending.

Final single serial captured gate on frozen source:

- `npm test`: exit 1, no test files collected and no tests executed; 152 unhandled `EPERM: operation not permitted, realpath ...node_modules/vitest/dist/spy.js` errors. Capture: `full-suite.log`. These are collection/runtime permission errors, not 152 assertion failures. Historical focused passes are not substitutes for this failed gate.
- `npm run typecheck`: exit 0, both root/server/core and UI TypeScript checks pass. Capture: `typecheck.log`.
- `npm run build --workspace @pokemap/ui`: exit 0, 74 modules transformed, build completed in 1.70 seconds. Capture: `build.log`.
- All three captures are nonempty. `gate-results.json` confirms original `pokemap.config.json` was restored byte-identically in `finally`.

The scratch GBA corpus path and its source copy are recorded in `scratch-gba.json`. Each shell in the resumed environment receives a different sandbox temp directory; the runner therefore verifies the recorded directory has the task prefix and a Temp parent, rather than requiring it to equal a later shell's new temp path. It writes no real corpus files. No permission bypass, Git checkout/restore/stash/clean, branch/commit, push, PR, or issue closure was attempted.

## Remaining acceptance work

Run the focused regressions and one captured full suite in an environment that can resolve Vitest's installed files. Rerun live World/Dungeon warp destination editing, including save/undo/dirty/pending behavior and byte-identical reverse UI edits, when browser access and protected scratch/real-file writes are available. Remeasure external repository HEAD/status there; current key file hashes match but external Git reads are unavailable. After those gates pass, commit with explicit pathspecs and preserve the prior approval boundary before push/PR. Shared-layout sibling image invalidation and the anchored-first initial fit remain the documented existing limitations; this task does not claim they changed.

Clean source records: `_archive/task-5-implementer.md`, `_archive/task-6-verification.md`, `_archive/task-spec-review.md`, `_archive/task-quality-review.md`. Findings and fix-round history are preserved in those files.
