# Plan 10b: world parity, Duplicate, and the defects banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the GBA/GBC gaps of roadmap D3 + F2, D6, D8, and add a per-map defects banner (build and gameplay errors, each with a fix pointer) to both families.

**Architecture:** A family-neutral `Defect` model and check catalogue in `packages/core/src/defects/`, one per-family check module each, served by GBA `GET /api/defects/:map` and the GBC map payload, rendered by one shared `DefectsBanner`. The world-bar pieces (`UnplacedRail`, dungeon toggle) move out of GBA's `WorldCanvas.tsx` into shared modules and are wired into `GbcWorldCanvas`; GBC's server gains the dungeon toggle. The five per-family flags become true for both and are deleted.

**Tech Stack:** TypeScript, React, Vitest, Node http server (existing).

**Spec:** `docs/superpowers/specs/2026-10-20-pokemap-plan-10b-world-parity-and-defects-design.md` (user rulings R1-R2, review rulings SR1-SR13). Read it with this plan.

## Global Constraints

- Branch `plan-10b-world-parity` from `master` `63bd844`.
- Gate before every commit touching `packages/`: `npm test > <scratch>/run.txt 2>&1` from the repo root, then `npm run typecheck`, `npm run build -w @pokemap/ui`. Baseline 3,277 pass / 0 fail / 201 files; known load-only flakes listed in the session brief.
- Tests that commit send `{ fingerprint }` from `GET /api/edit/:map/plan` (10a3).
- Never two full server suites at once (`dungeons.test.ts` shares the subject's `.pokemap/`).
- Clean-subject measurements read the subjects only: GBA `C:/Programming Projects/Pokemon Game/game`, PerfPlus `C:/Programming Projects/pokecrystal-PerfPlus`, pret `C:/Programming Projects/Pokemon Game/refs/pokecrystal`. Never write to them outside the live-check backup/restore protocol.
- Kind labels (exact copy): `build` → "Build error", `gameplay` → "Gameplay", `size` → "Size mismatch".
- Every Codex diff is checked for BOMs and re-encoded UTF-8 (session-brief traps).

## Review Focus

1. A clean map shows no banner. Route101 (GBA), NewBarkTown (PerfPlus), and every pret map report zero defects except recorded real ones. Pinned by each check task's corpus test.
2. A save of a mismatched-size layout keeps every byte the user did not edit, odd byte included. Pinned in Task 2.
3. A label created by the user's own save does not show up as missing afterwards (SR3). Pinned in Task 5.
4. Turning the dungeon toggle off and on returns the world to exactly where it was: manual placements, accepted conflicts, tree greying. Pinned in Task 7.
5. Duplicating the last object on a full GBA map (64 objects) or at the map's right edge gives a clear refusal or a valid position, never a broken map. Pinned in Task 6.

---

### Task 1: Defect model and shared banner — Medium

Tier reason: new types and a UI component; wrong output fails tests.

**Files:**
- Create: `packages/core/src/defects/types.ts`, `packages/ui/src/shared/DefectsBanner.tsx`
- Modify: `packages/core/src/gbc/model/types.ts` (re-export `DataDefect` from the new module), every GBC defect producer (`gbc/load/map.ts`, `gbc/load/events.ts`, `gbc/load/encounters.ts`, `gbc/analyse/atlas.ts`, `gbc/load/tileset.ts`), `packages/ui/src/gbc/adapter.tsx` (replace the inline `defectsBanner`)
- Test: `packages/core/test/defects/types.test.ts`, `packages/ui/test/DefectsBanner.test.tsx`

**Interfaces:**
- Produces: `type DefectKind = "build" | "gameplay" | "size"`; `interface DataDefect { file: string; message: string; kind: DefectKind; fix: string }`; `DEFECT_KIND_LABEL: Record<DefectKind, string>`; `<DefectsBanner defects={DataDefect[]} />`.

- [ ] Step 1: Write failing tests. Banner: renders nothing for `[]`; renders label, message, file, fix for one defect; with 7 defects shows 5 and a "Show all 7" button that reveals the rest; has `role="alert"`; no dismiss control.
- [ ] Step 2: Run, expect FAIL (module not found).
- [ ] Step 3: Add the types; give every existing GBC defect a kind and a one-sentence fix. The `object_const_def` defect is no longer shown in the banner (SR4): drop it from the map payload's `defects` (keep the producer only if a test or the CLI reads it; otherwise delete it with its test).
- [ ] Step 4: Swap GBC's inline banner for `DefectsBanner` in both places it renders (Map view, in-context World).
- [ ] Step 5: Gate; commit.

### Task 2: Size mismatch editable in both families (R2, SR6, SR12) — High

Tier reason: save safety, bytes on disk.

**Files:**
- Modify: `packages/core/src/load/blocks.ts`, `packages/core/src/write/binary.ts` (GBA odd trailing byte), `packages/core/src/gbc/load/map.ts`, `packages/core/src/gbc/write/guards.ts`, `packages/core/src/gbc/write/save.ts` only if needed, `packages/ui/src/gbc/GbcMapEditing.tsx`, `packages/ui/src/gbc/GbcMapCanvas.tsx`, every test pinning `writable: false`
- Test: `packages/core/test/write/binary.test.ts`, `packages/core/test/gbc/write/*.test.ts`, `packages/server/test/gbcSaveFingerprint.test.ts`

**Interfaces:**
- Consumes: `DataDefect` (Task 1).
- Produces: `sizeDefect(file: string, actualBytes: number, expectedBytes: number, fixTarget: string): DataDefect` in `core/src/defects/size.ts` (kind `size`; message states actual and expected byte counts; fix names both ways out per spec C1/SR7). GBC `Layout.writable` is removed.

- [ ] Step 1: Failing tests:
  - GBA: an odd-length `map.bin` (declared blocks + 1 extra byte), edit one block, plan the write; the written buffer equals the original with only that block's two bytes changed and the odd byte kept.
  - GBC: a `.blk` 3 bytes longer than `w*h` loads; painting is allowed; save writes the edited prefix and the same 3 tail bytes.
  - GBC: tail changed on disk before preview is preserved; tail-only change after preview → commit 409 `PLAN_CHANGED`, file unchanged.
  - Both: a shorter-than-declared file still refuses to load, and the error message contains the fix pointer.
- [ ] Step 2: Run, expect FAIL.
- [ ] Step 3: Implement. GBA: carry raw bytes past the last whole word through to the write. GBC: drop `writable` and the `layout-not-writable` refusal; the save keeps bytes past `w*h` from the disk buffer it already reads. Remove the disabled-tools path and the "not writable" footer in the UI; the C1 defect replaces them.
- [ ] Step 4: Update every `writable: false` assertion (core, server, CLI, UI) to the new behaviour.
- [ ] Step 5: Mutation: revert the tail-keeping line; the odd-byte and tail tests fail. Record in the task report.
- [ ] Step 6: Gate; commit.

### Task 3: GBA structural checks and route (C1-C6, C11) — High

Tier reason: parsing decomp source, false positives not caught automatically.

**Files:**
- Create: `packages/core/src/defects/gba.ts`, `packages/core/test/defects/gba.test.ts`, `packages/core/test/defects/gbaCorpus.test.ts`
- Modify: `packages/server/src/index.ts` (route), `packages/ui/src/gba/adapter.tsx` (fetch + banner in Map view and in-context World), `packages/server/test/api.test.ts`

**Interfaces:**
- Consumes: `DataDefect`, `sizeDefect` (Tasks 1-2).
- Produces: `gbaMapDefects(proj: Project, mapName: string, opts?: { symbols?: SymbolIndex }): DataDefect[]` (Task 5 adds C7-C9 through `opts.symbols`). `GET /api/defects/:map` → `200 { defects }`, `404` for an unknown map. UI hook `useMapDefects(mapName: string | null, saveToken: number): DataDefect[]` in `packages/ui/src/hooks/useMapDefects.ts`, refetching when either argument changes.

- [ ] Step 1: Failing unit tests, one per check, each on a temp copy of a small fixture map with exactly that defect, asserting kind and that `fix` names the file: C1 (`map.bin` 561 blocks over), C2 per kind with the SR1 exemptions (light sprite at (8,-4) and a warp at (-1,-1) are NOT defects), C3 split-aware (a secondary-range id inside the primary gap IS a defect), C4 (dest `MAP_UNKNOWN_X`), C5 (dest warp index ≥ dest warp count; `MAP_DYNAMIC`, `MAP_UNDEFINED`, `WARP_ID_NONE`, `WARP_ID_DYNAMIC`, `WARP_ID_SECRET_BASE` are not), C6 (65 objects), C11 (connection to a missing map).
- [ ] Step 2: Failing corpus test: `gbaMapDefects` over every GBA subject map; the result equals a recorded allow-list of real defects (at least Navel Rock Zygarde chamber C1). Route101 has none.
- [ ] Step 3: Implement the checks and the route; wire the banner in the GBA adapter; refetch after a successful save.
- [ ] Step 4: Run the corpus test; for each hit, decide real (add to allow-list with evidence in the task report) or false positive (fix the check). A check that cannot reach zero false positives is removed and recorded.
- [ ] Step 5: Mutation: remove one SR1 exemption → corpus test fails.
- [ ] Step 6: Gate; commit.

### Task 4: GBC structural checks (C1-C5, C11; C6 refusal) — High

Tier reason: parsing GBC source.

**Files:**
- Create: `packages/core/src/defects/gbc.ts`, `packages/core/test/gbc/defects.test.ts`, `packages/core/test/gbc/defectsCorpus.test.ts`
- Modify: `packages/server/src/gbcRoutes.ts` (map payload `defects`), `packages/core/src/gbc/load/events.ts` (C6 refusal message gains the fix pointer)

**Interfaces:**
- Produces: `gbcMapDefects(proj: GbcProject, mapName: string, opts?: { symbols?: SymbolIndex }): DataDefect[]`; the payload's `defects` is its result.

- [ ] Step 1: Failing tests per check on fixtures: C1 (fix names `map_const`), C2 step grid, C3 (block 0 legal), C4 (unknown map const), C5 (1-based; `-1` backup warp legal), C11 (name and constant both checked). C6: a 16-object map's load error message contains the fix pointer.
- [ ] Step 2: Failing corpus test over PerfPlus and pret: equals the allow-list of real defects.
- [ ] Step 3: Implement; replace the payload's old defect assembly with `gbcMapDefects`.
- [ ] Step 4: Triage corpus hits as in Task 3 Step 4.
- [ ] Step 5: Gate; commit.

### Task 5: Symbol index and C7-C9, both families — High

Tier reason: parsing, invalidation ordering.

**Files:**
- Create: `packages/core/src/defects/symbols.ts`, `packages/core/test/defects/symbols.test.ts`
- Modify: `packages/core/src/defects/gba.ts`, `packages/core/src/defects/gbc.ts` (from Task 4), `packages/server/src/index.ts`, `packages/server/src/gbcRoutes.ts` (cache + invalidation on commit)
- Test: `packages/server/test/signRoutes*.test.ts` or `gbcSignRoutes.test.ts` (SR3)

**Interfaces:**
- Produces: `interface SymbolIndex { labels: Set<string>; constants: Set<string> }`; `buildGbaSymbolIndex(root: string): SymbolIndex`; `buildGbcSymbolIndex(root: string): SymbolIndex`; `resolvesAll(expr: string, idx: SymbolIndex): boolean` (every identifier in `expr` is known or numeric).

- [ ] Step 1: Failing tests: index sources and forms per SR2 (GBA `Label::` in `data/**/*.inc` and `data/*.s`, `#define` in `include/constants/*.h`; GBC `Label:`/`Label::`, `DEF`, `EQU`, `const` after `const_def`, `map_const`). Not defects per SR2: GBA script `0x0`/`NULL`, flag `0`, `OBJ_EVENT_GFX_VAR_*`, `OBJ_EVENT_GFX_MON_BASE+SPECIES_MACHAMP`; GBC flag `-1`, `SPRITE_VARS`-range sprites. Defects: unknown label, unknown graphics constant, unknown flag.
- [ ] Step 2: Failing SR3 test: add a sign (new label) through the routes, save with fingerprint, `GET` defects → no C7 for that label, without a project reload.
- [ ] Step 3: Implement; the server builds the index lazily per project and drops it after any successful commit that writes a script/constant source, and on hub reload.
- [ ] Step 4: Extend both corpus tests (GBA subject; PerfPlus and pret for GBC); same allow-list rule as Task 3.
- [ ] Step 5: Mutation: skip invalidation → SR3 test fails.
- [ ] Step 6: Gate; commit.

### Task 6: GBA Duplicate (D6, SR13) — Medium

Tier reason: UI over an existing add route; covered by tests.

**Files:**
- Modify: `packages/ui/src/components/EventInspector.tsx`, `packages/ui/src/components/MapEditingWorkspace.tsx`
- Create: `packages/ui/src/gba/duplicateEvent.ts`
- Test: `packages/ui/test/EventInspector.test.tsx`, `packages/ui/test/gba/duplicateEvent.test.ts`

**Interfaces:**
- Produces: `duplicateEventValue(kind: EventKind, raw: Record<string, unknown>, mapW: number, mapH: number): Record<string, unknown>` — the insertion value for `addEvent`: every field copied from the full current event, `local_id` dropped, `x` = `x+1`, or `x-1` when `x+1 >= mapW`, `y` clamped to `[0, mapH-1]`.

- [ ] Step 1: Failing tests: each GBA event kind and subtype round-trips (object, warp, coord trigger and weather, bg sign/hidden item/secret base); right-edge goes left; `local_id` absent; button disabled with nothing selected and while a Duplicate/Add/Delete is in flight; on a 64-object map Duplicate of an object is disabled with title "The map already has 64 object events".
- [ ] Step 2: Run, FAIL.
- [ ] Step 3: Implement; Duplicate reads the full event from the session map (not the inspector's partial selection) and calls `addEvent`.
- [ ] Step 4: Gate; commit.

### Task 7: GBA F2 + filter cache; GBC dungeon toggle + Unplaced rail; flags deleted — High

Tier reason: shared world UI across both families plus a GBC server change to the world payload and sidecar.

**Files:**
- Create: `packages/ui/src/world/UnplacedRail.tsx`, `packages/ui/src/world/DungeonAutoLayoutSwitch.tsx`
- Modify: `packages/ui/src/components/WorldCanvas.tsx` (use shared pieces; `onPlacementSaved`), `packages/ui/src/gbc/GbcWorldCanvas.tsx`, `packages/ui/src/gba/adapter.tsx`, `packages/ui/src/gbc/adapter.tsx`, `packages/ui/src/shell/FamilyApp.tsx`, `packages/ui/src/shell/adapter.ts`, `packages/ui/src/shell/useDungeonFilter.ts`, `packages/ui/src/hooks/useWorldVisibility.ts`, `packages/server/src/gbcRoutes.ts`, `packages/core/src/gbc/wire.ts`
- Test: `packages/server/test/gbcRoutes.test.ts`, `packages/ui/test/WorldCanvas.test.tsx`, `packages/ui/test/gbc/*World*.test.tsx`, shell capabilities test, `packages/ui/test/App.test.tsx`

**Interfaces:**
- Produces: `POST /api/world/dungeons { enabled: boolean }` on GBC → `200 { dungeonAutoLayout }`; `GbcWorldPayload.sidecar: { dungeonAutoLayout: boolean }`; `WorldCanvasProps.onPlacementSaved?: (name: string) => void`; `useWorldVisibility` returns a `refresh(): void`.

- [ ] Step 1: Failing server tests (temp copy of PerfPlus): toggle off removes singleton-component maps without a manual placement from `placements` and keeps manual ones with their sizes; sidecar placements and accepted conflicts unchanged; toggle on restores the earlier payload exactly.
- [ ] Step 2: Failing UI tests:
  - GBA F2 (SR8): with auto-layout on and off, a tree drop and a rail drop of a greyed map un-grey its row in the same render pass, including a map absent from `placed`.
  - SR9: toggle off greys a singleton's row and lists it in the rail; toggle on un-greys it, with no view switch; both families.
  - GBA dungeon rename keeps the filter `Set` identity.
  - GBC shows the switch and the rail; a rail drop posts the placement and fires `onPlacementSaved`.
- [ ] Step 3: Implement the server toggle (drop `world/dungeons` from `GBA_ONLY_ROUTE_RE`; honour the flag in `buildGbcWorldPayload`).
- [ ] Step 4: Extract the switch and rail; wire into both canvases; after a toggle or placement refresh the tree visibility and the canvas world.
- [ ] Step 5: Delete `manualPlacements`, `defectsBanner`, `dungeonFilterCache`, `worldBar` from `Capabilities` with their branches and the `cache` parameter; update the capabilities test.
- [ ] Step 6: Mutation: skip the visibility refresh → SR9 test fails.
- [ ] Step 7: Gate; commit.

### Task 8: Live acceptance and docs — Medium

**Files:**
- Create: `docs/superpowers/task-reports/pokemap-plan-10b-world-parity/task-8-live.md`, `shots/live.mjs` (from the 10a3 template)
- Modify: `docs/superpowers/RESUME.md`, roadmap Plan 10 section ("10b done"), `docs/superpowers/LESSONS.md` if a new trap appears

- [ ] Step 1: Record external baselines and manifest hashes (GBA `a0349693144d`, GBC `13a31cb654ff`); back up every file a save touches.
- [ ] Step 2: GBA subject: F2 tree and rail drops un-grey at once; Duplicate an object and a sign, Save, both in `map.json`; Navel Rock Zygarde chamber shows the C1 entry with its fix; Route101 no banner. Restore byte-for-byte.
- [ ] Step 3: PerfPlus: toggle off → singleton leaves canvas, appears in rail, row greys; drag back → placed, row correct; toggle on; paint and save a mismatched `.blk` map, tail bytes unchanged; remove `.pokemap/`; restore files.
- [ ] Step 4: Re-measure baselines and hashes; any change is a finding.
- [ ] Step 5: Update RESUME and roadmap; commit docs.
