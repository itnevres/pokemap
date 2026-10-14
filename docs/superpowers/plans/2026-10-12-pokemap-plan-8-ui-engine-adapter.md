# PokeMap Plan 8: unify the GBA and GBC UI over an engine adapter

> **STATUS (2026-10-13): DONE on branch `plan-8-ui-engine-adapter` (unpushed; push/PR awaits the user).** Tasks 0-8 are done and reviewed. The shared modules are mapped in `packages/ui/DESIGN.md` ("Shared modules (Plan 8)"). **Task 7 was reduced by a user decision:** the stop rule fired (App and GbcApp differ for real), so only the identical sections were lifted (`shared/useBeforeUnloadGuard.ts`, `useStrokeChainRegistry`); `family/*.ts` and the EngineAdapter were skipped (no consumer while the shells stay separate). **Task 8:** numbers in `task-reports/pokemap-plan-8-ui-engine-adapter/task-8-measurement.md`; canvas-core unification is a separate plan, written only if the user asks. Rulings, deferred minors and evidence: the ledger and `_archive/` in that folder.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This plan follows the repo's convention (Plans 6-7): it is written to **task** level. Before dispatching each task, the coordinator re-reads the real code and writes the executed spec `task-reports/pokemap-plan-8-ui-engine-adapter/task-N-spec.md`, with exact anchors, test code and teeth-proof. Interfaces below are binding. File line numbers are as of `580c710` and will drift.

**Goal:** Lift the code duplicated between the GBA and GBC UIs into shared modules that each take a small per-family adapter. A fix then lands once and both families get it. Each task is a behaviour-preserving extraction, except for the named bug fixes.

**Architecture:** GBA was built first (Plans 0-5). GBC (Plans 6-7) mirrored it file by file as `Gbc*` copies "without GBA types". At `580c710` the parallel pairs are:

| GBA | GBC |
|---|---|
| `App.tsx` 394 | `GbcApp.tsx` 381 |
| `MapCanvas.tsx` 1041 | `GbcMapCanvas.tsx` 882 |
| `WorldCanvas.tsx` 2399 | `GbcWorldCanvas.tsx` 1494 |
| `MapEditingWorkspace.tsx` 158 + `useMapEditing.ts` 332 | `GbcMapEditing.tsx` 204 |
| `useEditSession.ts` 347 | `useGbcEditSession.ts` 159 |
| four small paired data hooks | four small paired data hooks |

The approach:
- Extract one seam per task into `packages/ui/src/shared/`. Both families consume it, parameterised by the family-specific bits (geometry, request bodies, endpoints, panels).
- The adapter (`packages/ui/src/family/`) is **assembled from what tasks 1-6 actually needed**. It is not designed up front.
- Canvases are last, behind a measured decision gate.

The template is `world/contextView.ts`. Plan 7 Task 5b gave it a `native` parameter instead of copying it, and GBA stayed byte-identical.

**Tech stack:** React 18 + TypeScript, Vite, Vitest + Testing Library (jsdom), Node server (`packages/server`), the Playwright MCP for live checks.

**Spec:** none separate. The design rationale is the 2026-10-12 Plan 7 audit: `task-reports/pokemap-plan-7-gbc-editing/_archive/task-5b-claude-audit-coordinator.md`. Its deferred findings that this plan absorbs:
- **F6:** GBA lacks the B1 stroke ordering.
- **F3/M4:** a stroke whose mouseup is lost is never ended.
- **M3:** a throwing error handler poisons the stroke chain.
- **M5:** exiting within one round trip of the first paint skips SaveDialog.
- **M6:** a non-level context zoom makes `indexOf` return -1.
- **M9:** the context logic is duplicated.

## Global constraints

- **Order:** Plan 7 merged to `master` 2026-10-12 (`dbb1761`). Branch `plan-8-ui-engine-adapter` from `master`.
  - Issues #5/#6 (branch `issues-5-6-warp-popups`, uncommitted, unverified) edit the same paired files in both families.
  - The user decides at preflight: land #5/#6 first, then rebase it onto Plan 8's shared modules; or park it until Plan 8 finishes. Do not do both lines at once.
- **Behaviour:**
  - No user-visible behaviour change, except the named fixes (F6, F3/M4, M3, M5, M6). Each named fix gets its own new tests in **both** families.
  - The DOM structure, class names and ARIA names that existing tests and `DESIGN.md` rely on stay as they are.
- **Test oracle:** every existing test file stays unchanged unless a named reason is recorded in that task's coordinator report. Check: `git diff <task-base> -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` lists only named lines. Note that a bare `packages/*/test` pathspec silently matches nothing.
- **Dependencies:** no new runtime or dev dependencies.
- **Server:** no server, core or CLI changes, except a strictly additive export a shared hook needs.
- **Gate before every commit:**
  - `npm test` (one run, captured to a file);
  - `npm run typecheck`;
  - `npm run build -w @pokemap/ui`.
  - Never run two full suites at once. Commit with pathspecs only.
- **Never** use `git checkout`, `git restore` or `git stash` to undo experiments. Mutations restore from in-memory bytes in `finally` and byte-compare.
  - The classifier counts `AssertionError`, `expected` and `TestingLibraryElementError` as kills.
  - Run mutations in their own scratch worktree (`git -c core.longpaths=true worktree add --detach <scratch>/m HEAD` plus `npm ci`).
  - Tell reviewers which directories they must not write.
- **Real corpora:**
  - Any test that a mutation could turn into a write uses `copyGbcSubjectToTemp` (GBC) or a scratch-root fixture (GBA, as in `packages/server/test/world.test.ts`).
  - PerfPlus must end clean with no `.pokemap`.
  - GBA `.pokemap/world.json` stays `9c8ab2a…` unless the user changes it.
- **Live checks:**
  - Scratch hub on 5184 via `C:\Users\Serve\AppData\Local\Temp\pokemap-phase-d-coordinator\preload.mjs` with a scratch `POKEMAP_HOME`.
  - Vite on 5183 via a copy of that folder's `vite.mjs`, pointed at the tree under test.
  - Use Playwright MCP `browser_run_code_unsafe`, and check `document.visibilityState` before each write.
  - Take byte snapshots before writes, do the reverse edit through the UI, then `cmp`.

## Review focus

Most likely to bite a user first. Each line names its owning task, which must carry the test.

1. **Heavy-canvas remount.** A shared component that restructures JSX can remount the world or map canvas. That loses the view, refetches `/api/world`, and blanks the overlay. Expected: DOM node identity is kept across context entry and exit in both families (Tasks 2, 3, 6).
2. **Wrong native scale per family.** A shared hook defaults to GBA 16 px and GBC silently snaps to the wrong zoom, or the reverse. Expected: per-family snap tests at world zoom 32/64/128 (GBC) and 16/32/64 (GBA) (Task 2).
3. **Map switch or unmount mid-stroke in GBA, which now gains B1.** Expected: the queued applies of the retired visit are dropped, a begun stroke is still ended, and no error is shown for the retired visit (Task 1).
4. **Lost mouseup** (window blur, a native drag hijack), then a new mousedown. Expected: the previous stroke's end reaches the server before the new begin, so the two strokes are two undo steps (Task 1).
5. **Escape while a modal or menu is open, after the shared capture-phase listener.** Expected: Escape closes only the modal or menu, in both families, including the React-flush case where a document listener removes the modal first (Task 2).

---

### Task 0: Preflight and baseline

**Files:** create `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/preflight.md`.

- [ ] Confirm `master` contains Plan 7, and branch from it. Record the user's #5/#6 ordering decision.
- [ ] Record external state:
  - PerfPlus HEAD, porcelain, no `.pokemap`, NewBarkTown blk/asm SHA-1;
  - pret HEAD and porcelain;
  - GBA HEAD, porcelain, and `world.json`/`dungeons.json` SHA-1.
- [ ] Baseline gate (one run). Expected at `580c710`: **2,574 pass / 0 fail**, 150 files.
- [ ] Baseline duplication table: `wc -l` over the pairs above, used for the before/after report in Task 8.
- [ ] Commit `preflight.md`.

### Task 1: Shared stroke chain (absorbs F6, F3/M4, M3). Risk: high (concurrency)

**Files:**
- Create: `packages/ui/src/shared/useStrokeChain.ts`, `packages/ui/test/shared/useStrokeChain.test.tsx`.
- Modify: `packages/ui/src/gbc/GbcMapCanvas.tsx`. The B1 code is now `pendingPaintRef`, `strokeRef`, `canvasVisitRef`, the layout-effect retirement and `endActiveStroke`, at about `:300-319` and `:616-725`. It moves out.
- Modify: `packages/ui/src/components/MapCanvas.tsx`. Its `pendingPaintRef`/`beginStroke().then` chain and `endActiveStroke` (about `:235-280` and `:681-857`) are replaced.
- Test: new GBA cases in `packages/ui/test/MapCanvasStroke.test.tsx` (new file). Existing `MapCanvas*.test.tsx` and `GbcMapCanvasEdit.test.tsx` stay unchanged.

**Interfaces (produces; binding):**

```ts
// packages/ui/src/shared/useStrokeChain.ts
export interface StrokeSession<Body> {
  beginStroke(): Promise<void>;
  applyPaint(body: Body): Promise<unknown>;
  endStroke(): Promise<void>;
}
export interface StrokeChain<Body> {
  /** mousedown: ends any still-open stroke first (F3/M4), then begin, then `first` (if any) as one awaited link. */
  start(session: StrokeSession<Body>, first: Body | null): void;
  /** held move: queued behind every earlier link; dropped if the visit retired or begin failed. */
  queue(body: Body): void;
  /** mouseup/mouseleave: `last` (rect/shift final apply, or null), then end, after every queued link. */
  finish(last: Body | null): void;
  isOpen(): boolean;
  /** Resolves when every link issued so far has settled (Task 3 uses it for M5). */
  settled(): Promise<void>;
}
/** `visitKey` = the map name. A change or unmount retires the visit: queued work drops, a begun stroke still ends. */
export function useStrokeChain<Body>(visitKey: string, onError: (message: string) => void): StrokeChain<Body>;
```

The rules carried over from B1 (`b0f448a`) and now binding for both families:
- Each link awaits its round trip.
- Every assigned chain ends with a terminal `.catch(() => {})` after the guarded error report. A throwing `onError` can no longer poison the chain (M3).
- Errors from a retired visit are not reported.

- [ ] **Step 1:** Write `useStrokeChain.test.tsx` with held (deferred) promises. Cases:
  - begin before first apply;
  - each apply round trip before the next;
  - end after the last apply;
  - the next stroke's begin after the previous end;
  - retirement at begin, at apply and at end, for map change, A→B→A and unmount;
  - a lost mouseup (`start` while open), which must issue the old end before the new begin;
  - a throwing `onError`, after which a later stroke still paints;
  - `settled()` waits for a held apply.

  Use `await act(async () => {})` before every negative assertion: queued links run in microtasks.
- [ ] **Step 2:** Run it and confirm it fails (the module is missing).
- [ ] **Step 3:** Implement it by moving GBC's B1 logic. Do not reinvent it.
- [ ] **Step 4:** Make `GbcMapCanvas` consume the chain. All existing GBC tests must stay unchanged and green.
- [ ] **Step 5:** Write the GBA tests in `MapCanvasStroke.test.tsx`, mirroring the GBC B1 witnesses (`GbcMapCanvasEdit.test.tsx`, its `held()` cases): held begin, held first apply, three held drag applies, held end before the next begin, map/ABA/unmount retirement. Run them and confirm they fail on current GBA (F6).
- [ ] **Step 6:** Make `MapCanvas` consume the chain. The GBA body type is `PaintApplyBody` from `hooks/useEditSession.ts`. The new tests pass and all existing GBA tests stay unchanged and green.
- [ ] **Step 7:** Teeth-proof in the mutation worktree. Each of these must kill tests in both families' suites:
  - begin not awaited;
  - move apply not chained;
  - end not awaited;
  - retired visit still paints;
  - no lost-mouseup end;
  - no terminal catch.
- [ ] **Step 8:** Gate. Live check in **both** families: a rapid click and a three-block drag. Watch the request order (`begin, apply…, end`) with Playwright `page.on('request')`. Do a reverse edit and `cmp`.
- [ ] **Step 9:** Commit.

Reviews: split spec (Opus) and quality (Sonnet), because this is concurrency.

### Task 2: Shared world context mode (absorbs M9, M6). Risk: high (view math, focus, remount)

**Files:**
- Create: `packages/ui/src/shared/useWorldContext.ts`, `packages/ui/src/shared/WorldContextOverlay.tsx`, `packages/ui/test/shared/useWorldContext.test.tsx`.
- Modify: `components/WorldCanvas.tsx` (the context section at about `:1436-1530` and the overlay JSX at about `:2149-2175`) and `gbc/GbcWorldCanvas.tsx` (about `:944-1025`, the context key handler at about `:1194-1205`, and the overlay JSX at about `:1438-1465`).

**Interfaces (produces):**

```ts
// packages/ui/src/shared/useWorldContext.ts
import type { MapView, Zoom } from "../components/mapView.js";
export interface ContextPlacement { x: number; y: number; width: number; height: number }
export interface UseWorldContextArgs {
  native: number;                       // 16 GBA tile, 32 GBC block -- no default (Review focus 2)
  context: { map: string; view?: MapView; onViewChange(v: MapView): void; onExit(): void } | null;
  placement: ContextPlacement | null;
  world: { pan: { x: number; y: number }; zoom: number; setView(v: { pan: { x: number; y: number }; zoom: number }): void };
  origin: { x: number; y: number };     // composite origin (border ring * native)
  viewportRef: React.RefObject<HTMLElement>;
  isBlocked(): boolean;                 // modal/menu/text-field check, family-supplied
}
export interface WorldContext {
  inContext: boolean;
  contextView: MapView | null;
  setContextZoom(z: Zoom): void;        // clamps; a non-level zoom steps from the nearest level (M6)
  stepZoom(direction: 1 | -1): void;    // keyboard +/-
  onOverlayDoubleClick(e: React.MouseEvent<HTMLDivElement>): void;
  maxWorldZoom(base: number): number;   // base * 4 in context
}
export function useWorldContext(args: UseWorldContextArgs): WorldContext;
```

`WorldContextOverlay` renders exactly the current markup, with the same class names and ARIA:
- `world-canvas__context`, `__context-dim`, `__context-bar`;
- `Editing <map> in place`, `Zoom`, `Done editing <map>`.

It takes `renderCanvas(view, onViewChange)`.

- [ ] **Step 1:** Write the hook tests:
  - snap per family (GBA 16/32/64 → 1/2/4; GBC 32/64/128 → 1/2/4);
  - enter centres on the pointer;
  - capture-phase Escape exits only when nothing blocks. Include the document-bubble flush listener that removes a modal first.
  - an outside double-click exits;
  - `stepZoom` from a non-level zoom moves toward the pressed direction (M6);
  - the zoom cap in context.
- [ ] **Step 2:** Run them and confirm they fail.
- [ ] **Step 3:** Implement the hook by moving the GBC code. GBC's keyboard step-zoom in context and its disabled Fit all are GBC-only UI. They stay GBC-side, calling `stepZoom`.
- [ ] **Step 4:** Make `GbcWorldCanvas` consume it. Existing `GbcWorldCanvasContext.test.tsx` and `GbcAppContext.test.tsx` stay unchanged and green.
- [ ] **Step 5:** Make `WorldCanvas` consume it. Existing `WorldCanvasContext.test.tsx` and `AppContextEdit.test.tsx` stay unchanged and green.
- [ ] **Step 6:** Teeth-proof. Each must kill tests in both families:
  - native default reintroduced;
  - Escape listener in the bubble phase;
  - canvas `key` toggled by context (remount);
  - outside double-click ignored;
  - `indexOf` -1 left unclamped.
- [ ] **Step 7:** Gate. Live check in both families: enter, a 0-mismatch pixel alignment of the map body, Escape with the SaveDialog open, then Done.
- [ ] **Step 8:** Commit.

Reviews: split (Opus spec, Sonnet quality).

### Task 3: Shared app-level context controller (absorbs M5). Risk: medium

**Files:**
- Create: `packages/ui/src/shared/useContextEditing.ts`, `packages/ui/test/shared/useContextEditing.test.tsx`.
- Modify: `App.tsx` (`contextMap`, `tileVersions`, enter, exit, mode switch, the selection-leaves effect, the SaveDialog commit bump) and `gbc/GbcApp.tsx` (about `:81-99` and `:197-222`, the SaveDialog block at about `:430-445`).

**Interfaces (consumes Task 1's `StrokeChain.settled`; produces):**

```ts
export interface UseContextEditingArgs {
  selected: string | null;
  session: { isDirty: boolean; markClean(): void };
  leave(go: () => void): void;            // the family's existing dirty-switch guard
  strokeSettled(): Promise<void>;         // from the active canvas's StrokeChain (M5)
}
export interface ContextEditing {
  contextMap: string | null;
  tileVersions: Record<string, number>;
  enter(map: string): void;               // through `leave`
  requestExit(): void;                    // awaits strokeSettled, then dirty → open SaveDialog, else leave
  saveOpen: boolean; setSaveOpen(open: boolean): void;
  onCommitted(): void;                    // markClean + bump tileVersions[contextMap]
  leaveForModeSwitch(): void;             // no prompt
}
export function useContextEditing(args: UseContextEditingArgs): ContextEditing;
```

- [ ] **Step 1:** Write the tests:
  - enter goes through `leave`;
  - a dirty exit opens SaveDialog, and Cancel stays;
  - a clean exit leaves;
  - a commit bumps only that map's version and calls `markClean`;
  - a mode switch leaves without a prompt;
  - a selection change leaves;
  - **M5:** exit while an apply is held waits for it, then opens SaveDialog.
- [ ] **Step 2:** Run them and confirm they fail.
- [ ] **Step 3:** Implement the hook.
- [ ] **Step 4:** Make both apps consume it. The canvas exposes `settled` through the existing `canvasProps` path (`GbcMapEditingCanvasProps` and the GBA equivalent) as an optional `onStrokeChain` callback. Add no new context provider.
- [ ] **Step 5:** Add the M5 app-level test in both families (paint with a held apply, press Done, expect SaveDialog). Confirm it fails before Step 4's wiring and passes after.
- [ ] **Step 6:** Teeth-proof:
  - `requestExit` does not await;
  - commit bumps every tile;
  - mode switch prompts.
- [ ] **Step 7:** Gate, then commit.

### Task 4: Paired small data hooks. Risk: low (merged review)

Pairs (line counts at `580c710`):
- `hooks/useCoverage.ts` 55 / `gbc/hooks/useGbcCoverage.ts` 19;
- `useDungeons.ts` 97 / `useGbcDungeons.ts` 53;
- `useMapGroups.ts` 39 / `useGbcGroups.ts` 19;
- `useMapLayout.ts` 78 / `useGbcMap.ts` 39.

- [ ] **Step 1:** For each pair, diff the logic. **Stop rule:** a pair is merged only when the two differ solely in endpoint, response type and family-only fields. Record any other difference in the coordinator report and leave that pair alone.
- [ ] **Step 2:** For each pair that qualifies, create `shared/useFetched<T>.ts` or a pair-specific generic. It gets a test of loading, error, and the stale-response guard on a key change. Run the test and confirm it fails.
- [ ] **Step 3:** Implement it. Both family hooks become thin wrappers that keep their exported names and types, so no consumer or test changes.
- [ ] **Step 4:** Teeth-proof: remove the stale-response guard; it must kill tests in both families.
- [ ] **Step 5:** Gate, then commit.

### Task 5: Shared edit-session core. Risk: medium (async state)

**Files:**
- Create: `packages/ui/src/shared/useEditSessionCore.ts` and its test.
- Modify: `hooks/useEditSession.ts` and `gbc/hooks/useGbcEditSession.ts`. Both keep their exported result interfaces exactly, since `UseEditSessionResult` and `UseGbcEditSessionResult` are consumed widely.

**Interfaces (produces):**

```ts
export interface EditSessionCore<State> {
  state: State | undefined;               // family payload: GBA {blocks,border,map}, GBC {blocks,events}
  isDirty: boolean; canUndo: boolean; canRedo: boolean;
  post<R>(path: string, body?: unknown): Promise<R>;   // keeps the `latest.current.mapName === mapName` response guard
  apply(next: Partial<{ state: State; isDirty: boolean; canUndo: boolean; canRedo: boolean }>): void;
  discard(): Promise<void>;               // restores the seed, throws on !ok (both hooks' documented contract)
  markClean(): void;
}
export function useEditSessionCore<State>(base: string /* "/api/edit" */, mapName: string | null, seed: State | undefined): EditSessionCore<State>;
```

- [ ] **Step 1:** Write the core tests:
  - the response guard drops a stale map's reply;
  - discard restores the seed and never blanks it (the regression documented in `useEditSession.ts` `discard`);
  - discard throws on a non-ok response;
  - `markClean` keeps the state;
  - undo/redo flags come from the server reply.

  Run them and confirm they fail.
- [ ] **Step 2:** Implement the core. Re-express both hooks over it. `useEditSession.test.tsx`, `useGbcEditSession.test.tsx` and all consumers stay unchanged.
- [ ] **Step 3:** Teeth-proof:
  - remove the response guard;
  - discard to an empty grid;
  - discard swallows `!ok`.

  Each must kill tests in both families.
- [ ] **Step 4:** Gate. Live check: paint, undo, redo and save round trip in both families, with `cmp` after a reverse edit.
- [ ] **Step 5:** Commit.

### Task 6: One editing workspace with family slots. Risk: medium

**Files:**
- Modify: `components/MapEditingWorkspace.tsx`. It becomes the single workspace, with slots.
- Modify: `gbc/GbcMapEditing.tsx`. It becomes a GBC slot configuration over the shared workspace and keeps its export and props.
- Read: `hooks/useMapEditing.ts`, which holds the GBA per-visit state that GBC keeps inline (`pick`, `err`, `warn`, the visit identity at `GbcMapEditing.tsx:60-91`).

**Interfaces (produces):**

```ts
export interface WorkspaceSlots<CanvasProps> {
  Palette: React.ComponentType<{ mapKey: string; onPick(stamp: unknown): void }>;
  Inspector: React.ComponentType<{ mapKey: string }>;
  toolbarExtras?: React.ReactNode;
  buildCanvasProps(): CanvasProps | null; // the existing GbcMapEditingCanvasProps builder / GBA equivalent
}
// MapEditingWorkspace gains `slots` and keeps `active` + `renderCanvas` (the E2/5b seam) exactly.
```

The per-visit state and the visit-identity guard (`isCurrent`) move into the shared workspace, so GBA gains the A→B→A protection GBC has.

- [ ] **Step 1:** Write tests for the workspace with stub slots:
  - a visit change retires the pick, error and warning before children render;
  - a deferred callback from the old visit is ignored;
  - `active={false}` hides the chrome but keeps the canvas node.

  Run them and confirm they fail.
- [ ] **Step 2:** Implement the shared workspace. Wire GBC first: `GbcMapEditing.test.tsx` and `GbcAppContext*` stay unchanged and green. Then wire GBA: `MapEditingWorkspace*.test.tsx` and `AppContextEdit.test.tsx` stay unchanged and green.
- [ ] **Step 3:** Add a GBA test for the A→B→A stale-pick case that GBC already covers (`GbcAppContext.test.tsx` "different-map tree visits retire a context stamp…"). It fails before Step 2 and passes after.
- [ ] **Step 4:** Teeth-proof: drop the visit reset, drop `isCurrent`, and remount the canvas on `active` toggle.
- [ ] **Step 5:** Gate. Live check: context edit in both families. Commit.

### Task 7: Assemble the family adapter and converge the app shells. Risk: medium

**Files:**
- Create: `packages/ui/src/family/types.ts`, `family/gba.ts`, `family/gbc.ts`.
- Modify: `App.tsx` and `gbc/GbcApp.tsx`.

**Interfaces (produces; built from what Tasks 1-6 actually parameterised; add nothing speculative):**

```ts
export interface EngineAdapter<Payload, Session, CanvasProps> {
  family: "gba" | "gbc";
  geometry: { nativePx: 16 | 32; borderRings: number };   // Task 2 native, composite origin
  capabilities: { collisionPaint: boolean; timeOfDay: boolean };
  useSession(mapName: string | null, seed: Payload | undefined): Session; // UseEditSessionResult | UseGbcEditSessionResult (Task 5 keeps both)
  slots: WorkspaceSlots<CanvasProps>;                       // Task 6
}
```

- [ ] **Step 1:** Write `family/*.ts`, plus a test asserting each adapter's geometry and capabilities (16/1/collision true for GBA; 32/1/timeOfDay true for GBC).
- [ ] **Step 2:** **Stop rule** for the shells. After Tasks 1-6, diff `App.tsx` against `GbcApp.tsx`.
  - If the remaining difference is only adapter-shaped, merge them into `shared/FamilyApp.tsx`, and keep `App` and `GbcApp` as one-line wrappers so `Root` and the tests are untouched.
  - Otherwise, record the remaining real differences, merge only the identical sections (hooks, effects), and stop.
- [ ] **Step 3:** Gate, plus a live smoke test of both families (open a project from the picker, switch Map/World/Dungeon, context edit). Commit.

### Task 8: Canvas-core decision gate and close-out

- [ ] **Step 1:** Re-measure the duplication table from Task 0, and measure what remains duplicated inside `MapCanvas`/`GbcMapCanvas` and `WorldCanvas`/`GbcWorldCanvas` (shared helpers versus truly family-specific rendering).
- [ ] **Step 2:** Present the numbers to the user. Canvas-core unification (a render pipeline that takes `geometry` plus family overlay drawers) is **a separate plan, written only if the user wants it**. Its risk is high: hit-testing, LOD caches, overlays.
- [ ] **Step 3:** `DESIGN.md`: replace the per-family pairing notes with the shared-module map. Update RESUME and the plan STATUS. Archive the reports. Final gate. Stop for the user's approval before push or PR.

## Self-review notes

- **Coverage:** every absorbed audit finding (F3/M4, F6, M3, M5, M6, M9) maps to a task: Tasks 1, 1, 1, 3, 2, 2. M8c (server suites opening the real GBA corpus) is deliberately **not** here; it is server test hygiene, a separate follow-up.
- **Types:** `StrokeChain.settled` (Task 1) is consumed by `useContextEditing.strokeSettled` (Task 3). `WorkspaceSlots` (Task 6) is consumed by `EngineAdapter.slots` (Task 7). `native` (Task 2) is the same value as `EngineAdapter.geometry.nativePx` (Task 7).
- **Review focus:** each line names an owning task, and that task's Step 1 carries the test.
