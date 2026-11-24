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

## Review fix round (both Opus reviews: CHANGES NEEDED, tests missing, not logic wrong)
Added to `brokenPaths.test.ts` (now 13 tests): `GET /api/edit/<map>/block?x=0&y=0`, `GET /api/edit/<map>/plan` and `POST /api/edit/<map>/commit` for the broken layout and the broken tileset expect 409 `broken-path`, with tracked project files (layouts.json, metatiles.h, four map.json) byte-identical afterwards and sentinel files planted at the resolved outside paths (so a regression is a wrong 200, not an ENOENT); `GET /api/event-options/<map>?x=0&y=0` expects 409 (new `brokenPathBody` mapping in `addEventRoutes.ts` `optionsHandler`); a map with unparseable map.json keeps its route's own answer (the gate's `project.map` lookup is now in a try/catch).

| Mutation (fix round) | Result |
|---|---|
| `blockEdits.handle(...)` moved above the gate | MUTANT_1 |
| `block` added to the gate's exemption | MUTANT_2 |
| gate narrowed to `event/create` only | MUTANT_3 |
| gate lookup try/catch removed | MUTANT_4 |
| `optionsHandler` 409 mapping removed | MUTANT_5 |

Dead code, not killable by a test: the `.catch` mappings at event/create, sign put/resolve, indicator add/update and commit are defence in depth. Each route has an inner try that turns `PathEscapeError` into 400 first, and the gate stands in front of all of them. The paint/apply and event move/add/delete mappings are also behind the gate.

## Not in scope (F1d, F1e)
The gate already refuses `/api/edit/<map>/block*` for the requested map. Left for F1d: `GET /api/block-sheet/<map>.png` (not gated; tileset case answers 500); `blockEdit/{usage,gbaOps,save}.ts` walking every consuming layout through a HEALTHY map's URL, a real outside read on master today; `sign/*` beyond the gate; core readers. The UI half of the banner (the UI discards the 409 body) is row F1e.
