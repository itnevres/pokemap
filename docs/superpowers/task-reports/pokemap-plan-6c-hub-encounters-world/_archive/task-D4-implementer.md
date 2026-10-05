# D4 implementer report

**Status:** implemented and fixed through both D4 review rounds. Initial code/test commit `05ef2c6`; first fix `f2fa4fb`; second narrow fix accompanies this report. No D4 placement computation changes.

## Behavior

- `conflictKey` serializes the complete seven-field ordered tuple. `wireConflicts` adds fresh key/accepted metadata without mutating cached core conflicts. The optional sidecar list defaults to `[]` and rejects non-string members with the sidecar path in the error.
- Both POST routes validate JSON/plain-object fields, reject unknown current keys, deduplicate accepts, remove exact keys on unaccept, persist `world.json` only, and return `{acceptedConflicts}`. GET derives fresh acknowledgement flags. GBA route is covered through a temp scratch root whose corpus directories are read-only junctions and whose sidecar is copied; the real GBA root is never the route-test write target.
- Both canvases show muted checked badges, accepted tooltips, total/accepted status, a single right-click action, Escape dismissal, and guarded POST errors. Same-map keys receive sorted 22-pixel horizontal offsets shared by draw and hit logic. The action measures its rendered width/height and clamps both coordinates inside the viewport with an inset, including midpoint clicks. Acceptance response membership drives redraw even when its count stays unchanged. GBC retains one view state. No E3 menu was added.

## Existing tests changed, with reason

- `sidecar > round-trips`: readback now includes the new default `acceptedConflicts: []`.
- `gbcRoutes > GET /api/world > deep-equals independently resolved near-warp placements; 326 components, exactly 3 with more than one map; blockPx 32`, `exactly 2 conflicts, on Route17 and Route18, one pinned literally`, and `buildGbcWorldPayload wire-shapes a real GbcWorld directly (unit, no HTTP)`: exact wire expectations now include key/accepted; placement expectations are unchanged.
- `isGbcWorldPayload > accepts a real-shaped payload`: its shared fixture now carries the required conflict metadata.
- `GbcWorldCanvas > conflict badge > draws a diamond at Conflict.map's top-right corner in --danger, and shows the exact CLI-wording tooltip on hover` and other users of `CONFLICT_WORLD`: only their shared fixture gained key/accepted; existing tooltip/geometry expectations are unchanged.
- `WorldCanvas > draws a marker for every conflict and shows a tooltip naming both disagreeing paths`: its shared `makeWorld` fixture now serializes the new wire metadata; its preexisting assertion remains unchanged. No existing GBA layout/placement-coordinate assertion was edited.

## New coverage and corpus safety

Core identity tests distinguish equal-displacement shifted origins and escaped delimiters, fresh geometry, deduplication, request shape, and sidecar guard. Both route tests cover accept/reload/unaccept, 400/404, idempotence, and byte-identical placements. GBC's real write runs in the existing serial `gbcRoutes.test.ts`; every POST captures the sidecar in a `finally` before any status assertion, and outer cleanup restores only if bytes still equal this test's last observed write. Initial absence and directory absence are restored. Before adding it, `rg -n 'world\.json|sidecar|writeFile|mkdir|\.pokemap' packages -g '*test*'` identified the existing GBA `world.test.ts` writer and PerfPlus `gbcRoutes.test.ts` writers.

Canvas tests cover two independently actionable same-map badges, accepted draw color/check/tooltip, right-button down/move/up without pan/selection/placement POST, measured edge clamping, Escape, real GBC remount/unaccept, malformed/HTTP/network POST failure, and same-count key replacement in both families. GBA checks selection against the original mounted canvas immediately after the right-button sequence, before unmount; it also observes current mock placements and forbidden placement requests. A standalone popup test uses a measured 130×50 rectangle in a 200×200 viewport and proves both midpoint and far-corner bounding rectangles fit within the 8-pixel inset.

## Verification and red proof

- `npm run typecheck`: pass. `npm run build -w @pokemap/ui`: pass.
- Focused first-fix server/UI run: 268/268 pass across `gbcRoutes.test.ts`, `WorldCanvas.test.tsx`, and `GbcWorldCanvas.test.tsx`. Core/GBA scratch focused run: 16 pass, 6 filtered out. Second-fix UI run: 184/184 pass across `ConflictAction.test.tsx` and both world canvases. Typecheck and UI build pass after the second fix. A wider pre-fix focused run had 336/338 pass; the two failures were the documented existing `world.test.ts` dungeonAutoLayout-state tests (186 versus 1209), rerun in isolation with the same result. The new GBA scratch route test passed in that run.
- The Node harness `C:/Users/Serve/AppData/Local/Temp/pokemap-d4-redprove.mjs` asserted each literal source anchor exactly once, performed one source mutation at a time, ran `node_modules/vitest/vitest.mjs run <test-file> -t <title> --reporter=dot`, restored original in-memory bytes in `finally`, and byte-compared the restoration. All 21 original non-equivalent cases went red: tuple key, fresh metadata, deduplication, sidecar guard, each route's persistence, badge offsets/color, Escape, POST response guards for both families, GBC world guard, same-count membership redraw for both, edge placement for both, GBC unaccept, right-button guard for both, and visible POST error for both. The second harness `C:/Users/Serve/AppData/Local/Temp/pokemap-d4-clamp-redprove.mjs` used the same exact-once/restore/byte-compare method; removing width clamping killed the midpoint, GBA edge, and GBC edge tests, and removing height clamping killed the midpoint test (4/4 red). The coordinator still owns final D4-M1–M8 replay.

## External state

After focused writes, PerfPlus was clean with no `.pokemap` directory. GBA retained HEAD `718b89f...`, the recorded six modified files plus untracked human notes, and SHA1 `b285bbf...` for `world.json` and `f73f9b7...` for `dungeons.json`. No claim is made about the unavailable pre-baseline GBA sidecar hash.
