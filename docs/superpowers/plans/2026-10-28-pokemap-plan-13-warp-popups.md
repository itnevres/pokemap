# Plan 13: warp destination popups (#5) and dungeon scope (#6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A warp-marker double-click opens the destination map's full editing workspace in a shell-owned popup (both
families, World and Dungeon), dungeon views show every member map whatever the saved auto-layout, and the warp alert
counts failing maps and clears itself (P12-4x).

**Architecture:** FamilyApp gains a `useWarpPopup` hook (open through the family's leave guard, close back to the source
map through the same guard) and renders `runtime.renderMap(slots)` inside a shared `WarpPopup` modal. WorldSurface
reports resolved-marker double-clicks through a new `onOpenWarpDestination` prop and loses its local preview. The world
GET takes `?scope=dungeon` in both servers; WorldSurface passes the scope to `adapter.useWorld`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom), Node HTTP server, Playwright (live).

**Spec:** `docs/superpowers/specs/2026-10-28-pokemap-plan-13-warp-popups-design.md` (rulings P13-1..3, design items
1-10). Also binding: Plan 12 spec rulings P12-1..8, P12-4a..x; roadmap D1-D18.

**Tier: High for every task** (shared shell/canvas core, async ordering, hub I/O, Save path). Each task gets separate
spec and quality reviews (delegate chain: Codex astra first; Claude `high-risk-reviewer` Opus only as fallback) and
mutation checks. Reports: `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-<N>-<role>.md` (global rule 7).

## Global Constraints

- Gate baseline: 3,821 pass / 0 fail / 234 files (`--maxWorkers=4 --minWorkers=1`); typecheck and UI build pass. Use the
  `gate` skill; never two vitest runs at once; never edit src during a gate; rerun a lone failure before calling it a
  regression (flakes: LESSONS, Testing).
- Files are CRLF; added lines at most 140 characters.
- No write to the real subjects (GBA `C:\Programming Projects\Pokemon Game\game` HEAD 26a2e3d1e, 9 porcelain lines that
  are the user's; PerfPlus 81ededbe3 clean, no `.pokemap`; pret pokecrystal 3bc8daa41 clean). Manifests after the plan:
  GBA `0e3237e6ade2`, PerfPlus `13a31cb654ff`. Server tests that POST use the existing fixture-copy pattern.
- Tests that pin the old read-only preview are replaced by tests of the new contract, never just deleted.
- Commit with explicit pathspecs; leave `.codex/`, `.agents/` and the stashes alone.
- Alert copy (exact): `Warp data unavailable for ${n} map${n === 1 ? "" : "s"}: ${latestError}`.

## Review Focus

1. Two map workspaces mounted at once: World mode keeps its inactive host workspace (GBA `MapEditingWorkspace
   active={false}`, GBC `GbcMapEditing active={false}`) while the popup shows the active one. Tool hotkeys, undo
   shortcuts and stroke registration must act once, on the popup. Test in Task 4.
2. Escape typed inside the popup's own nested UI (a text field, the sign composer, a context menu) must not close the
   popup. Test in Task 4.
3. Opening or closing while a stroke is still in flight: the dirty decision is made after `strokeSettled()` on fresh state, never on
   the click-time closure (the `useContextEditing.requestExit` pattern). Test in Task 4.
4. A warp whose destination is the selected map (self-warp or warp back): opens with no prompt and closes with no
   selection change. Test in Task 4.
5. A save inside the popup must refresh that map's world tile and warp markers even in Dungeon mode, and a stale
   in-flight warp fetch for that map must not repopulate the cache with pre-save data. Test in Task 3.

---

### Task 1: `?scope=dungeon` in both servers (#6)

**Files:**
- Modify: `packages/server/src/index.ts:607-611` (GBA `/api/world`)
- Modify: `packages/server/src/gbcRoutes.ts:215-243` (`buildGbcWorldPayload`), `:502` (route call)
- Test: `packages/server/test/world.test.ts` (GBA, subject-backed fixture copy), `packages/server/test/gbcRoutes.test.ts`

**Interfaces:**
- Produces: `GET /api/world?scope=dungeon` in both families returns placements resolved as if `dungeonAutoLayout` were
  true; `sidecar` in the response is the saved one, unchanged on disk. `buildGbcWorldPayload(proj, world, sidecar,
  warps?, opts?: { scope?: "world" | "dungeon" })`.

- [ ] **Step 1: Write failing tests (verify the bug in each family first)**
  - GBA `world.test.ts`, `it("includes indoor maps for scope=dungeon without changing the saved layout flag")`: POST
    `/api/world/dungeons {enabled:false}` against the fixture copy; then GET `/api/world` and `/api/world?scope=dungeon`.
    Expect `scoped.sidecar.dungeonAutoLayout === false`; scoped placement count > normal count; one indoor dungeon member
    of the subject (implementer picks a singleton indoor map absent from the normal response) is in scoped only; the
    sidecar file bytes equal the bytes after the POST. Restore the fixture sidecar in `finally`. (Reference: WIP
    `946bb61` `world.test.ts`; its `1209`/`NewBarkTown_Lab` values are not GBA facts, do not copy them.)
  - GBC `gbcRoutes.test.ts`, `it("keeps singleton indoor maps for scope=dungeon with auto-layout off")`: build with
    sidecar `{ dungeonAutoLayout: false, manualPlacements: {} }`; an indoor singleton map is absent without opts and
    present with `{ scope: "dungeon" }`; `payload.sidecar.dungeonAutoLayout === false`. Plus an HTTP test through the
    GBC route (`gbcRoutes.ts:502`, the existing GBC route-test harness) comparing `/api/world` with
    `/api/world?scope=dungeon`, so the route's forwarding is mutated separately from the helper.
- [ ] **Step 2: Run both; expect FAIL.** `npx vitest run packages/server/test/world.test.ts packages/server/test/gbcRoutes.test.ts`.
  If the GBC test passes before any change, GBC is unaffected: record that in the task report, drop the GBC change, keep
  the test as a guard.
- [ ] **Step 3: Implement.** GBA: resolve with `{ ...sidecar, dungeonAutoLayout: true }` when `scope === "dungeon"`,
  return the original `sidecar`. GBC: `keep()` also passes for `opts.scope === "dungeon"`; the route reads
  `url.searchParams.get("scope")`. `?dungeons=` behaviour unchanged.
- [ ] **Step 4: Run both; expect PASS.** Then the whole server suite: `npx vitest run packages/server`.
- [ ] **Step 5: Mutation check:** drop each family's scope branch; the matching test fails. Record in the report.
- [ ] **Step 6: Commit** `feat(plan-13): /api/world?scope=dungeon in both families (#6)`.

### Task 2: dungeon surfaces request the scope; auto-layout switch hidden there

**Files:**
- Modify: `packages/ui/src/canvas/worldSurfaceAdapter.ts:97` (`useWorld`), `packages/ui/src/canvas/WorldSurface.tsx:94`
  and the toolbar `DungeonAutoLayoutSwitch` line (~`:778`)
- Modify: `packages/ui/src/gba/worldSurface.tsx:59-77` (`useGbaWorld`), `packages/ui/src/gbc/worldSurface.tsx:219-223`,
  `packages/ui/src/gbc/hooks/useGbcWorld.ts:24-43`
- Test: `packages/ui/test/canvas/WorldSurface.test.tsx`, `packages/ui/test/WorldCanvasSurface.test.tsx`,
  `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx`, `packages/ui/test/gbc/useGbcWorld.test.ts`

**Interfaces:**
- Consumes: Task 1's query parameter.
- Produces: `type WorldScope = "world" | "dungeon"` exported from `worldSurfaceAdapter.ts`;
  `useWorld(ledger: PlacementLedger, scope: WorldScope): WorldData<P, C, W>`; `useGbcWorld(enabled = true, onIssue?,
  scope: WorldScope = "world")`. WorldSurface passes `mapFilter ? "dungeon" : "world"` (fixed per keyed mount).

- [ ] **Step 1: Failing tests:** each family's dungeon-mode surface (`mapFilter` set) GETs exactly
  `/api/world?scope=dungeon`; World mode GETs `/api/world`; the "Dungeon auto-layout" switch is absent with a
  `mapFilter` and present without. Existing dungeon tests whose fetch mock matches `/api/world` exactly are updated to the
  new URL (name that reason in the report).
- [ ] **Step 2: Run; expect FAIL** (`npx vitest run` on the four files).
- [ ] **Step 3: Implement** the signatures above; the switch renders only when `adapter.postDungeons && !mapFilter`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Mutation check:** hard-code `"world"` in WorldSurface; the dungeon URL tests fail.
- [ ] **Step 6: Commit** `feat(plan-13): dungeon views request scope=dungeon; hide auto-layout switch there`.

### Task 3: warp alert count (P12-4x) and per-map warp refresh on `tileVersions`

**Files:**
- Modify: `packages/ui/src/canvas/WorldSurface.tsx:480-526` (warp state and fetch effect), `:780-788` (toggles, alert)
- Modify: `packages/ui/src/gba/adapter.tsx` and `packages/ui/src/gbc/adapter.tsx` `renderDungeon` (pass
  `tileVersions={s.tileVersions}`); `packages/ui/src/gbc/worldSurface.tsx:295-306` (cache-based `resolveDestination`)
- Test: `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`

**Interfaces:**
- Produces: WorldSurface state `failedWarps: ReadonlyMap<string, string>` (map → its latest error) replacing the fetch
  half of `warpError`; the alert renders the Global Constraints copy with `n = failedWarps.size` and `latestError` = the
  most recently recorded message. The unresolved-marker message (`adapter.unresolvedWarpError`, `WorldSurface.tsx:595`)
  moves to its own `unresolvedWarp: string | null` state with its own alert (today's text), cleared by the same triggers
  as today (dismiss, Warps/Lines toggle, a resolved double-click); it never enters `failedWarps`.
  A change in `tileVersions[B]` deletes only B's `warpCache`/`warpRequests` entries (spec item 6). For that to refresh
  incoming lines, the GBC adapter stops embedding destination points (`gbc/worldSurface.tsx:302-306`, read from B's
  file server-side) and resolves them from the cache like GBA (`gba/worldSurface.tsx:197-202`):
  `resolveDestination(cache)`: `null` without `destMapName`; else `target = cache.get(destMapName)?.[warp.destWarp - 1]`
  (GBC `destWarp` is 1-based, `gbcRoutes.ts:274-275`) and return `target ? { map: destMapName, point: target.point }
  : null` (the `worldSurfaceAdapter.ts:54` shape), so `null` until B's entry has landed; `popupMap` stays as today (only when the server
  resolved `destEvent`). Eviction then bumps both `warpVersion` (the marker and line memos, `:533`, `:568`) and a
  `warpEpoch` state added to the fetch effect's dependency list (`:522`), so evicted graphics drop at once and refetch
  happens over a stationary view; ordinary failures never touch `warpEpoch` (no retry loop, P12-4s).

- [ ] **Step 1: Failing tests:**
  - `"warp alert counts failing maps and clears when every retry succeeds"`: two maps fail → text contains `for 2 maps`;
    view change, map A succeeds → `for 1 map`; map B succeeds → no alert.
  - `"a success on one map keeps the alert while another still fails"`.
  - `"a stale failure response after a newer request never adds to the count"` (resolve the old request after the new).
  - `"dismiss / Warps toggle / Lines toggle clear the count"` (existing triggers; extend the current tests).
  - `"a tileVersions bump re-fetches that map's warps over a stationary view"`: markers for A and B loaded, no pan or
    toggle; bump A → exactly one new fetch, for A; A's old markers are gone before the delayed replacement lands; the
    replacement moves A's marker; if the replacement fails, no stale marker returns and the alert counts A; a pre-bump
    in-flight response for A is ignored.
  - `"an incoming line follows the destination's refreshed warp"` (both adapters, `test/gba` and `test/gbc` surface
    tests): dungeon A→B line drawn; bump B; B's replacement has the warp moved → the line's B end moves, A is not
    refetched; also with A's own request still in flight when B is bumped.
  - `"an unresolved marker still shows its own alert"` (keep the existing assertion) and it does not change the count.
- [ ] **Step 2: Run; expect FAIL.** `npx vitest run packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`
- [ ] **Step 3: Implement.** Failure: `set(name, message)`; success: `delete(name)`; both guarded by the existing request
  token. Track seen versions in a ref keyed by map (as `useWorldTiles` does). Keep P12-4s retry semantics.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Mutation checks:** (a) skip `delete` on success → clear test fails; (b) clear the whole cache on a bump
  → "only that map" test fails; (c) drop the token check on failure → stale test fails; (d) skip the incoming-warp
  GBC resolver (embed points again) → the incoming-line test fails; (e) drop `warpEpoch` from the deps → the stationary-view test fails.
- [ ] **Step 6: Commit** `feat(plan-13): warp alert counts failing maps, per-map warp refresh (P12-4x)`.

### Task 4: shell popup (`useWarpPopup` + `WarpPopup`)

**Files:**
- Create: `packages/ui/src/shell/useWarpPopup.ts`, `packages/ui/src/shared/WarpPopup.tsx`,
  `packages/ui/src/shared/dialogFocus.ts` (port of WIP `components/dialogFocus.ts`, `trapDialogFocus`)
- Modify: `packages/ui/src/shell/FamilyApp.tsx`, `packages/ui/src/shell/adapter.ts` (`ShellSlots`, `FamilyRuntime.map`),
  `packages/ui/src/shared/useContextEditing.ts` (add `bumpTile`), `packages/ui/src/gba/adapter.tsx:129` and
  `packages/ui/src/gbc/adapter.tsx` (`map.name`), `packages/ui/src/components/SaveDialog.tsx`,
  `packages/ui/src/shared/SwitchPromptDialog.tsx`, `packages/ui/src/components/PokemonIndicatorDialog.tsx`,
  `packages/ui/src/shared/SignEditor.tsx` (Tab trap), `packages/ui/src/shared/shortcutGuard.ts`,
  `packages/ui/src/components/Toolbar.tsx`, `packages/ui/src/shared/useFitShortcut.ts` (shortcut owner)
- Test: `packages/ui/test/shell/warpPopup.test.tsx` (both families through FamilyApp, mocked fetch, the
  `switchPrompt.test.tsx` setup)

**Interfaces:**
- Produces:
  - `useWarpPopup(args: { selected: string | null; leave(go: () => void): void; select(name: string): void;
    strokeSettled(): Promise<void>; blocked(): boolean; onOpen(): void; mode: Mode }): { popup: { destination: string; source: string | null } |
    null; open(dest: string): void; requestClose(): void }`.
    `open`: no-op when `blocked()`, a popup is open or an open is already pending; records `{ dest, selected, mode }`
    and waits for `strokeSettled()`, then decides on the next render (pending-state effect, fresh `isDirty`). The
    pending open is dropped if `selected` or `mode` changed meanwhile or `blocked()` is now true (mode switch, tree
    click, prompt). Otherwise: `dest === selected` → leave in-context editing
    (`ctx.leaveContext()`, passed in as `onOpen`) and open with `source = selected`; else `leave(go)` where `go` records
    `source = selected`, calls `select(dest)`, opens. Self-warps must never leave the World host workspace active next
    to the popup. `requestClose`: one in flight at a
    time; after `strokeSettled()`, decide on the next render (pending-state effect, as `useContextEditing.requestExit`):
    `source` null or equal to the destination → close; else `leave(() => { select(source); close(); })`. If `selected`
    leaves the destination while open, close.
  - `ShellSlots.openWarpDestination(name: string): void` (FamilyApp: `warp.open`, `blocked` = switch pending or Save
    dialog open).
  - `ContextEditing.bumpTile(map: string): void`; FamilyApp's SaveDialog `onCommitted` calls it for the popup's
    destination when the popup is open.
  - `WarpPopup({ mapName, onClose, children })`: `warp-modal__backdrop` + panel, `role="dialog" aria-modal="true"
    aria-label={`${mapName} (warp destination)`}`, close button focused on mount, Tab trapped (`trapDialogFocus`),
    focus restored to the opener on unmount if connected. Escape calls `onClose` unless `e.defaultPrevented`, the
    target is an `input`/`textarea`/`select`/contenteditable, or another `[aria-modal="true"]` element is open. Backdrop
    click does nothing.
  - `FamilyRuntime.map` gains `name: string | null`: the map the loaded payload belongs to (GBA
    `layout.data?.map.name`; GBC the `ready` payload's map). The adapters' `useMapLayout` keeps the previous map's data
    until the new fetch lands (`gba/adapter.tsx:65`), so `ready` alone does not identify the destination.
  - FamilyApp renders, before SaveDialog/SwitchPromptDialog (so they paint above): `WarpPopup` containing
    `runtime.banners`, then `runtime.map.error` → `Could not load {dest}: {error}`, `runtime.map.ready &&
    runtime.map.name === dest` → `runtime.renderMap(slots)`, else `Loading {dest}…`.
  - `trapDialogFocus` is also attached to the panels of `SaveDialog`, `SwitchPromptDialog`, `PokemonIndicatorDialog`
    and `SignEditor` (`shared/SignEditor.tsx:83`, nested inside the workspace). It acts only when the event target's
    nearest `[aria-modal="true"]` ancestor is its own panel, so the popup's trap defers to a nested sign editor.
  - Shortcut ownership: `shortcutBlocked(e: KeyboardEvent, owner?: Element | null)` in `shared/shortcutGuard.ts:7`.
    Blocked when `defaultPrevented`, a text target, or an `[aria-modal="true"]` element exists that is not the warp
    popup panel (`data-warp-popup`); and, while a warp popup is open, when `owner` is not inside it. Callers pass their
    own root element: `Toolbar.tsx:71` (tools, undo/redo) and `useFitShortcut.ts:16` (Fit); grep for other callers and
    pass theirs. Without a popup the rule is today's.

- [ ] **Step 1: Failing tests** (each for GBA and GBC):
  - open on a clean map selects the destination and shows its workspace in the dialog; close selects the source again.
  - open while the source is dirty shows the switch prompt; Cancel leaves selection and no popup.
  - dirty close → prompt; Cancel keeps the popup and the edit; Discard → source selected, popup gone; Save → SaveDialog,
    committed → source selected, popup gone, `tileVersions[dest]` bumped.
  - Escape on the popup closes (clean); Escape in the SaveDialog closes only the SaveDialog; Escape in a text field
    inside the popup does nothing to the popup (Review Focus 2).
  - close requested during an unsettled stroke decides on the post-stroke dirty state (Review Focus 3).
  - destination === selected: no prompt on open, no selection change on close (Review Focus 4); the same while
    editing that map in context: context ends, exactly one active workspace.
  - open requested during an unsettled stroke on the source decides on the post-stroke dirty state (prompt appears).
  - destination fetch delayed: the popup shows `Loading {dest}…`, never the source map's workspace, until it lands.
  - Tab / Shift+Tab cycle inside the SaveDialog, the switch prompt and the sign editor while they sit above or inside
    the popup.
  - in the popup (World and Dungeon mode): a tool key, Ctrl+Z / Ctrl+Y and the Fit key act once on the popup
    workspace; with a SaveDialog open above it they do nothing; with no popup open, today's shortcut tests still pass.
  - an open pending on an unsettled stroke is dropped when the user switches mode (or clicks the tree) before it
    settles: no popup, one active workspace.
  - World mode: a tool hotkey pressed in the popup changes the tool once; one stroke registers once (Review Focus 1).
  - focus: close button focused on open; opener focused after close.
  - a GBC post-save reload error is visible inside the popup.
- [ ] **Step 2: Run; expect FAIL.** `npx vitest run packages/ui/test/shell/warpPopup.test.tsx`
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run; expect PASS**, then `npx vitest run packages/ui/test/shell`.
- [ ] **Step 5: Mutation checks:** (a) skip `leave` on close → dirty-close test fails; (b) decide dirty at click time
  → Review Focus 3 test fails; (c) remove the text-field Escape guard → its test fails; (d) skip `bumpTile` → save test
  fails.
- [ ] **Step 6: Commit** `feat(plan-13): shell warp popup with the full map workspace (#5)`.

### Task 5: wire WorldSurface to the shell popup; delete the read-only previews

**Files:**
- Modify: `packages/ui/src/canvas/WorldSurface.tsx:69-87` (props), `:483`, `:587-597` (`onDoubleClick`), `:891`
- Modify: `packages/ui/src/canvas/worldSurfaceAdapter.ts:117` (remove `renderWarpPopup`)
- Modify: `packages/ui/src/gba/worldSurface.tsx:206-208`, `packages/ui/src/gbc/worldSurface.tsx:308-310`
- Modify: `packages/ui/src/gba/adapter.tsx`, `packages/ui/src/gbc/adapter.tsx` (`renderWorld`, `renderDungeon`:
  `onOpenWarpDestination={s.openWarpDestination}`)
- Delete if unused afterwards: `packages/ui/src/gbc/GbcWarpDestinationModal.tsx`; `components/WarpDestinationModal.tsx`
  and its test only if no other importer (keep the CSS classes; other dialogs reuse them)
- Test: `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`, `packages/ui/test/WorldCanvas.test.tsx`,
  `packages/ui/test/gbc/GbcWorldCanvas.test.tsx`, `packages/ui/test/gbc/GbcWorldCanvasContext.test.tsx`,
  `packages/ui/test/shell/warpPopup.test.tsx`

**Interfaces:**
- Consumes: Task 4 `ShellSlots.openWarpDestination`; Task 3 `failedWarps`.
- Produces: `WorldSurfaceProps.onOpenWarpDestination?(map: string): void`. Double-click on a marker with `popupMap`:
  clear `failedWarps`, call the prop. Unresolved: unchanged (`adapter.unresolvedWarpError`). Shift+double-click keeps
  today's behaviour.

- [ ] **Step 1: Failing tests:** surface double-click on a resolved marker calls `onOpenWarpDestination(map)` and renders
  no dialog of its own; unresolved marker still shows its alert; an end-to-end test per family through FamilyApp in World
  and in Dungeon mode: double-click a marker → popup with the destination workspace. Replace the tests in
  `WorldCanvas.test.tsx`, `GbcWorldCanvas.test.tsx`, `GbcWorldCanvasContext.test.tsx` and `WorldSurfaceInteraction`
  that pinned the preview modal with these (name each replaced test in the report).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement**; remove `warpPopup` state and `renderWarpPopup`.
- [ ] **Step 4: Run; expect PASS**, then the `gate` skill (full suite, typecheck, UI build). Expect ≥ 3,821 + new
  tests, 0 fail.
- [ ] **Step 5: Mutation check:** call nothing on double-click → end-to-end tests fail.
- [ ] **Step 6: Commit** `feat(plan-13): warp markers open the shell popup; previews removed`.

### Task 6: live acceptance (both families, scratch subject copies)

**Files:**
- Create: `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-6-live.md`, drivers and shots under
  `task-6-shots/` (base on `task-reports/pokemap-plan-12b-world-surface/task-10-shots/`)

- [ ] **Step 1:** Record subject HEADs, porcelain counts and manifests (expect the Global Constraints values). Copy the
  GBA subject and PerfPlus to scratch; start the API on each copy (LAUNCH.md).
- [ ] **Step 2:** Run the spec's Acceptance list in each family: popup from World and from Dungeon; paint, undo, redo,
  save; close returns to the source; dirty close Cancel / Discard / Save; Escape inside the SaveDialog; world tile and
  dungeon lines refresh after save; auto-layout saved off → dungeon with indoor members shows all with lines; forced warp
  fetch failures show the count and clear after a successful retry. Live traps: focus the canvas before +/-; marquee at
  Fit; block POSTs unless a write is intended.
- [ ] **Step 3:** Re-measure the real subjects: manifests and porcelain unchanged.
- [ ] **Step 4: Commit** the report and shots.

### Task 7: final review, docs, PR

- [ ] **Step 1:** Whole-branch review (`master..HEAD`), High tier: Codex astra, fallback `high-risk-reviewer`. Fix
  findings with red-green tests; verify every offload finding against the code.
- [ ] **Step 2:** `gate` skill on the final tree.
- [ ] **Step 3:** Docs: DESIGN.md "Shared modules" (Plan 13 rows: `shell/useWarpPopup.ts`, `shared/WarpPopup.tsx`,
  `shared/dialogFocus.ts`); RESUME (status, gate); roadmap Plan 13 status; LESSONS for any new trap.
- [ ] **Step 4:** Archive task reports per rule 7. Stop for the user before push / PR / merge.
- [ ] **Step 5 (after the user merges):** close #5 and #6 (P13-3) with a comment naming the merge commit and
  `task-6-live.md`.
