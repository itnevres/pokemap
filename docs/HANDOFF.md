# Architecture audit handoff

Prepared 2026-11-15 for PokeMap's main orchestrator.

## Status and authority

This is a focused static audit of hidden dependencies, coupling, and duplicated logic. The original audit made no edits and ran no tests, builds, mutations, or live UI checks. The follow-up request authorizes this handoff document; it does not authorize implementing the proposals below.

The repository's current status remains owned by [RESUME](superpowers/RESUME.md). Its plans, specs, and roadmap rulings take precedence over this document. This document records observations and proposed boundaries, not new binding decisions or acceptance criteria.

At handoff preparation, the checkout was `plan-14-2-block-editor`, HEAD `21bf0b9dbaa450da806ebce3ff8542a4187ca7e1`. This is a preparation snapshot, not a verified test baseline. Re-check live branch, HEAD, and status before acting; concurrent work may move them.

Pre-existing changes were present in `.claude/settings.json`, RESUME, the follow-ups plan, the Plan 14.2 plan, and its task ledger. `.agents/`, `.codex/`, and `.superpowers/` were untracked. Preserve all of them. This handoff was added separately; no existing project status or plan was rewritten.

## Read first and reconcile

- [Project workflow](../AGENTS.md), including its delegate chain and risk-based review rules.
- [Current status](superpowers/RESUME.md) and [lessons](superpowers/LESSONS.md).
- [Follow-ups / roadmap Plan H](superpowers/plans/plan-h-hardening.md), especially Task G.
- [Active Plan 14.2](superpowers/plans/archive/plan-14-2-block-editor.md) and its [ledger](superpowers/task-reports/pokemap-plan-14-2-block-editor/ledger.md).

RESUME currently places Plan H after Plan 14.2 merges. Finding 1 overlaps Task G, already classified High and recorded as suspected pending reproduction. Reconcile evidence there rather than creating a duplicate task or promoting it to a runtime-confirmed defect. Findings 2 and 3 also need a backlog overlap check before scheduling.

## Ranked findings

### 1. GBA reads depend on conflicting cache lifetimes

Evidence:

- `packages/core/src/project.ts:138,147-159`: parsed maps remain in `mapCache`; the map getter has no invalidation operation.
- `packages/server/src/index.ts:194-209`: the cached cross-map warp scan explicitly documents pre-commit data surviving until restart.
- `packages/server/src/index.ts:213-216`: edit sessions bypass the map cache through a fresh disk parser.
- `packages/server/src/index.ts:1063-1084`: commits invalidate selected caches and close the session, while comments acknowledge other stale derived state.
- `packages/server/src/gbcRoutes.ts:347-359`: GBC provides a comparison point with an explicit post-commit invalidation callback. Do not assume its cache dependencies match GBA.

Concrete scenario: prime the warp-scan cache, save changed warps on map A, then delete a warp on map B. The scan can still consult A's pre-save warps. Source supports this mechanism; no runtime reproduction was performed.

Expected benefit: reopened edit sessions, ordinary map reads, and cross-map warnings agree after saving without requiring a restart.

Bounded proposal: add explicit map invalidation to Project and one GBA post-commit invalidation path for affected derived caches. Preserve open sessions; avoid replacing the project handler or sweeping unrelated caches into a new framework. Start inside existing Task G, whose final scope remains authoritative.

Behavior risks: shared layouts affect several maps; failed writes may leave disk state changed; tileset overlays have their own lifecycle. Invalidate only with an explicit dependency inventory.

Suggested evidence for the orchestrator to formalize: temporary-project tests that prime reads, commit an event change, then re-read through ordinary routes and cross-map warnings; shared-layout and failed-write cases. Mutation checks should remove the invalidation and make the regression fail.

### 2. Save behavior depends on hidden UI registries and workspace mounting

Evidence:

- `packages/ui/src/shared/useEditSessionCore.ts:13-20,49-68`: a module-level pending-create registry is shared by session hooks, saving, and navigation.
- `packages/ui/src/shared/AddEventDialog.tsx:15-52`: a dialog module owns return-warp source registration, listeners, fetching, and warning calculation.
- `packages/ui/src/components/MapEditingWorkspace.tsx:108-110` and `packages/ui/src/gbc/GbcMapEditing.tsx:109-111`: sources are registered only while the workspace is active and its session dirty.
- `packages/ui/src/components/SaveDialog.tsx:1-4,84,108-114,122,140`: saving imports the dialog-owned warning service and the hook-owned create barrier.
- `packages/ui/src/shell/FamilyApp.tsx:75-89`: navigation consults the pending-create registry outside the runtime session interface.

Concrete coupling: warning availability depends on an active workspace's registration and cleanup, while the server can continue to own a dirty session. Moving or unmounting that workspace requires understanding save-side effects outside its props. This is architectural debt, not a reproduced data-loss claim.

Expected benefit: explicit project/session ownership makes saving independent of presentation layout and reduces hidden setup requirements in tests.

Bounded proposal: make a project-shell-owned coordination instance explicit to sessions, workspaces, and SaveDialog. Preserve current warning calculation, cancellation, and request-settlement semantics. A file move alone would expose the same globals under a new name and would not resolve ownership.

Behavior risks: create-before-save ordering, rejection settlement, unmount cleanup, project reload, and stale A-to-B-to-A responses. Treat implementation as High risk because it changes async coordination and save/discard ownership.

Suggested evidence: pending create followed by save, navigation, or discard; rejected creates; workspace mode changes; project remount and A-to-B-to-A. Verify both families in the live app and retain existing guards.

### 3. Script preview and persistence duplicate edit-ordering rules

Evidence:

- `packages/server/src/signRefresh.ts:55-60`: effective script text selects the last replacement for a path, then applies matching appends.
- `packages/core/src/write/save.ts:288-302`: prepared writes independently apply replacements and then appends.
- `packages/server/src/signRefresh.ts:67-72`: folding edits into a replacement also depends on baseline and append ownership; preserve this behavior.

Concrete coupling: a session with a script replacement and appended event scripts requires preview and persistence to implement identical ordering. They currently agree. A future change to only one implementation could make linked-sign refresh inspect different text from the prepared save.

Expected benefit: one authoritative ordering rule, with a direct preview-versus-prepared-output assertion.

Bounded proposal: extract a pure per-path script-edit application function in core and use it from both consumers. Keep disk reads, original baselines, refusal checks, prepared entries, and atomic commit in their existing owners. Do not generalize this into a cross-family save engine.

Behavior risks: replacement precedence, append order, duplicate-replacement refusals, missing files, byte encoding, and line endings. Treat implementation as High risk because it affects subject-source writes and save correctness.

Suggested evidence: compare preview text to prepared bytes for replacement-only, append-only, and mixed edits, with multiple paths and line-ending variants. Preserve existing sign and save integration tests; mutation checks must catch ordering drift.

## Next action and verification boundary

The main orchestrator should reconcile these observations with the active plan and backlog, re-check cited source, and report where each belongs. Do not interrupt Plan 14.2 or start implementing solely from this handoff. Put any subsequently agreed criteria in the existing spec/plan and status in RESUME; this file is not a second execution plan.

If implementation is separately authorized, use the delegate skill and the project's High-risk workflow, including independent spec and quality reviews, mutation evidence, and live checks for UI changes. Follow the gate skill before a completion claim or closing commit: snapshot subject repositories, run `npm test -- --maxWorkers=4 --minWorkers=1`, `npm run typecheck`, and `npm run build -w packages/ui`, then compare subject state. Record fresh pass/fail/file counts and actual failures. Historical results in RESUME are not evidence for a new change.

Scope limits: no exhaustive parser, renderer, dependency-security, or dead-code audit was performed. No measured performance gains or line-count savings are claimed. No unused abstraction was established strongly enough to outrank these three findings. The handoff document is uncommitted; no implementation checks have been run for this documentation-only follow-up.
