# Plan 14.2 ledger (Block editor, both families)

Branch `plan-14-2-block-editor` from master `3f4a762` (Plan 14.1 merged via itnevres/pokemap#31). Local only.

## Baseline

- Gate at `110559a` (same code as `3f4a762`): 4,416 pass / 1 fail / 254 files; typecheck and UI build pass. The 1 fail
  is environmental: `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (user
  follow-up, not 14.2). Known load flake: server `api.test` "GET /api/defects ..." can exceed 5 s cold.
- Subjects: GBA `26a2e3d1e` + the user's 9 porcelain lines; PerfPlus `81ededbe3` clean.

## Decisions

- User answers Q1-Q10 (2026-11-08) folded into the spec Design (conductor s1, 2026-11-10). Conductor calls made while
  folding: Q6 implements only Ctrl = 2x2 and Ctrl+Shift = 4x4 from Polished Map's eight modes (verified
  `refs/polished-map/src/block-window.cpp` `change_chip_cb`); GBA 2x2 fills one layer, no 4x4. Q2 Local repoints
  every square of this block that used the old tile id, and reuses an existing identical-pixel tile with the target
  palette. Q8 from the palette edits raw block 0.
- **Q11 (user, 2026-11-10; binding):** Local copies go only into an unused, non-reserved slot of the existing sheet;
  the sheet is never grown.
- **Spec approved by the user 2026-11-10.**

## Reviews

- Spec review 2: Codex `gpt-6-astra` read-only (thread `01a1c72a-617b-7c82-b9f3-83d0f2115d8a`): 9 Important, 2 Minor,
  all folded in (see the spec's Review record).
- Plan review 1: Codex `gpt-6-astra` read-only, 2026-11-10: 1 Critical, 11 Important, 1 Minor. Restructured 13 → 16
  tasks (contracts/overlay first; core save split from hub ownership; overlay lifecycle; UI transport task), revision
  token for stale popups, ownership by history, prepared-entry match, `tilesetEffects` producer, version propagation
  to map/world/palette URLs, deterministic GBA fixture, mixed multi-palette and reservation cases, named assertion per
  mutation, `copyGbaTilesetProject` helper. **Declined: Critical #1** (full gate writes the real subject through old
  restore-in-finally tests): pre-existing, the gate the user mandates, guarded by the 14.1 globalSetup snapshot and
  the post-gate subject check; 14.2's own tests never write subjects (plan Global Constraints).

## Offload log

- 2026-11-10 Gemini 503 (high demand) on the Polished Map block-window question; Nemotron answered, claims verified
  against `block-window.cpp:253-323`.
- 2026-11-10 code map for planning: OpenCode `opencode/deepseek-v4.1-flash-free` `--agent plan` passed (no
  free-limit this time); two refs spot-checked (`addEventRoutes.ts:78`, `gbcRoutes.ts:347-359`). Kept in the s1
  scratchpad, not committed.

## Execution (conductor s1, 2026-11-10)

SDD workspace (gitignored): `.superpowers/sdd/2026-11-10-pokemap-plan-14-2-block-editor/` (briefs). This ledger is
the recovery map; reports go next to it.

### Preflight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2-T7 | `TilesetFileEdit`, `BlockEditRefusal`, `FileOverlay`, `StagedGrids`, `tilesetPaths` | consistent |
| T1 → T5, T10 | `setTilesetOverlay` resets static usage relations | T5 adds the relations; T1 must expose a reset hook T5 can register into. Ruling below |
| T2/T3 → T6 | patchers, `copySheetTile`, `loadGbcReservedTiles` | consistent |
| T4 → T7 | `patchGbaMetatile`, `patchGbaAttribute`, `assertNotTripleLayer` | consistent |
| T5 → T6/T7/T11 | `BlockUsage`, `gbc*Usage`, `gbaBlockUsage(…, grids)` | consistent |
| T6 → T7 | `BlockEditPlan`, `placeGroup`, `blockEditRevision` | consistent |
| T8 → T9 | `tilesetEdits`, `mergeTilesetEdits`, `checkTilesetBaselines` | consistent |
| T9 → T10/T11 | `stageTilesetPlan`, `ownedTilesetPaths` | T10 references `stagedTilesetBytes`, not produced by name in T9. Ruling below |
| T11 → T12/T13 | routes under the edit base, `{error, code}` | consistent |
| T6 → T13 | `placeGroup` in UI via `@pokemap/core` | UI importing core runtime code: check the UI build bundles it (core already imported by UI) |
| each task self-consistency | files created vs touched, tests vs code | T7 fixture folder needs `.gitattributes` `-text` (stated); T10 edits UI mocks only where URL gains `tv=` (stated) |

- Ruling: T1 `setTilesetOverlay` also bumps a project-level `tilesetGeneration: number` that T5's static-relation
  cache compares, instead of a reset-callback registry — simplest coupling — if wrong, T5 adds a callback (small).
- Ruling: `stagedTilesetBytes(session): Map<string, Buffer>` (path → `after`) is produced by T9 in
  `blockEditOwnership.ts` — T10 needs it and T9 owns session-side helpers — if wrong, T10 adds it (trivial).

### Task 1 (High): contracts, readers, overlay

- BASE `a336a0d`; worktree `scratchpad/wt-t1`, branch `p14-2-t1`. Hop 1: OpenCode `opencode/deepseek-v4.1-flash-free`
  (Opus-tier chain) started.
- Ruling (user, 2026-11-10, relayed by master `local_7a03546e`): "make the fix in 14.2. redirect at the source as
  recommended" — overrides the conductor's decline of plan review 1 Critical #1. New Task 0 (High) added before Task 1;
  scoped astra re-review of the Task 0 text running. Task 1's DeepSeek hop was already running in its own worktree
  (disjoint files: Task 1 creates `gbaTilesetProject.ts`, touches no root helper); Task 0 merges first.
- Master (2026-11-10): no full gate / merge for Task 1 until Task 0 is merged and verified; focused non-writing tests
  only until then. Task 1 hop 1 stopped before it edited anything (its brief allowed `vitest run packages/core`,
  which includes subject-writing tests); processes 19528/27536 ended. Task 1 brief now restricts tests to its own
  files. Order: Task 0, then Task 1 (fresh DeepSeek hop, not counted as a failed hop).
- Task 0 text scoped review: Codex `gpt-6-astra` read-only: 6 Important (canonical containment + junctions; git-status
  tests need manifests; Yellow root + basenames + absent roots; real-root manifest at teardown; production cwd-config
  readers; proof via sentinel roots, not real subjects), 1 Minor (copy cost measurement). All folded into Task 0.

## Execution (conductor s2, 2026-11-10)

### Task 0 (High): redirect test roots

- BASE `f651851`; worktree `s2-scratchpad/wt-t0`, branch `p14-2-t0`.
- Hop 1: OpenCode `opencode/deepseek-v4.1-flash-free` failed (`provider.invalid-output` "stream ended without
  finish_reason" ×2; stopped half-done, no report). Stashed `delegate: deepseek failed task0`. Hop 2: Codex
  `gpt-6.1-sol` workspace-write started.
- Hop 2 Codex `gpt-6.1-sol`: code done, report BLOCKED (sandbox: npx/npm blocked by PowerShell policy; flagged a
  third git dependency `core/test/gbc/write/writeGate.test.ts:76`). Conductor verified: focused testRoots 11/11
  (setup 87,246 files / 273 MB / 114 s; teardown 45 s), typecheck pass.
- Conductor inline edits (tiny, ≤20 lines): writeGate git-status → `contentManifest` (same intent as the two named
  exceptions; ruling: in scope); `testConfig()` checks root containment only, deep link walk only in setup (copies
  are dereferenced; per-file walk cost ~5 s × every corpus importer); reverted Codex's `ui/test/gbc/Root.test.tsx`
  edit (string was a fake mock root, not a real path; the UI import of a core test helper resolved to the main
  checkout from the worktree).
- Worktree note: server tests import `@pokemap/core/test/...`; added `packages/server/node_modules/@pokemap/core`
  junction → worktree core, else they load main's helpers (real config).
- Mutations (sentinel roots): M1 containment check off → KILLED (2 tests); M2 teardown manifest check off → KILLED; M3 testConfig fallback when env unset → KILLED. Committed `c00e1ad` on `p14-2-t0`. Astra `gpt-6-astra` spec + quality reviews (separate runs) started.
- Astra review 1: spec Needs changes (Important: gate evidence pending → deferred to merge; Minor: stale report → addendum); quality Needs changes (Important: copy filter on absolute path, `build` ancestor empties copy; Important: cleanup error masks real-root change). Fixed inline (conductor, ~25 lines, fix round cheaper than a Codex resume); +2 sentinel tests (13). Mutations M4 absolute filter → KILLED, M5 cleanup masking → KILLED. Fix commit on `p14-2-t0`; scoped re-reviews running.
- Scoped re-reviews (astra): spec Approved, quality Approved. Merged `--no-ff` as `1d6c07d`.
- **Gate at 1d6c07d: 4,429 pass / 1 fail / 255 files; typecheck pass, UI build pass; all 9 real roots (subjects,
  5 GBA refs, pret pokecrystal, pokeyellow) HEAD + porcelain unchanged; teardown manifest check passed.** The 1 fail is
  the known env fail `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (96 vs 98;
  ledger Baseline), now reading the scratch copy. Wall time 2,027 s (no baseline duration on record); setup 86 s,
  teardown 55 s.
- Grep proof: config/real-root names remain only in `testRoots*.ts`, `subjectSnapshotSetup.ts`, `context.test.ts`
  temp-config fixtures, and `ui/test/gbc/Root.test.tsx` (fake mock root string `/root/pokemap-corpus/...`, no fs).
- Task 0 closed. Redirect verified → normal per-task flow (and whole-package vitest) allowed from Task 1 on.
