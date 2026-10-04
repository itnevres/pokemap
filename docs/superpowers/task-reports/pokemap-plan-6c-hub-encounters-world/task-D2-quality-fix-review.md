# D2 quality fix review — e2f8fcc over 85c5e92

Status: **pass; no open quality findings**. Reviewed the committed diff and committed `GbcProject` type through Git only. No live-tree reads or test runs.

## Prior findings

1. `placeNearWarps` now returns its cloned `out` Map in input order. Its candidate/path sorting remains inside the placement algorithm. The revised order-reversal test compares canonicalized entries, while a separate test pins the original key order of fixed anchors, fallback, and moved target. This resolves the GBA iteration-order concern.
2. The GBC payload comment now accurately describes `proj` use, the optional cached warps, fresh placement resolution, and manual-last application. The existing cache test title now claims only what it checks: a separately built base survives direct payload resolution and repeated HTTP responses are equal. The test no longer implies observation of the handler's private cache.

## Added tests

- The supplied-warps test passes an invalid event root with an empty warp list, so any accidental event loading inside the payload helper would fail. This directly supports the revised cache comment.
- The moved-singleton test pins automatic `IlexForest` placement, overrides it with AzaleaTown's origin, checks `manual: true`, and checks the fixed anchor is unchanged. Both maps have positive dimensions, so the shared origin proves intentional overlap and manual-last behavior. Its corpus dependency is consistent with the existing GBC route suite.

No new quality issue is evident in the fix diff. Execution results remain outside this read-only review.
