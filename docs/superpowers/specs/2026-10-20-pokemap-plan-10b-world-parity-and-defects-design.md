# Plan 10b: world parity, Duplicate, and the defects banner (design)

Written 2026-10-20 from `master` `63bd844`. Roadmap: `plans/2026-10-14-pokemap-roadmap-unified-ui.md`, Plan 10, split
"10b = D3 + F2, D6, D8". Decisions D1-D18 are binding and are not re-opened here.

## Intent

Close the last per-family gaps in the world view and the inspector, so both families show the same buttons and behave
the same (unified-UI goal, user 2026-10-13). Add one thing that is new for GBA: a defects banner that tells the user,
per map, about data problems that would break the build or cause gameplay bugs, with a pointer on how to fix each.

## Goals

1. **D3 manual placements in GBA, with F2.** Dragging a greyed map (from the tree or the Unplaced rail) onto the GBA
   World canvas un-greys its tree row at once, as GBC does through `onPlacementSaved`.
2. **D3 dungeon filter cache in GBA.** The open dungeon's map filter keeps its `Set` identity across a pure rename.
3. **D3 defects banner in both families,** with a shared component, a shared check catalogue, and a fix pointer on
   every entry.
4. **D6 Duplicate in the GBA inspector,** matching GBC's Duplicate.
5. **D8 in GBC:** the Dungeon auto-layout toggle and the Unplaced maps rail.
6. After this plan the flags `manualPlacements`, `defectsBanner`, `dungeonFilterCache`, `worldBar.dungeonAutoLayout`
   and `worldBar.unplacedRail` are true in both families. Each is deleted together with its branches (a flag both
   families set true is dead code), and the capabilities test is updated to match.

## Non-goals

- GBC Add Event from scratch (Plan 14, D6). GBA keeps Add Event.
- Auto-fixing defects. The banner points at the fix; it never edits the source to fix it.
- A project-wide defects report. The banner is per map.
- Everything listed out of scope in the session brief: ledger F-5, undo for saves, crash-mid-swap durability, the 10a3
  deferred minors, Sign tool minors, GBC CLI indicator commands, `issues-5-6-warp-popups`, Plans 11+.

## Anti-goals

- A banner that cries wolf. A check that fires on correct decomp data (the clean pret/PerfPlus/subject maps) is a bug.
  Every check is measured against the real subjects before it ships.
- Any save path that drops bytes the user did not edit (LESSONS: Editing Sessions & Save Safety).

## User rulings (2026-10-20)

- **R1. What the banner lists:** any error that would prevent a build or create gameplay issues.
- **R2. Size mismatch is not read-only, in either family.** A layout whose blockdata size disagrees with its declared
  width x height stays editable, and the banner says clearly that the mismatch is there, with a pointer on how to fix it.
  This changes GBC: today a mismatched `.blk` loads with `writable: false` and paint tools are disabled.

## Design

### Defects: model and wire

- Extend the shared `DataDefect` (`core/src/gbc/model/types.ts`, move it to a family-neutral module and re-export) with
  `kind: "build" | "gameplay" | "size"` and `fix: string` (one sentence: what to change, in which file). Existing GBC
  defects get a kind and a fix.
- **GBA:** new `GET /api/defects/:map` returning `{ defects: DataDefect[] }`, computed from disk on each request (no
  cache; a reload after save shows the new state). **GBC:** keeps `defects` in its map payload.
  - My call: a separate GBA route, because the GBA map payload is assembled from several hooks and adding one more field
    to each would touch more code than one route.
- The UI fetches defects when the selected map changes and again after every successful save of that map.

### Defects: the check catalogue (v1)

Each check names its family, kind and fix pointer. "Build" means the decomp would fail to assemble/compile; "gameplay"
means it builds but misbehaves in game.

| # | Check | GBA | GBC | Kind |
|---|---|---|---|---|
| C1 | Blockdata size differs from width x height | `map.bin` | `.blk` | size |
| C2 | Event outside the map's bounds | metatile grid | step grid (exists: `outOfBoundsEventDefects`) | gameplay |
| C3 | Metatile id out of range for the map's tilesets | yes | yes (save guard exists; add load check) | gameplay |
| C4 | Warp destination map does not exist | map id not in `map_groups.json` | map const not in `constants/map_constants.asm` | build |
| C5 | Warp destination warp index past the destination map's warp count | yes | yes | gameplay |
| C6 | Too many object events | over `OBJECT_EVENT_TEMPLATES_COUNT` (64) | over 15 (`MAX_OBJECTS`, exists in `gbc/edit/events.ts`) | gameplay |
| C7 | Event script label not defined anywhere in the project's script sources | yes | yes | build |
| C8 | Object sprite/graphics constant not defined | `include/constants/event_objects.h` | `constants/sprite_constants.asm` | build |
| C9 | Event flag constant not defined | `include/constants/flags.h` | `constants/event_flags.asm` | build |
| C11 | Map connection to a map that does not exist | yes | yes | build |

- C1 fix pointer names both ways out: change the declared size (GBA `data/layouts/layouts.json` width/height, GBC
  the map's `map_const` line in `constants/map_constants.asm`, SR7) or trim/extend the blockdata file to `w*h*2` (GBA) / `w*h` (GBC) bytes,
  and states the current and expected byte counts.
- C7-C9 use a project-wide symbol index (labels and constants) built once per project load, invalidated when the hub
  reloads the project **and after every successful commit that writes a script or constant source** (SR3). My call: label detection is a text scan (`^Label::?` in the script sources), not an assembler;
  `ponytail:` ceiling is macro-generated labels, which would read as missing. Each check must be measured against the
  three clean subjects (GBA subject, PerfPlus, pret pokecrystal) and must report zero there, except defects that are real
  (record each real one in the task report). A check that cannot reach zero false positives is dropped from v1 and
  recorded, not loosened silently.
- Special values the engine accepts are not defects (for example GBA `0` / `NONE` flags, `MAP_NONE` /
  `MAP_DYNAMIC` warp targets, GBC `-1` event flags). The builder lists the accepted specials per check from the decomp.

### Review rulings (Codex gpt-6-astra spec review, 2026-10-20; findings verified against code and subjects)

Report: `task-reports/pokemap-plan-10b-world-parity/spec-review.md`. Findings 1-13 are SR1-SR13.

- **SR1. C2 is per event kind, with engine conventions exempt.** GBA light sprites outside bounds are legal (Route101
  has `OBJ_EVENT_GFX_LIGHT_SPRITE` at (8,-4); `event_object_movement.c` spawns them camera-relative), and dummy warps at
  (-1,-1) are legal (ArtisanCave_1F). The builder lists each exemption with its decomp evidence. Route101 must show no
  banner (acceptance 2).
- **SR2. C7-C9 define their universe explicitly.** Sources: GBA `data/**/*.inc`, `data/*.s`, `include/constants/*.h`;
  GBC every `.asm` under the root (labels `Name:`/`Name::`, constants from `DEF`, `EQU`, `const`/`const_def` and
  `map_const`). Not defects: GBA script `0x0`/`NULL`, flag `0`/`FLAG_NONE`-class zero, graphics `OBJ_EVENT_GFX_VAR_*`,
  any expression containing `+`/`(` (checked only if every identifier in it resolves); GBC flag `-1`, `SPRITE_VARS`-range
  sprites. A check still noisy on a clean subject after this is dropped from v1 and recorded.
- **SR3.** Symbol-index invalidation after commits (above). Test: Add Sign, Save, no C7 defect without a project reload.
- **SR4. C10 is dropped.** A short `object_const_def` does not by itself break the build or gameplay (PerfPlus
  `MoveDeletersHouse` works). The existing GBC defect is kept out of the banner (not an R1 error).
- **SR5. GBC C6 is a load refusal, not a banner entry.** The GBC parser already refuses a map with more than 15
  objects (`gbc/load/events.ts:187`); that refusal message gains the C6 fix pointer. GBA C6 is a banner entry.
- **SR6. GBA keeps an odd trailing byte.** `parseBlocks` floors to whole words and the write replaces the file, so an
  odd-length `map.bin` loses its last byte today. The save keeps every raw byte past the encoded blocks; regression test
  with an odd-length file.
- **SR7.** GBC C1 fix pointer names `map_const` (above).
- **SR8. F2 inserts missing visibility entries.** `FamilyApp`'s merge only updates names already in `placed`; with
  auto-layout off a singleton has no entry. A placement adds the entry (or refreshes visibility). Acceptance covers tree
  and rail drops with auto-layout off and on.
- **SR9. A toggle or placement refreshes every world consumer.** The tree visibility (`useWorldVisibility`, GBA; the
  shell `/api/world` fetch, GBC) and the canvas resync after a toggle and after a placement. Test: a singleton greys
  when the toggle goes off and un-greys when it goes on, without a view switch. Manual entries, their sizes, and the
  sidecar's placements and accepted conflicts are untouched by the toggle.
- **SR10. A duplicated Indicator keeps the existing ownership guards.** The copy shares the script; both families already
  refuse Edit Indicator on a shared script ("shared script"), and that stays. The Sign tool's own ownership rules are
  unchanged. Removing either guard is out of scope.
- **SR11. Catalogue pins.** C3: GBA ranges are split-aware (primary/secondary with the gap, `write/guards.ts`); GBC
  block 0 is legal (border substitute). C4/C5: GBA indices are 0-based, GBC 1-based; GBA `MAP_DYNAMIC` and
  `MAP_UNDEFINED`, `WARP_ID_NONE`/`WARP_ID_DYNAMIC`/`WARP_ID_SECRET_BASE`, and GBC `-1` backup warps are not defects. C9
  includes hidden-item and trainer flags only where the event stores a flag constant. C11: GBC connections are checked by
  both name and constant.
- **SR12. R2 keeps the 10a3 fingerprint path.** `gbc/write/save.ts` already copies the full disk buffer and the
  fingerprint hashes full bytes. Tests: a tail changed on disk before preview is preserved; a tail-only change after
  preview gives 409 `PLAN_CHANGED` with no write. Every test that pins `writable: false` (core, server, CLI, UI) is
  updated, not only the paint-tool one.
- **SR13. Duplicate copies the full event.** The inspector's selected event is partial, so Duplicate reads the full
  current event from the session map and converts its normalized fields to `addEvent` insertion fields. GBA object ids
  come from array position (`mapjson.cpp`), so `local_id` is dropped from the copy. Tests: every event kind and subtype
  round-trips, edge placement.

- **SR14 (build, 2026-10-20). GBA C2 is dropped from v1.** After the SR1 exemptions the GBA subject still has 71 off-map
  events (60 objects, 9 warps, 2 bg), including proven-legitimate scripted staging (`SSAqua_RoomNW/scripts.inc:7-13`
  repositions off-map objects). Bounds alone cannot separate them from errors, so the zero-false-positive rule drops it.
  GBC C2 is decided in Task 4 against its own corpus. The GBA subject has no real C1; acceptance 2 uses a temporary
  `layouts.json` edit restored byte-for-byte.
- **SR15 (build, 2026-10-20). Partial checks are visible.** `GET /api/defects/:map` returns `{ defects, incomplete }`;
  when another map cannot be read, C4/C11 withhold unresolved targets and the banner says the checks may be incomplete.

### Size mismatch (R2)

- **GBA** already preserves a longer `map.bin`'s whole trailing blocks on save (`planBlockdataWrite` encodes the whole
  parsed array). It gains the C1 banner entry and keeps an odd trailing byte (SR6).
- **GBC:** a longer `.blk` loads editable. The session holds the declared `w*h` blocks; the save writes those blocks and
  keeps every byte past `w*h` exactly as it was on disk. The `layout-not-writable` refusal and the disabled-tools path
  are removed; the "not writable" footer becomes the C1 banner entry.
- **Shorter than declared** (zero cases in any measured corpus): both families keep refusing to load the layout, as
  today. My call: editing a short file would mean inventing the missing blocks. The refusal message gains the C1 fix
  pointer.

### Shared banner UI

- `shared/DefectsBanner.tsx`, used by both adapters in the Map view and the in-context World view (where GBC shows it
  today). It lists each defect with its kind label ("Build error", "Gameplay", "Size mismatch"), the message, the file,
  and the fix pointer. Not dismissible; it disappears when the map has no defects.
- Long lists: show the first 5 and a "Show all N" toggle (my call).

### GBA manual placements and F2

- Turn on the FamilyApp tree-visibility merge for GBA (today `caps.manualPlacements`).
- `WorldCanvas` gains `onPlacementSaved(name)`, called after `POST /api/world/placement` succeeds, for both drop sources
  (tree and Unplaced rail) and for a Shift-drag move. The GBA adapter passes `markManualPlacement`.
- Acceptance: drag a greyed map from the tree onto the GBA canvas; its row un-greys within one render, with no view
  switch or reload (the F2 repro in `task-reports/pokemap-plan-9-family-shell/task-12-live.md`).

### GBA dungeon filter cache

- `useDungeonFilter` is called with the cache on for both families (then the parameter goes away). Known effect: a
  dungeon rename in GBA no longer refits the canvas (matches GBC).

### GBA Duplicate (D6)

- `EventInspector` gets a Duplicate button next to Add Event, enabled when an event is selected, with the same in-flight
  guard as Add/Delete.
- It calls the existing `addEvent(kind, value)` with a copy of the full current event (SR13), moved one tile right
  (one tile left at the right edge; clamped to the map), exactly as GBC's `duplicateArgs` places it. Fields that must be
  unique are not copied: an object's `local_id` is dropped (SR13).
- The copy keeps the original's script label, as GBC does. A duplicated Pokémon Indicator therefore shares its script,
  and Edit Indicator refuses on both with "shared script" (SR10).

### GBC Dungeon auto-layout toggle and Unplaced rail (D8)

- **Server:** `POST /api/world/dungeons` `{ enabled }` for GBC, writing the shared sidecar's `dungeonAutoLayout`
  (remove `world/dungeons` from `GBA_ONLY_ROUTE_RE`). `buildGbcWorldPayload` honours the flag: off removes singleton
  components' maps that have no manual placement from `placements`, as GBA's `resolveWorldPlacements` does. The payload
  gains `sidecar: { dungeonAutoLayout }`.
- **UI:** move GBA's toolbar switch and `UnplacedRail` out of `WorldCanvas.tsx` into shared modules and use them in
  `GbcWorldCanvas`. A rail drop places the map, as a tree drop does, and fires `onPlacementSaved`.
- PerfPlus has no `.pokemap/` today (external baseline). Any live test of the toggle must remove what it creates.

## Constraints

- Saves use the fingerprinted all-or-nothing path (Plan 10a3): new tests that commit send `{ fingerprint }`.
- Gate before each commit touching `packages/`; external baselines and manifest hashes unchanged after live checks.
- Server suites share the subject's `.pokemap/`; never run two full suites at once.

## Acceptance

1. Gate green with the new tests; typecheck and UI build pass.
2. Live, GBA subject: F2 repro un-greys at once; Duplicate an object and a sign, Save, both present in `map.json`
   (restore after); defects banner shows on Navel Rock Zygarde chamber (C1, +561 blocks) with the fix pointer; a clean
   map (Route101) shows no banner.
3. Live, GBC PerfPlus: toggle Dungeon auto-layout off, a singleton leaves the canvas and appears in the Unplaced rail;
   drag it back from the rail, it places and its tree row is correct; toggle on; remove `.pokemap/` after.
4. GBC: a mismatched `.blk` (CeruleanCave2F/B1 class) paints and saves; the bytes past `w*h` are unchanged on disk.
5. Each C-check: a failing test with a fixture that has the defect, and a zero-defect run over the three clean subjects
   recorded in the task report.

## Left to the builder

- Module layout for the check catalogue and the symbol index.
- The exact fix-pointer wording (one sentence, names the file).
- How the GBC session keeps the `.blk` tail (re-read at save vs. hold at load), provided the 10a3 fingerprint covers the
  file's on-disk bytes.
