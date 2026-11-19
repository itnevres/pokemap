Approved

- **Earlier Important — resolved:** `packages/server/src/blockEditRoutes.ts:253` computes the cap directly from `gbaConsumingLayouts(project, symbol)`, removing transitive expansion. E1a pins the direct consumer set with the A–A3–A4 partial-alias chain, consistent with conductor ruling E1g.
- **Earlier Minor — resolved:** `packages/core/test/blockEdit/usage.test.ts:1626` requires an exclusive alias candidate. The planner call and `confirm === true` assertion are unconditional.
- **New findings:** None. E1b checks both alias slots and their disk targets; E1c checks that secondary-range tiles resolve through the layout’s own secondary.

Static review of `e3f0799..d1f2fb5`; `git diff --check` passed. No files changed or Vitest run. Conductor test/typecheck evidence was supplied, not independently rerun; N3’s kill remains unverified.