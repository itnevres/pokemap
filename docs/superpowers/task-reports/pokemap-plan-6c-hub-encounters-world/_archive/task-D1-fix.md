# D1 fix report

Fixed every D1 quality/spec-review finding on top of `15b8368`.

## Implementation

- GBC placement validation now rejects `null`, arrays, and non-finite coordinates with 400 before sidecar mutation.
- `fetchGuarded` accepts optional `RequestInit` and reports the supplied method while preserving GET callers' existing one-argument `fetch(url)` invocation. GBC placement POST guards `{ ok: true }`, makes status/network/JSON/shape failures visible, clears the alert after a successful retry, and reports the successful map to `GbcApp`.
- `GbcApp` tracks maps saved manually during the current World session, so the shared tree removes its hidden/greyed state immediately after success. `GbcWorldCanvas` retains a single view state; its scope comments now describe manual Shift-drag/drop placement. Save-error flex content uses `min-width: 0` and ellipsis.
- Restored direct payload unit coverage and full independently-derived GET placement equality alongside the visibility census. PerfPlus cleanup captures written bytes before assertions and preserves a pre-existing empty sidecar directory.

## Test changes

`gbcRoutes.test.ts` restores **“buildGbcWorldPayload wire-shapes a real GbcWorld directly (unit, no HTTP)”** as an actual builder call with explicit sidecar input; the GET-world test again checks every placement plus map metadata and counts; the placement round-trip test records post-write bytes before response assertions; and the malformed-body test covers `null` plus `1e400` with guarded restoration.

`GbcWorldCanvas.test.tsx` makes the F5 `NearInterior` probe `TOWN`, preserving its pre-fit-culling purpose; pins drop coordinates/draw rectangle; covers changed/no-op/leave Shift drag; verifies a failed save clears after retry; and verifies visible errors for HTTP, network, JSON parse, and response-shape failures. `GbcApp.test.tsx` verifies a successful hidden-map drop ungreys the tree. `useGuardedFetch.test.ts` exercises POST request options and all guarded failure classes. Existing GbcApp/GbcWorldCanvas/guards/useGbcWorld fixtures retain the D1 `mapType` and `manual` migration.

## Verification

```text
npm test -- packages/server/test/gbcRoutes.test.ts -t 'GET /api/world|POST /api/world/placement'
# 8 passed, 71 skipped

npm test -- packages/ui/test/useGuardedFetch.test.ts packages/ui/test/gbc/GbcWorldCanvas.test.tsx packages/ui/test/gbc/GbcApp.test.tsx packages/ui/test/gbc/guards.test.ts packages/ui/test/gbc/useGbcWorld.test.ts
# 195 passed

npm run typecheck
# passed

npm test -- packages/server/test/gbcRoutes.test.ts -t 'writes a GBC manual placement'
# 1 passed, 78 skipped; serial real PerfPlus round-trip and cleanup
```

The UI run emits established jsdom `HTMLCanvasElement.getContext()` warnings only. No full suite ran. The GBA diff remains empty for `packages/server/test/world.test.ts`, `packages/ui/test/WorldCanvas.test.tsx`, and `packages/ui/test/world/visibility.test.ts`.

## Mutation proof

All mutation anchors matched exactly once, source buffers were restored in `finally`, and SHA-256 hashes matched after restoration.

| ID | Mutation result |
| --- | --- |
| `D1F-SERVER-FINITE` | Disabled finite-coordinate rejection; `1e400` returned 200 instead of 400. Restored routes hash `E162AF7EABA4E574855ED57D81B16F89C87133F9F52D58A28833B024B197232B`. |
| `D1F-POST-SHAPE` | Accepted any record response; the shape-failure UI case had no visible save alert. Restored canvas hash `5E292111790FC42BD8CD217870F0514350A8C0CAEC8990C0D88577B8E2E77963`. |
| `D1F-TREE-FRESHNESS` | Suppressed the successful-save callback; the hidden tree row stayed grey. Restored canvas hash unchanged. |
| `D1F-SHIFT-COMMIT` | Suppressed changed-drag persistence; the exact Shift-drag POST assertion failed. Restored canvas hash unchanged. |

`task-D1-spec-review.md`'s earlier `SR-W1-SHOWN-PREFIT-WITNESS` independently established that making the F5 probe drawable exposes the old ungated behavior.
