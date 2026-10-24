# Task 4 report: placement-version ledger

Tier: High (the async-ordering model itself; a wrong rule is silent in the UI). Tests: Claude wrote the oracle first (`packages/ui/test/shared/placementLedger.test.ts`). Implementer: Aider + Nemotron 3 Ultra (free, Opus-tier chain hop 1), one file, passed first try. Claude then edited inline (small): `dropAbsent` called `this.serverShows` (breaks when destructured) → a closure function; the snapshot was a `Record` keyed by map name (a map named `constructor` would read `Object.prototype`) → a `Map`; `moved`/`noop` created a phantom map entry for an unknown map → read-only lookup; repo quote/export style.

## Module

`packages/ui/src/shared/placementLedger.ts`: `createPlacementLedger()` returns `begin`, `moved`, `noop`, `resolve`, `snapshot`, `serverShows`, `dropAbsent`. Versions come from one counter shared by all maps. Per version: pending / acknowledged / failed / settled. A no-op waits on the map's latest still-pending moved version and takes its outcome; with none, it is settled at once. `snapshot()` copies each map's latest version and whether it was resolved. `serverShows(map, snap)`: true for a never-moved map; otherwise only when the map's latest version now is the one `snap` recorded and it was resolved then. `dropAbsent`: `serverShows` and the latest version failed or settled. No positions, no React.

Builder's choices within the spec: `dropAbsent` returns false for an acknowledged version (the spec names only failed and settled); a no-op inherits the latest in-flight POST when several are in flight.

## Tests (20)

Never-moved map; moved→ack→later GET; stale GET (issued before the ack); GET issued before the gesture began; gesture in progress; A→B→A with B in flight; late failure of v1 after v2 began; older success never resolves newer; no-op with nothing in flight; no-op during an in-flight POST that succeeds, and that fails (then dropped if absent); no-op inherits the latest of several in-flight POSTs; no-op after the POST landed; failure then a newer gesture before the rollback GET lands; failed rail drop leaves the world; acknowledged save never dropped; failed save drops only on a GET issued after the failure; group members with mixed outcomes and an unchanged member; distinct versions; a snapshot is a value.

Red run: module missing ("Failed to resolve import"), no tests ran. Green: 20/20.

## Mutations (each one alone, then restored; bytes compared)

| Mutation | Result |
|---|---|
| M1 no-op settles at once (plan step 3) | 3 failed |
| M2 `serverShows` ignores the snapshot, reads current state (plan step 3) | 6 failed |
| M3 ignore version identity: "resolved at issue" alone, as a same-position check would (plan step 3, coordinates variant: the ledger API holds no positions, so the version-identity check is what a coordinate comparison would replace; the coordinate case proper is pinned by Task 5's A→B→A component test) | 1 failed |
| M4 `dropAbsent` ignores state | 1 failed (survived first; the acknowledged-save test was added for it) |
| M5 no-op waits on the oldest in-flight POST | 1 failed |

## Gate

3,475 pass / 0 fail / 217 files; typecheck and UI build pass.
