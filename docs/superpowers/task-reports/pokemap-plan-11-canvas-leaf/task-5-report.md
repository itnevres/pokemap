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
| GBA failed rollback reload | Its test lands in Task 6: until F11 a failed GBA reload replaces the canvas with the load-error placeholder, so the local position cannot be probed. The GBA case is `skipIf`'d with that reason. | One missing GBA case until Task 6 |
| GBC snapshot timing | Taken when `reloadWorld` is called, just before the effect issues the GET. Anything that changes in between only makes the snapshot older, which keeps local (conservative); every resolve also issues its own reload. | A one-reload delay in showing a server position |
| GBA `dungeonsPending` | Still cleared by any world landing, now including placement reloads; F12 (Task 6) replaces that rule. | Switch flicker until Task 6 |

## Gate

3,496 pass / 0 fail / 1 skipped (the GBA failed-rollback case, Task 6) / 217 files; typecheck and UI build pass. `git diff --stat -- packages/ui/test`: placementResync, useGbcWorld, placementLedger (additions) and the one GbcWorldCanvas fixture above.
