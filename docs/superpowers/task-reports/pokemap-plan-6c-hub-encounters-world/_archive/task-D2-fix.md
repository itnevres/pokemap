# D2 fix round report

## Review response

Addressed the two minor findings in `task-D2-quality-implementation-review-replacement.md` and the coordinator's manual-placement test gap. Based on `85c5e92`, after review commit `42c8dde`.

1. `placeNearWarps` now returns its copied `Map` in the input placement order. Candidate selection, path ordering, and collision search remain deterministic. The revised `chooses lexicographic anchor and target order independently of map and link order` test compares canonicalized entries, since reversing input order should preserve positions while retaining each input's iteration order. New `preserves fixed anchor and fallback iteration order while moving a singleton` test pins the unchanged key order and moved target. It failed against the original sorted-return implementation before the fix: expected `ZAnchor, Fallback, AAnchor, Target`, received `AAnchor, Fallback, Target, ZAnchor`.
2. `buildGbcWorldPayload` documentation now states its use of `proj` and the default event-load cost when normalized `warps` are omitted. It describes the handler's frozen cached warp argument. The former cache test is renamed `pure payload resolution preserves a base world and repeated HTTP responses are equal`. Its snapshot proves pure resolution leaves the separately built `GbcWorld` unchanged; its HTTP assertion proves response equivalence. It makes no claim to inspect the private handler cache. New `uses supplied normalized warps without reading map events` test passes a project with an invalid event root and explicit empty links, proving the optional argument is honored without event reads. An `ignore-cached-warps` in-memory mutant makes the test red.
3. New `applies a manual placement last on a moved GBC singleton even when it overlaps a fixed anchor` test pins automatic `IlexForest (40,259)`, then manually puts it at AzaleaTown's origin. It proves IlexForest moved from its automatic coordinate, carries `manual: true`, has positive size, and AzaleaTown stays fixed. Both maps occupy the same origin, so their positive-size rectangles overlap. No external sidecar is written.

## Verification and mutations

- Focused `npx vitest run packages/core/test/world/nearWarp.test.ts packages/core/test/world/resolve.test.ts packages/server/test/gbcRoutes.test.ts`: 93 passed in three files.
- `npm run typecheck`: passed after a test-only non-null annotation fix.
- Scratch harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-d2-mutations.mjs`. `node C:\Users\Serve\AppData\Local\Temp\pokemap-d2-mutations.mjs` red-proves 11 IDs, including `sort-output-order` and `ignore-cached-warps`, with exact-once literal anchors and `finally` byte comparison after restoration. The original nine D2 IDs remain red.
- No full suite run in this fix round; coordinator owns the final suite. No external corpus files or `.codex` files changed.
