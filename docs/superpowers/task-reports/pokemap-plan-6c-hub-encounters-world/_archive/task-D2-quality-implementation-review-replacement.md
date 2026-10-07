# D2 implementation quality review — commit 85c5e92

Status: **minor fixes requested**. Read-only review of the committed diff and committed task spec. No live-tree reads or test runs.

## Findings

1. **[Minor] Preserve existing placement iteration order.** `placeNearWarps` returns `new Map([...out].sort(...))` in `packages/core/src/world/nearWarp.ts`. That sorts every fixed multi-map anchor and every fallback as well as the targets. The GBA resolver now exposes a different order for placements whose coordinates did not change, while D2 requires other GBA behavior to remain unchanged. With the ten existing GBA anchor overlaps, a consumer using object iteration order for painting may change which map is on top. Fix: retain the input placement order in the returned `Map`; sort only the candidate selection and any order-sensitive internal traversal. Change the order-reversal test to compare canonicalized entries, then assert unchanged input order for fixed placements in a separate test. If wire order is deliberately part of the contract, document and test that explicitly instead.

2. **[Minor] Correct the GBC payload documentation and cache test claim.** The `buildGbcWorldPayload` comment in `packages/server/src/gbcRoutes.ts` still says it takes `world` rather than `proj`, needs nothing from `proj`, and is cheap because `Object.fromEntries` does not mutate a Map. It now uses `proj` and, without supplied `warps`, loads all map events before layout. The changed test named `a second request returns deep-equal data -- the world cache is never mutated by serving it` snapshots a separately built `base`, not the handler's private `worldCache`; the later HTTP calls cannot mutate that `base` by construction. Fix the comment to describe the optional cached warp argument, and narrow the test title/claims to what its pure-function snapshot and repeated HTTP responses actually prove. A test of the handler's actual cache would need an explicit observation seam.

## Scope and test assessment

- The new core path, GBA resolver, and GBC route integration are confined to D2. The GBA toggle still gates the path; sidecar placements apply last. No unrelated GBA production file changed.
- The synthetic tests pin the directed hidden-gate traversal, null final arrival, endpoint-based geometry, signed zero, collision search, and deterministic target choice. Corpus tests pin named GBA and GBC outcomes and overlap sets. The GBC route's expected placement values are computed independently of the route helper, though they use the same core algorithm; the literal corpus assertions supply independent position checks.
- Existing GBA tests were untouched. The only changed existing test title is the GBC `/api/world` deep-equality test: it now names resolved near-warp placements because the old base-world equality is no longer valid. The existing GBC cache and direct-payload test bodies changed to account for the resolver; their titles stayed the same. No other existing test changed.
- No test result is claimed by this review. The separate high-risk spec review should judge corpus facts and geometry independently.
