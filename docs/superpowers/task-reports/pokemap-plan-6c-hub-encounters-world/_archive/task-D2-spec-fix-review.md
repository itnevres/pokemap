# D2 scoped spec fix review

Reviewed fix `e2f8fcc` over `85c5e92`, the fix report, independent spec review `87473da`, and quality review `42c8dde`.

**Verdict: one prior acceptance gap remains; one spec wording reconciliation is required.** No production bug found in this fix.

## Addressed

- Quality finding 1: returning the cloned `out` Map preserves input iteration order for fixed anchors and fallbacks; replacing existing target values with Map.set does not reorder keys. Deterministic path/candidate/collision selection is unchanged. The new key-order fixture distinguishes input order ZAnchor, Fallback, AAnchor, Target from sorted AAnchor, Fallback, Target, ZAnchor. Canonicalized coordinate comparison still detects A/B winner changes.
- Quality finding 2: payload documentation now accurately describes proj, default event loading, supplied cached normalized warps, copied placements and manual-last. The cache test title accurately limits its claim to one pure resolution and equal HTTP responses. Supplied-warps test uses an invalid event root with explicit empty links; a mutant that ignores supplied links calls gbcWarpLinks and attempts nonexistent files, so it is non-equivalent. This proves honoring the argument; it does not itself observe the handler cache.
- Spec finding 2: new GBC test pins automatic IlexForest (40,259), manually moves it to AzaleaTown's origin, asserts manual=true and unchanged AzaleaTown, and proves positive dimensions for both. Equal origins plus positive dimensions imply strictly positive rectangle overlap. This meets moved-singleton manual-last and intentional-overlap acceptance without a corpus write.

## Remaining

1. **P2, prior spec finding 1:** `packages/server/test/gbcRoutes.test.ts`, test `pure payload resolution preserves a base world and repeated HTTP responses are equal`, still resolves its locally built base only once. Renaming avoids the misleading private-cache claim but does not implement the requested two resolutions using the same observed base. Minimal closeout: compute normalized warps once; call buildGbcWorldPayload twice with that same base and warps; assert the original placement snapshot after each call and response equality. Retain the independent HTTP equality check. This was explicitly offered in the prior report as an alternative to adding a handler observation seam.

2. **Executed spec clarification:** its acceptance still demands byte-identical raw placement entries after reversing input map order. The accepted quality fix intentionally preserves each input's order; those two requirements cannot both hold. Update task-D2-spec.md to require canonicalized entries/coordinates to match while returned iteration order follows input. Document this as preserving existing GBA paint order per U1, not weakening coordinate determinism. The changed implementation and test are appropriate; the binding prose must agree.

## Focused evidence

Ran only the three changed/new GBC cases (`pure payload resolution|uses supplied normalized warps|applies a manual placement last`): 3 passed, 78 skipped. No POST/write cases or full suite ran. Inspected both new mutation anchors and hand-derived their non-equivalence as above. Did not rerun the mutation writer concurrently because a shared-worktree mutation was visible during inspection; no production/test source was edited by this reviewer. The prior independent geometry/corpus review remains applicable because geometry, adapters, traversal, collision rules, and manual application code are unchanged.
