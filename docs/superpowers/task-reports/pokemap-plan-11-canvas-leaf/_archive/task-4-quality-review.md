# Task 4 quality review (Codex gpt-6-astra, a5a8cda)

Quality: Approved

Reviewed commit `a5a8cda`. No blocking correctness defects found for the documented call sequence.

Critical: None.

Important: None.

Minor:

1. **Completed versions accumulate indefinitely.** [placementLedger.ts:76](/C:/Programming%20Projects/PokeMap/packages/ui/src/shared/placementLedger.ts:76) retains every gesture record; `findInFlightMoved` and `resolve` scan that history. Memory grows with gesture count, and repeated operations on one map incur increasing work. This is unlikely to matter in ordinary sessions, but avoidable in long sessions. **Fix:** prune completed, superseded records after propagating their outcomes, retaining the latest version and unresolved dependencies.

2. **Lifecycle preconditions are implicit and unenforced.** [placementLedger.ts:106](/C:/Programming%20Projects/PokeMap/packages/ui/src/shared/placementLedger.ts:106) accepts `resolve` before `moved`, making an unfinished gesture eligible for server reconciliation. Calling `noop` on an already-resolved version can also rewrite its outcome. These are caller misuse rather than failures of the intended sequence. **Fix:** document the required `begin → moved → resolve` or `begin → noop` lifecycle explicitly; preferably guard invalid transitions and add focused tests.

Verification: All 20 existing test bodies passed using an in-memory assertion harness, plus seven additional probes covering unknown map/version calls, duplicate resolution, POST completion during a no-op gesture, and superseded no-op dependencies. This was not a Vitest run. Full gates, typecheck, and UI build were not rerun; the implementation report records 3,475 passing tests across 217 files and passing builds.

The tests exercise observable outcomes rather than implementation details. Snapshot isolation and superseded-version ownership behaved correctly. No files changed.