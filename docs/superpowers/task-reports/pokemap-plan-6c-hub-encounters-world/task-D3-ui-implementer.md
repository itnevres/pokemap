# D3 GBC UI implementer report

Status: UI slice implemented. Base `848944b`; no GBA files or external sidecars changed.

## Files and behavior

- `GbcWorldCanvas.tsx`: `mapFilter` is the complete scoped candidate set, including automatic indoor/gate members. It applies to culling, image and encounter fetches, selection/hit/drop, conflict badges, fit, and lines. A changed scope refits after world data arrives. Normal World visibility remains the existing behavior. Warps and connection lines have independent off-by-default switches. Warp fetches are lazy, guarded, cached by map with a placeholder, and retry after a later toggle if they fail. Errors are visible. Marker and line coordinates convert raw GBC steps to blocks once using `projectGbcWarpPoint`; lines require an in-scope resolved destination event and get palette colors in sorted source-map/source-index order. Double-clicking a resolved marker opens the GBC map preview; unresolved markers report an error. Escape closes the preview without changing world view.
- `guards.ts` and `warps.ts`: family-tagged warp payload shape, including raw source and resolved destination events.
- `hooks/useGbcDungeons.ts`: GBC-only guarded GET/POST/PATCH/DELETE with visible list and action failures through `DungeonSidebar`.
- `GbcWarpDestinationModal.tsx`: read-only `GbcMapCanvas` in the existing modal shell, guarded destination fetch, focused close button and Escape.
- `GbcApp.tsx`: Dungeon mode, `DungeonSidebar`, scoped canvas, empty-selection placeholder, create/open/edit/delete wiring and safe selected-id clearing after successful delete. Time control and map opening remain available.

## Tests

Added named tests to the existing GBC UI test files; no pre-existing test was changed or removed. `GbcWorldCanvas.test.tsx` now pins exact BurnedTower raw-half endpoints `(123,203)` and `(283,363)`, hidden scoped member inclusion, outside image/warp/drop/line exclusions, unresolved line omission, stable colors after reversed membership order, independent toggles, modal Escape and preserved view, malformed warp visibility and retry. `GbcApp.test.tsx` now pins three mode buttons, empty dungeon placeholder, malformed list and rejected create errors, and create/open/member add/remove/rename/delete flow.

In-memory red proof, source restored byte-for-byte in `finally`:

1. `placement.x + event.x / 2` → `placement.x + event.x`; `npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t 'projects raw half-step'` exited 1, expected x=123 and received x=163.
2. `!w.destMapName || !mapFilter.has(w.destMapName) || !w.destEvent` → `!w.destMapName || !w.destEvent`; `npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx -t 'scopes hidden members'` exited 1, expected two lines and received three due to the outside edge.

Final focused verification: `npx vitest run packages/ui/test/gbc/GbcWorldCanvas.test.tsx packages/ui/test/gbc/GbcApp.test.tsx` passed 130/130. `npm run typecheck` passed both base and UI TypeScript projects. `npm run build -w @pokemap/ui` passed. Root `npm run build` is not defined; the workspace build is the actual UI build. No full suite was run. The test runner emits jsdom's existing canvas `getContext` warnings in GbcApp tests; all assertions pass.
