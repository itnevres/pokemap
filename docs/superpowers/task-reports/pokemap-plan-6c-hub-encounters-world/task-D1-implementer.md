# D1 implementer report — GBC visibility and manual placement

## Delivered scope

Implemented the D1 GBC-only payload, visibility, placement, and UI changes.

- `GbcWorldPayload` now supplies each placement's `mapType` and `manual` flag. `GET /api/world` merges the family-agnostic sidecar before building that wire payload.
- GBC `POST /api/world/placement` reuses `readBody` and mirrors the GBA route's JSON parsing, shape validation, `{ ok: true }` response, and visible 500 response for asynchronous failures. The GBA-only refusal list no longer includes this route; other GBA-only routes remain refused.
- The GBC visibility rule is `INDOOR` plus `GATE`, while the existing GBA hidden set remains `MAP_TYPE_INDOOR` plus `MAP_TYPE_NONE`. `MapTree` receives its hidden set from the GBC app, and manual placements override hidden map kinds.
- `GbcWorldCanvas` keeps its single `{ zoom, pan, fitted }` view state. It supports Shift-dragging an existing shown map and a tree drag/drop of a hidden map. Both update a local manual override immediately, POST the placement, and show an alert on save failure. Tree drops center the map under the pointer, matching `WorldCanvas`.
- The GBC world guarded-fetch hook is mode-gated for the tree visibility data. The guarded shape checks require both new placement fields and errors are visible in the app.

## Tests and TDD proof

Initial tests were added before implementation and red-ran against the original code. The server test observed all 391 placements as visible where D1 expects 158 shown / 233 hidden, and its malformed placement request reached the prior unsupported route. UI tests red-ran because the old guard accepted a placement lacking the new fields, hidden GBC maps did not draw after a drop, and the tree did not gray an automatic indoor map.

Each implemented assertion also received an in-memory mutation proof. Every source file was restored from its in-memory bytes and SHA-256-compared after the run.

| Mutation ID | Mutation and red result |
| --- | --- |
| `D1-GUARD-MAPTYPE` | Removed the `mapType`/`manual` requirement from `isGbcWorldPayload`; `packages/ui/test/gbc/guards.test.ts` failed the new missing-field assertion. Restored hash: `29BF6E7758C3403A0DD0FB6A2509418BAE4185FD3BD967CE118AD9CF402A4F86`. |
| `D1-CANVAS-MANUAL-VISIBILITY` | Made the canvas hide an `INDOOR` map even when manual; the hidden-map drop test failed because no `Interior` image appeared. Restored hash: `285530B7A0B4B2449E183C9208B08BDBB75046B07A69FA65157BD97720F87DCA`. |
| `D1-ROUTE-PLACEMENT` | Disabled the GBC placement route in memory; the malformed-body test failed with `404` instead of `400`. Restored hash: `37DF543435FEA851C18898023264239FAE315E87F585495602467C1DBC25E8D9`. |

Final narrow verification passed:

```text
npm test -- packages/server/test/gbcRoutes.test.ts -t 'deep-equals Object|rejects malformed placement bodies'
# 2 passed, 76 skipped

npm test -- packages/ui/test/gbc/guards.test.ts packages/ui/test/gbc/GbcWorldCanvas.test.tsx packages/ui/test/gbc/GbcApp.test.tsx packages/ui/test/gbc/useGbcWorld.test.ts
# 173 passed

npm run typecheck
# passed
```

The UI test run emits its established jsdom `HTMLCanvasElement.getContext()` warnings; no test failed. The focused hidden-map drop test was rerun after centering its drop coordinates and passed.

## PerfPlus sidecar and collision handling

Before adding the write test, `rg -n -F '.pokemap/world.json' packages` found the real GBA subject writer only in `packages/server/test/world.test.ts`; UI has no writer, and core tests use temporary roots. The D1 server test snapshots `world.json` existence and bytes, then in `finally` restores only when the currently-read bytes still equal the bytes written by the test. For the baseline absent sidecar it unlinks only that same written file and attempts to remove the now-empty directory.

The initial sandboxed attempt could not create the absent `.pokemap` directory: `writeSidecar` failed on `mkdir C:\\Programming Projects\\pokecrystal-PerfPlus\\.pokemap` with `EPERM`, so that attempt observed the server error response. A later escalated run completed the required real round trip successfully: `npm test -- packages/server/test/gbcRoutes.test.ts -t 'writes a GBC manual placement'` passed (`1 passed, 77 skipped`). Its transcript is `d1-perfplus-write.log`. The test's read-guarded `finally` restored the original absent state; the final `Test-Path` confirms `C:\\Programming Projects\\pokecrystal-PerfPlus\\.pokemap\\world.json` remains `False`.

No full suite was run. The exact GBA diff check is empty for `packages/server/test/world.test.ts`, `packages/ui/test/WorldCanvas.test.tsx`, and `packages/ui/test/world/visibility.test.ts`. This does not make a claim about the already-documented external GBA sidecar hash discrepancy from `task-D-preflight.md`.
