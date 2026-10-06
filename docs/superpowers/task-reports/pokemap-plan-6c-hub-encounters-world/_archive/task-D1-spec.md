# Phase D1 executed spec — GBC visibility and manual placement

## Authority and limits

Plan 6c §D1 and user decisions U1–U4 bind this task. D1 changes GBC behavior only. GBA behavior and tests remain unchanged. GBC placement POST writes only `.pokemap/world.json`.

## Measured baseline facts

- `data/maps/maps.asm` has 391 maps: TOWN 23, ROUTE 54, CAVE 42, DUNGEON 39, INDOOR 208, GATE 25. TOWN/ROUTE/CAVE/DUNGEON total 158 shown; INDOOR/GATE total 233 hidden. Re-run the census from source before implementation.
- `GbcWorldCanvas.tsx` has one `view` state containing zoom, pan and fitted state. Keep one state; never call a setter inside another setter's updater.
- `GbcWorldCanvas.tsx` has no placement drag. Port map dragging from the `WorldCanvas.tsx` anchor found by `rg -n 'drag\?\.kind === "map"'`; do not cite line numbers.
- GBC `/api/world` currently uses `buildGbcWorldPayload(getWorld())`. The GBC routes currently reject `/api/world/placement` with 501. Re-measure both before editing.
- `readSidecar`/`writeSidecar` use `projectPaths(root)` and appear family-agnostic. Prove actual PerfPlus round-trip; restore bytes read-guardedly in `finally`.
- Test collision scan found the existing real subject world-sidecar writer in `packages/server/test/world.test.ts`; UI `WorldCanvas.test.tsx` only mentions the file in a comment. Core sidecar/dungeon writers use temporary roots. Re-run collision scan before adding the PerfPlus write test.

## Required changes

1. GBC world placements include `mapType` (the GBC environment) and `manual`; update the runtime payload guard accordingly.
2. Default visibility is family-aware: GBA hidden kinds remain `{MAP_TYPE_INDOOR, MAP_TYPE_NONE}`; GBC hidden kinds are `{INDOOR, GATE}`. Do not change GBA result or existing GBA tests.
3. GBC tree entries for hidden/unplaced maps gray out consistently with GBA. Manual placements override hidden kinds.
4. Port GBA map drag-to-place behavior to GBC canvas, including the same placement request and error handling. Keep one GBC view state.
5. Add GBC `POST /api/world/placement`, mirroring the GBA request/response shape and per-operation validation helper. It changes only `.pokemap/world.json`.
6. Add tests for 158/233 visibility split, a PerfPlus sidecar manual-placement round-trip with read-guarded restoration in `finally`, and hidden-map drag revealing/persisting the map.

## Existing tests affected

- `packages/server/test/gbcRoutes.test.ts`: remove only the existing 501 expectation for `POST /api/world/placement`; replace it with the D1 success/validation coverage. Keep other GBA-only route refusals unchanged.
- No existing GBA tests may change. Report the exact diff check for `packages/server/test/world.test.ts` and GBA UI tests.

## Test and mutation requirements

- TDD: each new assertion red-proved before implementation.
- Red-prove new tests by an in-memory source mutation before commit; coordinator reruns surviving mutations on final fix commit.
- Every requested mutation ID must be reported. Literal anchor must match exactly once; restore in memory; byte-compare after restore.
- PerfPlus test snapshots `.pokemap/world.json` existence and bytes; use a read-guarded restore in `finally`; it must leave absent state absent if absent initially. No concurrent tests write this PerfPlus file.
- Do not add dependencies or `jest-dom`; use existing CSS tokens, never `.btn`. Fetches use `fetchGuarded`/`useGuardedFetch` with shape guards and visible errors; every `.then` has visible `.catch`. Long-text flex children get `min-width: 0`.

## Required report

Write full implementer/reviewer/fix reports under `docs/superpowers/task-reports/pokemap-plan-6c-hub-encounters-world/`. Each agent returns one status line and report path. Commit report/spec paths explicitly.

## Pre-dispatch contradiction check

- The visibility rule and manual override agree: manual placements always draw even when their map type is hidden.
- The plan requests the GBC POST but also requires no GBA behavior change; separate family routing and assert unchanged GBA tests.
- PerfPlus has no `.pokemap/` at baseline, so a successful write test creates the directory; restore removes the created file/directory only when still empty and still matching the test's written state.
- The plan says use the existing GBA drag behavior, not introduce GBC-only view state. Preserve the existing single `view` object.

## Known environment caveat

The required baseline suite changed the GBA subject `.pokemap/world.json` SHA-1 from the recorded start `4983f9725c7e763a2c7f205912bf2ce7428a757f` to `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f`; exact original bytes are unavailable. Current hash and other starting facts are in `task-D-preflight.md`. Do not claim the GBA sidecar is unchanged at close-out. Preserve current bytes from this point and report the discrepancy.
