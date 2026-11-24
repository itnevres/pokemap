# Plan H F1c, server half (High tier)

Branch `plan-h-f1c-server` from master `f96e7df`. Tier High: error boundary, refusal of render/open/edit for a map whose layout or tileset path leaves the project (D25).

## Scope
Refuse (typed `409 {error, code:"broken-path", defect}`), never read or open: `/api/render`, `/api/map`, `/api/metatile`, `/api/indicator/<map>/suggestions`, `editSessions.open()`, every `/api/edit/<name>/...` route (gate) except the no-op `session|undo|redo|discard`, warm-up (skipped, not failed). The defects route is unchanged and still carries the defect (the banner). One helper file: `server/src/brokenComponents.ts` (layout's `brokenPaths`, then its primary and secondary tileset's `brokenPaths`; checks both because core throws `PathEscapeError` for a layout but a plain `Error` for a tileset). Tests: new `server/test/brokenPaths.test.ts` (10 tests; hermetic temp copy; broken layout, broken secondary tileset, broken primary tileset, healthy control map).

## Mutation checks (each run through the lock on `brokenPaths.test.ts`; baseline 10/10 pass)
| Mutation | Result |
|---|---|
| cachedRender guard removed | 2 fail |
| map route guard removed | 1 fails |
| `editSessions.open` guard removed | 2 fail |
| edit gate removed | 1 fails (event/create has its own 400 handler) |
| outer catch mapping removed | 4 fail |
| layout `brokenPaths` ignored | 5 fail |
| tilesets ignored | 6 fail |
| only primary tileset checked | 6 fail |
| only secondary tileset checked | 1 fails (primary scenario, added after the first batch let this mutant survive) |
| warm-up rethrows | 1 fails |
| metatile guard removed | 1 fails |
| indicator suggestions guard removed | 1 fails |
Source restored after each mutation.

## Not in scope (F1d)
Block-editor routes (`blockEditRoutes.ts`, C-owned), `sign/*` edit routes beyond the gate, core readers; see Plan H row F1d.
