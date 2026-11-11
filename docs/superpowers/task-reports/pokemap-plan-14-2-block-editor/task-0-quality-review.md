- **Important — packages/core/test/helpers/testRoots.ts:130 — Copy filtering examines absolute source paths.** A valid checkout under `C:/build/pokeemerald` matches the excluded `build` segment, so every allow-listed entry is omitted. Setup succeeds with an empty scratch root, and corpus tests can silently skip because their marker files disappeared. **Fix:** filter paths relative to the source root; add a sentinel case with a checkout beneath an ancestor named `build`.

- **Important — packages/core/test/helpers/testRootsSetup.ts:41 — Cleanup errors suppress recorded real-root mutation failures.** If manifest checking detects corruption and `removeScratchDir()` then throws, execution never reaches the `AggregateError` at line 46. The run reports only cleanup failure, hiding which real files changed. The setup catch at line 49 similarly masks the original failure. **Fix:** collect cleanup errors alongside the original errors, restore the environment unconditionally, then throw the combined failures. Cover simultaneous mutation and cleanup failure.

Read-only review; no files edited or tests run. Full-gate results remain pending.

**Needs changes**