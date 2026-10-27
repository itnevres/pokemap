# Plan 12b Task 6: scoped re-review of fix round 2 (High)

Read-only. Do NOT run vitest, npm, tsc, or builds (a gate is running). Do not edit files except your -o report.

Repo C:\Programming Projects\PokeMap, branch plan-12b-world-surface at 3d6ff3f; Task 6 uncommitted (`git diff`; new packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx). Prior reviews: docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-6-spec-review.md and task-6-quality-review.md. Implementer's account: task-6-impl-notes.md "Fix round 2" (claims to check, not evidence).

Verify each finding is addressed with file:line, and that the fix introduced no regression:
1. Spec Important: group drag membership no longer filtered by `inScope` (GBA keeps out-of-filter selected maps in a group move; GBC clears selection on filter change, so the shared rule keeps both). Confirm the GBC clear-on-filter policy is present in the surface or adapter, and that hit-testing still uses drawn in-scope maps only. Regression test present.
2. Spec Minor: marquee has no `aria-hidden`.
3. Quality Minor: useWorldDrag.ts publishes `cancelRef` in a layout effect; unmount cleanup kept. useWorldDrag.test.tsx unchanged.
4. Quality Minor tests: warp results after unmount and under StrictMode; older POST rejection while a newer drag is pending; all group members failing (one reload, no saved callback).

Conductor evidence (not yours to re-run): canvas tests 233/233, typecheck clean (after a one-line conductor fix moving `toolbarExtras` into the adapter object in the suspended-render test). Mutations red: filter guard restored on group membership; reload per successful POST; failed warp cache entry kept; marker suppression removed; double-click fallback removed; cancelRef published at render.

Report: verdict PASS / FAIL, items 1-4 ADDRESSED or NOT with evidence, any new Critical/Important finding with a failure scenario. Short, plain sentences.
