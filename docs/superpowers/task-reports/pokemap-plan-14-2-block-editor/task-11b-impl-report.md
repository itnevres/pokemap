# Task 11b implementation report

High risk: HTTP error boundaries, revision races, and staged ownership. Native implementation; budget 25 minutes, at most one repair.

- B9: `packages/server/src/blockEditRoutes.ts:163` returns planner usage, confirmation, and warnings; non-BAD_VALUE refusals and stale revisions are 200 refusals.
- B10: `packages/server/src/blockEditRoutes.ts:174` checks revision before staging the complete plan with the requested label and returns the session body.
- B10a: `packages/server/src/blockEditRoutes.ts:181` skips staging for empty plans, while line 186 allows sessionBody to open the session.
- B11: `packages/server/src/blockEditRoutes.ts:142` maps errors, lines 150-162 guard map and body, and lines 215 and 307 validate family drafts.
- B13: `packages/server/src/blockEditRoutes.ts:199` and `:299` build grids from entries; check returns at line 180 before any staging or session body call.
- B14a: `packages/server/src/blockEditRoutes.ts:226` checks the behavior and shifted layer masks after safe integer and upper-bound checks.
- B15d: `packages/server/src/blockEditRoutes.ts:250` retains the GET file-scoped cap; write routes use planner usage and compute no cap.

Typecheck: `npm.cmd run typecheck` passed (exit 0); Vitest was not run as instructed. PowerShell blocked `npm` script execution, so the equivalent npm.cmd entry point was used.

### Independent spec review

PASS: reviewed the actual routes, planners, ownership helper, and 11b.1–11b.11 oracle; no actionable findings. Check returns planner data or a refusal without opening a session; apply compares revision before staging the complete plan and relies on stageTilesetPlan for ownership. Shared validation and map guards cover the specified 400/404 responses; GBA attribute masks and per-request grids are reused. No route-computed write cap or usage was added.

B11/core discrepancy: the GBC planner's collision patcher checks identifier syntax, not membership (packages/core/src/blockEdit/gbcPatch.ts:112); the oracle requires unknown names to receive a draft.collision-prefixed 400 (packages/server/test/helpers/blockEditRoutesSuite.ts:1515,1521), which shared route validation supplies (packages/server/src/blockEditRoutes.ts:310). No tests or runtime checks were run during this review.

### Independent quality review

PASS: no actionable findings. Reviewed the asynchronous body and error paths, both planners, and staging helper. The routes resync after receiving the body, compare the planned revision before staging the complete plan, and skip staging on no-op and refusal paths. The shared preview validators retain the prior substantive checks. No tests or runtime checks were run during this review.
