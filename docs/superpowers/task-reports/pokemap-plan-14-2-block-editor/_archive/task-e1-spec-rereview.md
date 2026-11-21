Needs changes

- **Earlier Important — resolved.** `packages/server/src/blockEditRoutes.ts:253` now calculates cap directly from `gbaConsumingLayouts(project, symbol)`. The partial-chain core test at `usage.test.ts:1538` satisfies E1g.
- **Earlier Minor, E1.8 — partially resolved; remains open.** Confirmation is now unconditional. However, `packages/core/test/blockEdit/usage.test.ts:1600` only prioritizes Building groups; it still accepts other groups. If no Building pair qualifies but a SecretBase pair does, the test passes without exercising the Building smoke case required by the plan at line 603. Require a qualifying Building pair.
- **Earlier Minor, distinct alias slots — resolved.** `usage.test.ts:1551` checks both ordered roles, their symbols and partners, and usage across both disk targets.

No new Critical/Important/Minor findings. The secondary-slot test in `gbaOps.test.ts:529` directly targets the N3 substitution.

Static review only; no files changed or Vitest run. Typecheck, 413/413, and mutation results are conductor-supplied evidence; N3’s kill was not independently verified.