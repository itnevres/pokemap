# Task 5 report: wire the ledger into both world canvases (F1-F6)

Tier: High (async ordering across fetch, reload and React state in two families). Tests: Claude wrote the oracle first (deferred fetches). Implementer: Codex `gpt-6.1-sol` (Opus-tier chain, Codex hop: 4 files) in a scratch worktree, from a design brief; passed first try. Its sandbox could not run vitest (EPERM); Claude ran every check. Claude then changed one existing test fixture (below).

## Changes

- `shared/placementLedger.ts`: `versionedMaps()` (every map that has had a version), plus one test.
- GBA `components/WorldCanvas.tsx`: `placementEdits`/`savedPlacementEdits`/`settlePlacementEdits` gone. One version per gesture: a map drag calls `begin` on its first mousemove (stored on the drag), a group drag gives each member its own version on its first mousemove, a rail drop calls `begin` at the drop. Commit: moved → `moved` + POST, outcome → `resolve`; unchanged map or group member → `noop`; a drag with no mousemove has no version and does nothing. After all POSTs of one commit settle, one reload, also when every POST failed (F5). The `/api/world` effect snapshots the ledger when it issues the GET; at landing the keep-local set is computed outside the updater (F4), and the updater only reads `previous`.
- GBC `gbc/GbcWorldCanvas.tsx`: `savedOverrides`/`settledOverrides` gone. `reloadWorld` wraps the hook's `reload`, storing a snapshot per generation; the reconcile effect on `[world, loadedGen]` uses that generation's snapshot (an empty one for the first load), computes the keep set outside the updater and filters the overrides by it. Same begin/moved/noop/resolve flow; a failure also reloads (F5).
- GBC `gbc/hooks/useGbcWorld.ts`: `loadedGen` (generation whose GET produced `data`; 0 first) and `reload(): number` (ref counter, returns the new generation synchronously).
- Keep-local rule (both): `!serverShows(name, snap) || (!(name in server) && !dropAbsent(name, snap))`, honouring Task 4's "acknowledged is never dropped".

## Tests

`test/world/placementResync.test.tsx` gains a deferred server (every POST and every GET after mount resolved by hand; a GET's body is the server state when issued; a POST changes it when resolved ok) and, per family: late failure after a newer gesture; no-op during an in-flight save that succeeds / fails, then a later server move; a GET issued before an acknowledgement landing after it, plain and under StrictMode (F4); A→B→A with B in flight; a gesture between a failure and its reload; a failed save reverts once its reload lands; a failed rollback reload keeps the local position and the save error (GBC only, see rulings). Plus GBA unchanged group members during an in-flight save. `test/gbc/useGbcWorld.test.ts`: `reload()` returns 1, 2; `loadedGen` 0 then 2.

Red run (HEAD `d428c5e`, old code): placementResync 12 failed / 19 passed / 1 skipped; useGbcWorld 1 failed (`loadedGen` undefined). Failing for: no reload after a failed save (F5: late failure, gesture between failure and reload, failed save reverts; GBC failed rollback), and the old server position shown (F2/F3: both no-op cases both families, GBA group). Passing on old code, so covered by mutation only: A→B→A, stale GET plain and StrictMode.

Harness note: the position probe polls on a timer, not `waitFor`. Each probe changes the hover text, which re-triggers `waitFor`'s MutationObserver forever (microtask starvation; its timeout never fires). The first red run hung a vitest worker for hours this way.

## Existing test changed

- `test/gbc/GbcWorldCanvas.test.tsx` "dropping a hidden map reveals it locally and persists its manual position": its fake server ignored the POST and returned the same object for every GET. Old code kept the drop only because React skipped the identical `data` object, so the override filter never ran. Under F3 the GET after the acknowledgement shows the server position, so the fake server now applies the POST (the realistic server). No assertion changed.

## Mutations (one at a time, byte-restored; harness `mut5.py`)

| Mutation | Result |
|---|---|
| M1 GBC no-op settles at once (plan step 3) | 2 failed |
| M2 GBA failure without reload, F5 (plan step 3) | 4 failed |
| M3 GBA skips the ownership check when a GET lands (plan step 3) | 7 failed |
| M4 GBC skips the ownership check when a GET lands | 5 failed |

## Rulings

| Item | Ruling | Cost if wrong |
|---|---|---|
| GBA `dungeonsPending` | Still cleared by any world landing, now including placement reloads; F12 (Task 6) replaces that rule. | Switch flicker until Task 6 |

## Gate

First commit `2b3c8d2`: 3,496 pass / 0 fail / 1 skipped (the GBA failed-rollback case, unskipped in fix round 1) / 217 files; typecheck and UI build pass. `git diff --stat -- packages/ui/test`: placementResync, useGbcWorld, placementLedger (additions) and the one GbcWorldCanvas fixture above.

## Review fix round 1

Spec (astra, thread `01a16f83-d6cd-7c92-a010-b4f57693fb14`) ❌ 0/3/0; quality (astra, thread `01a16f83-d6cd-7ec2-b840-47c91f1e2149`) Changes requested 0/1/2. Each finding verified against the code; all accepted:

- Spec I1, GBC snapshot taken at `reload()` call, not at GET issue: a gesture beginning in between and ending as a no-op stays pinned with no further reload. Fix: `useGbcWorld(enabled, onIssue)` calls `onIssue(gen)` as each GET is issued; the canvas keeps only the latest `{ gen, snap }` (quality minor 3, snapshot growth, closes with it). Hook test: two batched reloads issue once, for generation 2, before its fetch.
- Spec I2 = quality I1, stale-GET tests never reached reconciliation (the reload after the acknowledgement cancels the stale GET): the stale GET is now released in the same tick as the acknowledgement, landing before the reload can cancel it.
- Spec I3, GBA rollback case skipped without cause: the load-error placeholder sits above a still-rendered canvas, so the case runs; unskipped (both families).
- Quality minor 2, the older failed-POST test expected 2 GETs: F5 adds the rollback GET, so it expects 3 for that case.

Mutations added (same harness): M5 GBA `serverShows` against current state → 2 failed (both stale-GET cases); M6 GBC same → 2 failed; M7 GBC no snapshot at GET issue → 6 failed. Unmutated: 39/39.

Gate after fix round 1: 3,498 pass / 0 fail / 217 files; typecheck and UI build pass.

## Review fix round 2

Re-reviews (astra, resumed threads): spec ❌ 0/1/1, quality Changes requested 0/1/0. Verified; all accepted:

- Spec I (new): with only the latest snapshot kept, a rollback GET landing in the same batch as a newer GET's issue lost its own snapshot to that issue and reconciled with the empty one, keeping the failed position; if the newer GET then failed, it stuck. Fix: snapshots kept per generation; the reconcile effect uses `loadedGen`'s and prunes older generations. New test (both families): failed save, rollback GET released in the same tick as another save's acknowledgement (which issues a newer GET), the newer GET fails; Neighbour shows the server position. M8 (keep only the latest snapshot) fails it.
- Spec minor = quality I: M7 in `mut5.py` had a literal CRLF inside a string, so the harness did not parse; fixed.

Mutations rerun, all eight, one at a time, byte-restored: M1 2, M2 7, M3 9, M4 7, M5 2, M6 2, M7 7, M8 2 failed. Unmutated: 41/41.

Gate after fix round 2: 3,500 pass / 0 fail / 217 files; typecheck and UI build pass.
