Needs changes

- **Important — `packages/server/src/blockEditRoutes.ts:256`: E1e cap includes indirect aliases.** Suppose S uses `(M1,A1)`, B uses `(M1,A2)`, and C uses `(M2,A2)`. S’s E1a consumers include S/B, but the route expands B again and includes C. If S/B allow 640 entries and C allows 512, GET reports cap 512 and disables append at 512 although the planner permits it. Duplicate consumers alone do not affect `Math.min`; this extra consumer does. Calculate the cap directly from `gbaConsumingLayouts(project, symbol)`. No test covers this partial-alias chain.

- **Minor — `packages/core/test/blockEdit/usage.test.ts:1607`: E1.8 can pass without testing confirmation.** When discovery finds only `common`, the test checks usage but skips the planner and `confirm` assertion. It also permits any shared-metatiles group rather than requiring the planned Building alias case. Require a qualifying Building pair and assert confirmation unconditionally.

- **Minor — `packages/core/test/blockEdit/usage.test.ts:1530`: E1b’s two-distinct-alias-slots case lacks coverage.** All synthetic alias consumers are primary-only. A regression collapsing a layout with primary=A and secondary=A2 into one use would escape these tests; the existing R8a test covers identical symbols only. Add both distinct aliases in one layout and independently assert role order, `tileset`, `pairedWith`, and both E1d target counts.

Otherwise, static inspection supports E1a–E1f in core: canonical direct-OR matching, role deduplication/order, layout-owned halves, usage aggregation, and planner checks. Revision inputs, refusal construction, ownership/overlay handling, and GBC remain unchanged. The new oracles derive expectations from layouts and disk bytes independently of the reviewed functions. E1f has no new alias-specific regression test; existing revision tests remain.

No tests run; conductor-reported typecheck and 410/410 accepted as supplied evidence.