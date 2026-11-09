Changed five files:

- `packages/core/src/addEvent/entryPoints.ts`
- `packages/server/src/addEventRoutes.ts`
- `packages/core/test/addEvent/entryPointIndex.test.ts` (new)
- `packages/server/test/addEventRoutes.test.ts`
- `packages/server/test/gbcAddEventRoutes.test.ts`

Added tests for five-map parity per subject, staged overlays, and disk-free indexed lookups. Both server suites add:

- “map options and create share one lazy entry-point index until discard”
- “save rebuilds the entry-point index and exposes a newly saved reference”
- “discard rebuilds the entry-point index after external map reference changes”

Existing assertions and invalidation triggers were preserved.

Not run: tests, typecheck, build, mutation checks, or git operations. Verification and commits remain with the conductor.