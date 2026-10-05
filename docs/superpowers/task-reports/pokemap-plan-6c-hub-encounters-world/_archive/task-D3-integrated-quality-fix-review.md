# D3 integrated quality fix review

Reviewed `git diff 11a8d50..410acfb` with `git show`/`git diff` only; no source edits or tests.

The membership-keyed `mapFilter` cache preserves Set identity across a rename and changes it when a dungeon's ID or member list changes. The existing GbcWorldCanvas refit effect therefore addresses finding 1. Applying `world-canvas__toolbar-group--save-error` to the warp error group gives its flex parent the same `min-width: 0` and ellipsis rules as save errors, addressing finding 2. The added marker click and stale-scope selection guards do not introduce an obvious production regression.

## New fix-specific finding

**Moderate — the new pan/refit test can leak DOM geometry overrides into later tests.** `packages/ui/test/gbc/GbcApp.test.tsx`, anchor `if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);` (and the matching `clientHeight` line). The test installs own descriptors on `HTMLElement.prototype`, then restores them only if they existed there beforehand. If either descriptor was inherited from another prototype, `width`/`height` is `undefined` and the added own property remains after the test, changing viewport measurements for every later test in this file or worker. In `finally`, restore the original descriptor when present; otherwise delete the newly added own property. This is test isolation cleanup, not a new product requirement.
