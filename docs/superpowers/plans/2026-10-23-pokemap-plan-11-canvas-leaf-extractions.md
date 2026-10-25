# Plan 11: canvas leaf extractions — Implementation Plan

**STATUS (2026-10-24):** Task 1 done (`626427f`..`0916b7c`, reviews clean). Task 2 done (`f4e9301`, review clean). Task 3 done (`25b2a43`, review clean). Task 4 done (`a5a8cda`, `8d9c11c`, reviews clean). Task 5 done (`2b3c8d2`, `20cb764`, `f3c384b`, reviews clean; `task-5-report.md`). Task 6 done (`1470e92`, `6fdb778`, reviews clean; `task-6-report.md`). Task 7 done (`8c3eb2b`, `c0175b2`, review clean; `task-7-report.md`). Task 8 done (`203d821`; `task-8-report.md`). Task 9 done (`8f8dcdd`: live acceptance in both families, GBC reload-alert Dismiss fix, final measurement; `task-9-live.md`). Final review (Claude Opus, Codex at its usage limit): ready to merge, 0/0/5; all five minors fixed (M1, M4, then M2, M3, M5 at the user's request); gate 3,533/0/218. All 9 tasks done; awaiting the user for push and merge.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every shared run outside the draw path of the two canvas pairs into `packages/ui/src/shared/`, fix the Plan 10b deferred world-canvas minors (T7b, Final fix, N1), and give GBA's two "Collision" buttons distinct accessible names.

**Architecture:** Pure moves first (map pair, then world pair), each a diff that changes no test. Then the async fixes, built on one pure placement-version ledger in `shared/` that both world canvases use, and on toggle generations for the dungeon switch. Then the wiring fixes, the server path fix, and live acceptance.

**Tech Stack:** TypeScript, React, Vitest (existing).

**Spec:** `docs/superpowers/specs/2026-10-23-pokemap-plan-11-canvas-leaf-extractions-design.md` (rulings P11-1 to P11-4; units E1-E13; fixes F1-F13; review record). Read it with this plan. Roadmap rulings: `plans/2026-10-14-pokemap-roadmap-unified-ui.md` "Plan 11".

## Global Constraints

- Branch `plan-11-canvas-leaf` (from `master` `fb78949`).
- Gate before every commit touching `packages/`, from the repo root: `npm test -- --maxWorkers=4 --minWorkers=1 > <scratch>/run.txt 2>&1`, strip ANSI, `grep -a "Test Files|Tests"`; then `npm run typecheck` and `npm run build -w @pokemap/ui`. Baseline 3,455 pass / 0 fail / 216 files. Never run the gate at default workers (it has crashed this PC). Known load-only flakes: rerun alone first (GbcApp palette tests, GbcAppEditing "beforeunload", App.test "P selects Pencil").
- Commit with explicit pathspecs. Never push or merge without the user.
- Tasks 1-2 are pure moves: no test file changes, no DOM change (class names, `role`, `aria-*`, `data-testid`, text, element order).
- P11-2: composite-version and redraw effects, LOD draw code, hit-testing and the stroke handlers around `chain.start` stay in the family canvases.
- A unit that turns out to differ in more than its inputs stays duplicated; record why in the task report.
- New shared modules are added to `packages/ui/DESIGN.md` "Shared modules".
- Async tests use deferred fetches (promises the test resolves by hand), never timers alone, so each ordering is forced.
- Task reports: `docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/` (global rule 7).
- Subjects are read only, except the live-check backup/restore protocol: GBA `C:/Programming Projects/Pokemon Game/game` (HEAD `718b89f73`, exactly 8 porcelain lines, the user's own), PerfPlus (HEAD `81ededbe3`, clean, no `.pokemap`).

## Review Focus

1. Tasks 1-2 change no behaviour: no test edited, every canvas test passes, DOM identical.
2. The ledger (Task 4) decides by version, never by coordinates: A→B→A, a no-op during an in-flight POST, a stale GET after an acknowledgement, and a failure followed by a newer gesture all show the right position. Pinned in Tasks 4-5.
3. The dungeon switch never shows a value the server did not accept or a stale one during a double toggle. Pinned in Task 6.
4. A group move makes one visibility refresh and marks only acknowledged names. Pinned in Task 7.

---

### Task 1: Map canvas extractions (E1-E6, map half of E13) — Medium

Tier reason: pure move across two files plus new shared modules; the unchanged canvas tests catch a wrong move.

**Files:**
- Create: `packages/ui/src/shared/useCanvasView.ts` (E1, E2), `packages/ui/src/shared/CanvasZoomBar.tsx` (E3), `packages/ui/src/shared/OverlayToggleGroup.tsx` (E4), `packages/ui/src/shared/LegendBar.tsx` (E5); others only as E6/E13 decide
- Modify: `packages/ui/src/components/MapCanvas.tsx`, `packages/ui/src/gbc/GbcMapCanvas.tsx`, `packages/ui/DESIGN.md`
- Report: `task-1-report.md` with the measurement before and after (`task-reports/pokemap-plan-11-canvas-leaf/measure.py`, run from `packages/ui/src`), and the E6 and E13 decisions (map auto-fit lifecycle `MapCanvas.tsx:470` / `GbcMapCanvas.tsx:452`)

- [ ] Step 1: Run `measure.py` on the map pair; record 263 aligned / 37 runs (a different number is a finding). Re-check each unit's start line from the spec.
- [ ] Step 2: Extract E1+E2 into `useCanvasView` (inputs: controlled view, `onViewChange`, canvas ref, pixel size). Gate.
- [ ] Step 3: Extract E3, E4, E5 as components that take the family's lists (E4 toggles incl. GBA Elevation; E5 legend items). Keep every class name, `role`, `aria-*`, `data-testid` and text as is. Gate.
- [ ] Step 4: Decide E6 and the map auto-fit lifecycle; extract or record the reason.
- [ ] Step 5: `git diff --stat -- packages/ui/test` is empty. Re-run `measure.py`; record. Gate; commit.

### Task 2: World canvas extractions (E7-E12, world half of E13) — Medium

Tier reason: as Task 1; E9/E10 must stay pure helpers outside the redraw effects.

**Files:**
- Create: `packages/ui/src/shared/LensOverlay.tsx` (E7), `packages/ui/src/shared/useTileVersionRefetch.ts` (E8), `packages/ui/src/shared/worldTiles.ts` (E9), `packages/ui/src/shared/worldBadges.ts` (E10)
- Modify: `packages/ui/src/components/WorldCanvas.tsx`, `packages/ui/src/gbc/GbcWorldCanvas.tsx`, `packages/ui/src/shared/WorldContextOverlay.tsx` (E12), the module beside `useConflictAcceptance` (E11), `packages/ui/DESIGN.md`
- Report: `task-2-report.md` (measurement before/after; each E13 candidate: viewport measurement `WorldCanvas.tsx:511` / `GbcWorldCanvas.tsx:588`, Fit and zoom readout, warp and line toggles, encounter-border mount, spotlight overlay, toolbar alerts, plus any other measured run)

- [ ] Step 1: Run `measure.py` on the world pair; record 302 aligned / 48 runs.
- [ ] Step 2: E7 (`LensOverlay` takes entries built by a shared builder from a rect function; GBC passes its `rectByMap` lookup). Gate.
- [ ] Step 3: E8 hook; E9 pure `buildSmallTile(image, tilePx)` (the `onload`, cache insert and composite-version bump stay put); E10 `BADGE_SIZE` and a pure `conflictBadgeCentre(...)` (drawing, iteration, filters and hit targets stay in each redraw effect). Gate.
- [ ] Step 4: E11 wiring (each family keeps its tooltip text, GBC keeps its `mapFilter` skip); E12 mount only. Gate.
- [ ] Step 5: E13 decisions. `git diff --stat -- packages/ui/test` is empty. Re-run `measure.py`; record. Gate; commit.

### Task 3: Collision accessible names (P11-4) — Low

Tier reason: two attributes and test query updates; wrong names fail tests.

**Files:**
- Modify: `packages/ui/src/components/Toolbar.tsx` (collision tool `aria-label="Collision tool"`; visible label and `title` unchanged), `packages/ui/src/shared/OverlayToggleGroup.tsx` (collision toggle `aria-label="Show collision overlay"`)
- Test: `test/Toolbar.test.tsx:36,121,134,142-146`, `test/MapCanvas.test.tsx:295,336,713`, `test/gbc/GbcMapCanvas.test.tsx:357,458,508`, `test/gbc/ToolbarGbc.test.tsx:19`, and any test that scopes by the "Tools" group to separate the two buttons (grep `"Tools"`)

- [ ] Step 1: Update the tests first (query the new names; split name assertions from unchanged text/`title` assertions; ToolbarGbc queries "Collision tool" for absence). Run them; they fail.
- [ ] Step 2: Add the two `aria-label`s. Tests pass. Gate; commit.

### Task 4: Placement-version ledger (spec model, F1-F4 core) — High

Tier reason: the async-ordering model itself; a wrong rule is silent in the UI. Opus-tier spec and quality reviews, separately.

**Files:**
- Create: `packages/ui/src/shared/placementLedger.ts` (pure, no React)
- Test: `packages/ui/test/shared/placementLedger.test.ts`

**Interfaces (names may change; the behaviour may not):**
- `begin(map): Version` — a gesture starts moving `map`.
- `moved(map, v)` — POST for `v` sent. `noop(map, v)` — gesture ended on its start tile.
- `resolve(map, v, ok: boolean)` — POST outcome.
- `snapshot(): Snapshot` — taken when a world GET is issued.
- `serverShows(map, snap): boolean` — at GET landing: true only if the map's latest version now equals the one in `snap` and it was acknowledged, failed or settled when `snap` was taken. A no-op takes the outcome of the POST in flight for that map when it was committed; with none in flight it is settled at once.
- `dropAbsent(map, snap): boolean` — a failed/settled map the server does not place leaves the world.

- [ ] Step 1: Write the tests (each a sequence of calls and expected `serverShows`): moved→ack→GET after; GET issued before ack lands after it (stale) keeps local; A→B→A with B in flight; late failure of `v1` after `v2` began; no-op with no POST in flight; no-op during in-flight POST that succeeds, and that fails, then a later snapshot; failure then newer gesture before the rollback GET lands; group members (independent maps) with mixed outcomes. Run; they fail (module missing).
- [ ] Step 2: Implement. Tests pass.
- [ ] Step 3: Mutations, each failing a test: no-op settles at once; `serverShows` ignores the snapshot (uses current state); compare positions instead of versions (add a position field to the mutation only). Record in the report.
- [ ] Step 4: Gate; commit.

### Task 5: Wire the ledger into both world canvases (F1-F6) — High

Tier reason: async ordering across fetch, reload and React state in two families. Opus-tier reviews, separately.

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx` (replace `placementEdits`/`savedPlacementEdits`; one version per gesture instead of per mousemove at `:1687`; the `/api/world` effect at `:535` uses `snapshot`/`serverShows`; failure triggers a reload), `packages/ui/src/gbc/GbcWorldCanvas.tsx` (replace `savedOverrides`/`settledOverrides` at `:490-503`; override filter reads no ref inside its updater; failure triggers `reloadWorld`), `packages/ui/src/gbc/hooks/useGbcWorld.ts`
- Test: `packages/ui/test/world/placementResync.test.tsx` (extend), `packages/ui/test/gbc/GbcWorldCanvas.test.tsx`, `packages/ui/test/gbc/useGbcWorld.test.ts`

**Interfaces:**
- `useGbcWorld` gains `loadedGen` (the generation whose GET produced `data`) and `reload(): number` (the new generation), so the GBC canvas takes its snapshot per generation. A `data` with no snapshot of its own (first load) treats every unresolved or not-yet-observed version as local.

- [ ] Step 1: Failing component tests, both families, deferred fetches (spec F6 list): late failure after a newer gesture; no-op during in-flight POST, success and failure, then a server-position change; stale GET after acknowledgement; A→B→A; gesture between a failure and its reload; failed rollback reload keeps local and shows the alert slot (F11 lands in Task 6; assert the local position here); unchanged GBA group members; StrictMode render of the GBC filter gives the same overrides (F4).
- [ ] Step 2: Implement GBA. Then GBC with the `useGbcWorld` change. Tests pass.
- [ ] Step 3: Mutations, each failing a test: GBC no-op settles at once; GBA failure without reload (F5); skip the ownership check when the rollback GET lands (newer gesture clobbered).
- [ ] Step 4: Gate; commit.

### Task 6: Dungeon switch generations and reload alert (F12, F11) — High

Tier reason: async ordering in both families; F11 is the one DOM addition. Opus-tier reviews, separately.

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx` (`toggleDungeons`, the `setDungeonsPending(null)` in the world effect at `:563`, `loadError` rendering at `:1998`), `packages/ui/src/gbc/GbcWorldCanvas.tsx` (`toggleDungeons` at `:1043`, the reset effect at `:528`, error rendering at `:1337`), shared helper if both fit one
- Test: `packages/ui/test/WorldCanvas.test.tsx`, `packages/ui/test/gbc/GbcWorldCanvas.test.tsx`, `packages/ui/test/shell/worldParity.test.tsx` if the parity suite covers the switch

- [ ] Step 1: Failing tests, both families, deferred fetches: two successes in order and reversed; older failure with newer pending; latest failure after an older success; unrelated GET between the last POST and its reload; failed final reload (pending stays, alert shows). F11: load → failed reload → canvas still pans and drags → Dismiss clears; load → failed reload → successful reload clears; failed first load still shows the placeholder.
- [ ] Step 2: Implement toggle generations (spec F12) and the alert (`role="alert"`, Dismiss, same markup as the save-error alert at GBA `WorldCanvas.tsx:2129`, GBC `GbcWorldCanvas.tsx:1292`). Tests pass.
- [ ] Step 3: Mutations, each failing a test: any world response clears pending; a failed latest POST keeps pending; reload error replaces the canvas.
- [ ] Step 4: Gate; commit.

### Task 7: World wiring (F7-F10) — Medium

Tier reason: callback wiring across adapters; wrong counts fail tests.

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx` (report acknowledged names once per commit), `packages/ui/src/gbc/GbcWorldCanvas.tsx` (same callback shape), `packages/ui/src/gba/adapter.tsx` (mark each, refresh once; `renderDungeon` at `:138` passes the callback), `packages/ui/src/gbc/adapter.tsx` (same shape; drop `onLayoutChanged={reloadWorld}` from `renderDungeon` at `:146`), `packages/ui/src/shell/adapter.ts` if the slot types change
- Test: `packages/ui/test/shell/worldParity.test.tsx` or a new adapter-level test, `packages/ui/test/world/placementResync.test.tsx`

- [ ] Step 1: Failing adapter-level tests: GBA group move of 3, all succeed → 3 names marked, 1 visibility GET, 1 world GET; one fails → 2 marked, 1 visibility GET; all fail → none marked, 0 visibility GETs. Shift-drag move fires the callback in both families (F8). GBA dungeon-mode placement un-greys the tree row (F9).
- [ ] Step 2: Implement. Tests pass. F10 has no test of its own (dead code); typecheck shows nothing else passed it.
- [ ] Step 3: Mutation: refresh per name → the count test fails.
- [ ] Step 4: Gate; commit.

### Task 8: Symbol-failure path (F13) — Low

Tier reason: one server line and one test.

**Files:**
- Modify: `packages/server/src/projectSymbols.ts:29-31` (`file: "."`; strip the absolute root from the reason)
- Test: the existing projectSymbols / defects route test that covers a failed index build

- [ ] Step 1: Failing test: a forced index-build failure whose error message contains the root; the `incomplete` entry has `file: "."` and no occurrence of the root.
- [ ] Step 2: Implement. Gate; commit.

### Task 9: Live acceptance and docs — Medium

Tier reason: checks only, plus docs.

**Files:**
- Report: `task-9-live.md`, screenshots under `task-9-shots/`
- Modify: `docs/superpowers/RESUME.md`, roadmap Plan 11 status, this plan's STATUS line

- [ ] Step 1: Back up per the live-check protocol; record manifest hashes (GBA `a0349693144d`, GBC `13a31cb654ff`) with `task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-shots/manifest.sh`.
- [ ] Step 2: Both families (headless Playwright is fine): zoom buttons, wheel zoom, overlay toggles and legend, lens overlays, Shift-drag placement, GBA group move (network log shows one visibility GET), GBA dungeon-mode placement un-greys its row, dungeon switch double-toggle without flicker, both Collision names in the accessibility tree.
- [ ] Step 3: Restore; manifest hashes unchanged; PerfPlus has no `.pokemap`; GBA subject still exactly 8 porcelain lines.
- [ ] Step 4: Final `measure.py` on both pairs; every remaining run of 3+ lines is draw path or listed with a reason.
- [ ] Step 5: Full gate, typecheck, UI build. Update docs; commit. Final review (Opus-tier), then stop for the user before push or merge.
