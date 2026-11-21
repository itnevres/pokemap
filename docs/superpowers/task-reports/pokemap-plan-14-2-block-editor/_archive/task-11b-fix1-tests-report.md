# Task 11b fix round 1: tests only

Baseline: `4c56e754d209a3bcae06827ab6aba0780b266bc7` (`p14-2-t11b`), initially clean worktree.
Risk: High, because these tests define error-boundary and independently derived append oracles.
The supplied brief is the acceptance spec. Only the shared suite and this report changed;
no route, planner, dependency, configuration, or fixture edits. No commits made.

## Cases and fixture selection

The new cases add 18 test instances across the two families: five malformed-cell variants,
one outside-map case and one real-refusal case per family, plus four GBA attribute cases.
Both actions are exercised in each instance. Expected values come from literals, earlier
GETs, the disk-loaded project profile/map headers, or direct pre-apply disk reads.
No expected result is copied from the action under test.

Concrete runtime fixture names were **not discovered in this session**: Vitest was not run,
and no corpus files outside this worktree were inspected. The selectors below describe
exactly which temporary-copy fixtures the conductor's run will select, rather than claiming
unobserved fixture discoveries. Existing suite setup copies the subjects into temporary roots;
new cases do not write disk files and close all sessions in `finally`. Existing suite cleanup
restores its GBC collision extension and removes the temporary roots.

- **11b.12 / B16a:** Uses `pair.a`, `idFor()` and its earlier block GET, then `changedDraft(data)`
  with `saveAsNew` from `map`. Separate instances cover null, array, missing y, string x and
  fractional x. Both actions must return exactly `{ error: string, code: "BAD_VALUE" }`
  with error matching `^request\.cell`. Store presence and undo depth must remain unchanged;
  `undoDepth` uses `historyLength` only for an already open session, so observing a closed
  store does not open it. Expected **red** today for both families: GBA null dereferences
  `cell.x` and returns 500; the other malformed GBA shapes and all five GBC shapes reach
  planner cell validation and return a map-prefixed error rather than `request.cell`.
- **11b.13 / B16c:** Uses `pair.a` and its map GET's `layout.width` for x (GBC fixture width
  is four), y zero, valid changed draft, `saveAsNew` from `map`, and the block GET revision.
  The cell is structurally valid but outside the grid. Both actions must return 400
  `BAD_VALUE` with `/cell is outside the map/`, preserving the planner message. Expected
  **green** today. Cell validation precedes shared-grid and append-cap refusals.
- **11b.14 GBC / B16b:** Uses `pair.a` and `idFor()`; selects the first name in the earlier
  GET's `options.palettes` different from `block.tilePalettes[0]` (throws if none exists).
  Adds exactly `{ square: 0, palName, scope: "all" }` to the changed draft, `saveAsNew`
  from `palette`. In `gbcOps.ts`, palette entries are keyed by the drafted tile, then
  `changes` retains entries where `initialPalette.names[tile] !== entry.palName` and
  `all` retains those with scope `all`. The exact refusal condition is
  `if (req.mode === "saveAsNew" && all.length)`.
  Thus the request reaches an actual `ALL_WITH_SAVE_AS_NEW` refusal, rather than a no-op
  palette entry or synthesized stale response. Check must return 200 with that refusal,
  string error and false confirm; apply must return 409 with that code and string error.
  Session presence, history and changed staged edits are checked after each action.
  Expected **green** today. No partial GBC append is hand-staged.
- **11b.14 GBA / B16b:** Sorts all disk-loaded map names, resolving each map header through
  `gba.layoutForMap`, and selects the first map whose layout's `blockdataFilepath` is used
  by at least two maps. Throws exactly `fixture needs a shared GBA grid` if none exists.
  Reads the block at (0,0), uses its changed draft and revision, and requests `saveAsNew`
  from `map` at (0,0). In `gbaOps.ts`, `mapsByGridFile(proj)` groups all map names using
  their disk-loaded layouts; within `req.mode === "saveAsNew" && req.from === "map"`,
  `if (sharing.length >= 2)` throws `SHARED_GRID`. Sharing maps need **no open sessions**.
  The shared-grid refusal precedes the append split-limit refusal. Pins check 200,
  refusal `SHARED_GRID`, false confirm, apply 409, string errors and unchanged session
  presence/history/staged edits. Assertion diagnostics include the selected map name.
  Expected **green** today.
- **11b.15 GBA / B16c and B14a:** Uses `pair.a`, `idFor()` and its earlier GET. Reuses the
  preview range case's profile-based derivation: unsigned layer mask, shift from its lowest
  set bit, then `mask >>> shift`; behavior uses `metatileBehaviorMask`. Four instances set
  behavior to mask + 1 or `2 ** 32`, and layerType to shifted mask + 1 or `2 ** 32`.
  Both actions must return 400 with exactly a `BAD_VALUE` error body and the corresponding
  `draft.behavior` / `draft.layerType` prefix. This catches missing upper-bound comparisons
  that allow 32-bit bitwise wrap. Expected **green** today; current route validation
  rejects these values before invoking the planner.
- **11b.6 / B16d:** Retains the existing private-grid/append-room fixture selectors
  (`findGbaSaveAsNew` / `findGbcSaveAsNew`) and visible source-block scan. Immediately
  before apply, reads `files[0]`'s byte length and `files[1]`'s bytes directly from the temp
  copy. GBC collision record count is also captured before apply using the existing
  `tilecoll` regex. Staged metatiles must equal disk length + 16, GBC collision records
  disk count + 1, and GBA attributes disk length + 2. Neither append baseline comes from
  staged `before` bytes. All other existing assertions remain intact; GBA gains its
  companion attribute-length assertion. Expected **green** today.

## Verification

- `npm.cmd run typecheck`: passed, exit 0 (both root and UI TypeScript projects).
  Uses the Windows npm executable for the requested `npm run typecheck` script.
- `git diff --check`: passed, exit 0; Git reports its existing LF-to-CRLF conversion notice.
- Vitest, `npm test`, full gate, UI build and mutation checks: **not run**, per this
  tests-only brief. Runtime red/green expectations above are source-derived predictions,
  not measured results. The conductor owns runtime and mutation verification.
