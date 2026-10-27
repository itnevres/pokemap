- **Spec I1 — ADDRESSED.** `packages/ui/test/canvas/useWorldTiles.test.tsx:197–205` loads A, removes it from visibility before changing `cacheKey`, asserts its cached tile disappears, and verifies a new-key request on return.
- **Spec I2 — ADDRESSED.** `packages/ui/test/canvas/useWorldTiles.test.tsx:234–239` supplies external dimensions 7×5, different from placement A’s 2×3, and asserts exact `buildSmallTile` arguments including `nativePx: 32` and scale `0.25`.
- **Quality I1 — ADDRESSED.** `packages/ui/src/canvas/useWorldTiles.ts:36–40` sets and clears the mounted ref; `:64` guards all callback work. `packages/ui/test/canvas/useWorldTiles.test.tsx:226–231` verifies late loads neither build nor populate the cache after unmount. `:85–89`, using `reactStrictMode` at `:40`, verifies the sole request still lands after effect replay.
- **Quality I2 — ADDRESSED.** `packages/ui/test/canvas/useWorldTiles.test.tsx:207–223` exercises day → nite → day and resolves distinct same-URL requests individually. The discarded request produces no tile, build, or version bump; the current request supplies the expected image, builds once, and increments version.

**New Critical/Important breakage:** None found in the mounted guard or changed tests.

Read-only inspection; no files edited or tests/npm run. Mutation results are conductor-reported; the running gate was not independently verified.

Re-review: all addressed