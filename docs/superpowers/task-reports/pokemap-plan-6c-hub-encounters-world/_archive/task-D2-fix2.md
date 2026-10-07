# D2 second fix report

## Residual spec-review response

Based on `d463c57`. No production code change was needed.

- The GBC pure payload test now calls `buildGbcWorldPayload` twice with the exact same `base` object: first with automatic placement, then with a manual IlexForest placement. It compares a snapshot of `base.placements` after each call and pins both returned IlexForest positions. Repeated HTTP response equality is a separate test. Neither test claims to inspect the private handler cache.
- The executed D2 spec now requires byte-identical placement values after canonicalizing entries by map name under reversed input order, while the returned Map preserves input iteration order. It also describes the two-call pure payload snapshot and separate HTTP check. This matches the first fix's order-preserving behavior and focused test.

## Red proof and verification

- Added `mutate-manual-payload-base` to the scratch harness at `C:/Users/Serve/AppData/Local/Temp/pokemap-d2-mutations.mjs`. It injects a mutation of `world.placements.IlexForest.x` only when the manual sidecar is supplied. The new two-call test fails on its second snapshot. The harness enforces an exact-once literal anchor, restores original bytes in `finally`, and byte-compares them. All 12 D2 mutation IDs yielded `RED (exit 1)`.
- Focused command `npx vitest run packages/core/test/world/nearWarp.test.ts packages/core/test/world/resolve.test.ts packages/server/test/gbcRoutes.test.ts`: 94 passed across three files.
- `npm run typecheck`: passed.
- Only the executed spec, GBC route test, and this report changed. No external corpus files or `.codex` files changed.
