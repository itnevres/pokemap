# Task 10a fix-1 tests report

Risk: **High**. This hop extends the oracle only: independently constructed staged-pixel,
commit-boundary, event-closure, coverage and ownership-precedence checks across hub I/O,
shared caches and save/discard ownership. Scope: `packages/server/test/tilesetOverlay.test.ts`
plus this report. No `src` edits, no other test/fixture edits, no new dependencies.
Clean starting revision: branch `p14-2-t10` in worktree `wt-t10`.

## Sources read

- The test file itself, `packages/server/test/saveFingerprint.test.ts`,
  `packages/server/test/gbcSaveFingerprint.test.ts`,
  `packages/server/test/addEventRoutes.test.ts`, `packages/server/test/gbcAddEventRoutes.test.ts`,
  `packages/server/src/{index,gbcRoutes,gbcEditRoutes,addEventRoutes,blockEditOwnership,tilesetOverlay}.ts`,
  `packages/core/src/{project,gbc/project,gbc/load/tileset,gbc/analyse/atlas,edit/commands}.ts`,
  `packages/core/src/addEvent/{gbaBuild,gbcBuild}.ts`.
- Blocked: `C:\Programming Projects\PokeMap\.superpowers\sdd\...\task-10-rulings.md`
  (`permission.rejected: external_directory`) and the two named review files, which are not
  present under `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/` in this
  worktree. The fix-1 brief's own quotations of findings 1/2 (spec), findings 1/2 (quality),
  V1/V3 and mutations M10/M13 were therefore the binding source for this hop.

## Changes per letter

### A. Independent staged-pixel oracle (spec finding 2)

- `VisibleEdit` now carries `replacementPng: Buffer`.
- `visibleEdit` captures `replacementPng = await metatile(subject, subject.offset + other)`
  in the same discovery loop, **before any staging**, and reuses it as the staged-pixel
  expectation. Both the "different-looking saved metatile" and its HTTP PNG are selected
  before the session exists.
- Case 1: each staged thumbnail now equals its own `replacementPng`, and the existing
  `not.toEqual(originalPng)` and post-discard equality are kept.
- Case 3: the staged thumbnail equals `replacementPng`; the undo/redo/discard loop now
  expects `["undo", original], ["redo", replacementPng], ["discard", original]` rather than
  reusing the earlier staged capture as the redo oracle.
- Case 4: the thumbnail after staging equals `replacementPng` before the commit, and, for
  the successful save only, again after it. Existing `staged`-render and
  post-failure-equality assertions are kept.

### B. Commit-boundary sync (spec finding 1, quality finding 2)

- `import * as overlay from "../src/tilesetOverlay.js"`; the sync is observed with
  `vi.spyOn(overlay, "syncTilesetOverlay")` (calls through), cleared immediately before the
  commit request, and `spy.mock.results` read immediately after the commit response and
  **before any later HTTP request**. Only returned versions are compared, and only with the
  `tilesetVersion` of the payload captured before the commit.
- Successful save: at least one result; last result greater than the pre-commit payload
  version.
- New case `4b: a writer failure syncs at the pre-commit version and keeps the staged
  pixels`: stage, plan (no refusals), one-shot writer throw through
  `vi.spyOn(saves, "commitSave")` / `vi.spyOn(gbcSaves, "commitGbcSave")` with
  `mockImplementationOnce(() => { throw new Error("injected writer failure"); })`, commit
  non-200. Then: at least one sync result, last result equal to the pre-commit version,
  `store.has(map)` still true, render still equal to the staged render, thumbnail equal to
  `replacementPng`.
- The existing external-change failed save (disk appended before commit, refused before the
  writer) is unchanged; its spy is cleared but not asserted, because the brief names only
  the successful save and the writer failure.

### C. Event creation keeps staged tileset bytes usable (quality finding 1)

- New case `4c`, both families. New `findEventEdit` discovery requires the same visible
  edit as case 1 **and** an existing event source file (`data/maps/<map>/scripts.inc` for
  GBA, `maps/<map>.asm` for GBC).
- Sequence: stage; capture the staged render; create one event; then the session's
  `tilesetEdits` (read before any later request, because a successful commit closes the
  session) must be non-empty and every `edit.after` must satisfy `Buffer.isBuffer`; render
  answers 200 and equals the staged render; thumbnail equals `replacementPng`; undo (event)
  keeps `replacementPng`; undo (tileset) gives `originalPng`; redo twice gives
  `replacementPng`; plan has no refusals; commit is 200; the metatiles file on disk equals
  `candidate.plan.edits[0].after`.
- Disk is snapshotted in `finally` (metatiles, grid, event source, plus GBA `map.json`,
  because this commit writes events as well as tilesets).

### D. GBC coverage follows a staged collision edit (V3; M10 survivor)

- New GBC-only case `2b`. Discovery needs, from the before-coverage body, a map **not** in
  `fishGroupWithoutWater`, with a non-`NONE` fishing group (`gbc.maps`) and at least one
  water quadrant as observed through `GET /api/map`: `blocks[].metatileId` into the
  payload's per-metatile `collision`, then `collisionInfo[String(value)].category ===
  "water"`. No candidate is a loud error.
- Collision names: `constants/collision_constants.asm` is parsed as text for
  `DEF COLL_* EQU value`; `gbc.waterCollisionValues()` only selects which names are water
  (input construction, like the existing use of `gbcTilesetsForFile`). Every water token on
  every `tilecoll` line of that map's tileset collision file is replaced by a non-water
  token (`COLL_FLOOR` when non-water, else the first non-water constant). The edit is a
  text replace that keeps line count and CRLF (split/join on `"\n"`, `\r` left on each
  line), and asserts at least one replacement and changed bytes.
- Fetch `GET /api/coverage` before; stage the collision-only plan via `stageTilesetPlan`;
  fetch coverage again: it differs and lists the map in `fishGroupWithoutWater`; discard;
  coverage equals the before body. The collision file is disk-snapshotted and restored in
  `finally`; no disk write is expected.

### E. Owner precedence (V1; M13 survivor)

- New unit case inside the existing case-6 describe: entries `[["B", b], ["A", a]]` and
  `[["A", a], ["B", b]]`, both holding `tilesets/shared.bin` with different `after` Buffers.
  For each order, a fresh state/project spy: one `setTilesetOverlay` call, one cache clear,
  version 1, and the applied map holds **A's** Buffer identity (`toBe`, and `not.toBe` B's).
  This pins the alphabetically-first map name as the winner regardless of input order.

## Event body chosen

An NPC object event with a new script and one text line needs no new flag or var. Copied
from the 14.1 route tests' `npc()` helper:

- GBA: `{ kind: "object", objectType: "npc", x: 1, y: 1, fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER" }, script: { mode: "new", label: "<Map>_EventScript_PokemapOverlayOracle", text: "HELLO" } }`
- GBC: the same shape with `fields: { sprite: "SPRITE_YOUNGSTER" }` and label
  `"<Map>PokemapOverlayOracle"`.

Labels are map-derived to avoid the project's existing labels; the candidate map is chosen
with an existing event source file so a generated-script append has somewhere to go.

## Interpretations and boundaries

- The brief's findings are quoted as the source of A-D; the rulings/review files themselves
  could not be read in this session (see Sources). No ruling text beyond the brief was
  available, so nothing in this hop contradicts or extends it.
- `replacementPng` is the HTTP PNG already fetched to prove the source metatile looks
  different; it is reused as the staged expectation (same rendering context, same layout,
  same tileset half via `subject.offset`). No renderer/planner/overlay internals compute
  expected bytes.
- Case 4's failed branch keeps its old oracle (non-200, staged render survives, map version
  unchanged). The new sync readbacks are asserted only where the brief names them; the
  external-change refusal never enters the writer and is deliberately not pinned to a sync
  count.
- Writer-failure assertions accept any non-200 (the brief says non-200); the implementation
  currently answers 500. `mockImplementationOnce` keeps the spy calling through if the route
  ever attempted a second write.
- Case C's `Buffer.isBuffer` check runs immediately after the create, before the render
  request, because both a successful commit and any later HTTP turn could hide the defect.
  "Restore disk in `finally` as case 4 does" is honoured and widened to the files this
  event-carrying commit writes.
- Case D uses HTTP coverage bodies as the only oracle. `gbc.waterCollisionValues()`,
  `gbc.maps` and the parsed constants file are discovery/fixture construction, mirroring the
  suite's existing use of `gbcTilesetsForFile` and `gba.layoutForMap`. `fishGroupWithoutWater`
  membership is asserted only from the two HTTP bodies.
- Case E is unit-only and tests `syncTilesetOverlay` directly, in case 6's fake-entry style;
  the winning buffer is identified by identity, not bytes.

## Expected red/green on today's code

- **Red**: case `4c` in both families. GBA's `addEventRoutes.create` does
  `structuredClone(entry.session)`, so the pushed snapshot's `tilesetEdits[].after` becomes
  `Uint8Array`; `Buffer.isBuffer` fails, and rendering/thumbnail after the create throws in
  the GBA tileset loader (`readUInt16LE`). GBC also fails the `Buffer.isBuffer` assertion
  (its metatile loader tolerates `Uint8Array`, so the render assertion may survive there,
  but the buffer contract does not).
- **Green today**: A (cases 1, 3, 4), B (case 4 success and new 4b), D (case 2b) and E.
  D and E are the new coverage of the M10/M13 mutation survivors, so they must pass now and
  fail under those mutations.

## Verification

`npm run typecheck` could not be executed in this session: every shell invocation (and a
subagent's) was refused by the sandbox with `permission.rejected: shell` before the process
started. Per the brief, no vitest/`npm test` process was started either. The test file was
reviewed statically against the repo's `strict` + `noUncheckedIndexedAccess` config
(immediate `finally` restores, `!` on indexed reads, namespace-only overlay import).
The conductor must run the typecheck (and later the gate) for this hop; no verification
claim is made here.
