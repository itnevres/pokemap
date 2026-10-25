# Task 4 quality review (Codex gpt-6-astra, read-only)

- **Important — `packages/ui/test/canvas/MapSurface.test.tsx:200`: pending-chain assertion passes for the wrong reason.** `done` is checked synchronously after attaching `.then()`, so it remains `false` even if `chain.settled()` incorrectly returns an already-resolved promise. This does not protect the shell’s wait-before-discard contract. **Fix:** flush microtasks while `applyPaint` remains deferred, then assert settlement is still pending and `endStroke` has not run. Reject/resolve the deferred apply, await the original settlement promise, and assert completion.

- **Minor — `packages/ui/test/canvas/MapSurface.test.tsx:303`: cached-image test misses StrictMode effect replay.** The initial StrictMode mount happens with `observations.cached = false`; cached readiness is enabled only for a subsequent update. Consequently, the test does not exercise a cached image during mount’s setup/cleanup/setup cycle. **Fix:** enable cached properties before `mount({}, true)` and verify readiness/compositing survives replay; retain URL-change coverage separately.

Static review only; tests, builds, and mutation checks were not run. No files changed.

Quality: Changes requested