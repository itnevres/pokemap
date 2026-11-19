Needs changes

- **Important — `packages/server/src/blockEditRoutes.ts:256`:** The existing alias loop now expands consumers transitively. If A shares metatiles with B, and B shares attributes with C, C enters A’s route cap despite sharing neither file with A. With A/B limits of 640, C’s limit of 512, and 512 existing blocks, GET returns `nextId: null` although A’s planner permits append. Compute the cap from `gbaConsumingLayouts(project, symbol)` directly and add a partial-alias chain regression.

- **Minor — `packages/core/test/blockEdit/usage.test.ts:1607`:** E1.8 can pass without testing confirmation. When shared blocks also appear in their own symbol’s maps, `exclusive` stays undefined; the `common` fallback checks usage but skips the planner entirely. Make confirmation unconditional for the selected case, or explicitly require an exclusive candidate.

Static review only; Vitest was not run.