# Task 5 brief: `WorldSurface` render, view and data contract — High

PokeMap, Plan 12b (unified GBA/GBC world canvas). Two world canvases exist today: GBA `packages/ui/src/components/WorldCanvas.tsx` (2,114 lines) and GBC `packages/ui/src/gbc/GbcWorldCanvas.tsx` (1,301 lines). This task builds the shared `WorldSurface` they will both become thin wrappers over (Tasks 7-8). **Neither family canvas is touched in this task; WorldSurface is tested only against a fake adapter.**

Read first: the plan `docs/superpowers/plans/2026-10-26-pokemap-plan-12b-world-surface.md` (Global Constraints, Task 5, and Task 6 so you know what NOT to build), the spec `docs/superpowers/specs/2026-10-24-pokemap-plan-12-shared-canvas-core-design.md` (rulings P12-3..P12-8, P12-4a..u), and the already-built shared pieces: `packages/ui/src/canvas/{view.ts,useStage.ts,worldView.ts,useWorldTiles.ts,useWorldDrag.ts}`.

## Files (create/modify exactly these)

- Create `packages/ui/src/canvas/worldSurfaceAdapter.ts` (types only, plus nothing executable).
- Create `packages/ui/src/canvas/WorldSurface.tsx`.
- Create `packages/ui/test/canvas/WorldSurface.test.tsx` (fake adapter).
- Modify `packages/ui/src/canvas/useStage.ts`: one small addition only (see "Zoom cap" below). Every existing `test/canvas/useStage.test.tsx` assertion must still hold.

Touch nothing else. Do not edit any existing test. No `gba`, `gbc` or `family` word or branch anywhere in `canvas/` (check: `rg -n -i 'gba|gbc|family' packages/ui/src/canvas`). Report unrelated bugs instead of fixing them.

## Scope split (binding)

Task 5 (this task) = render, view, data:
- Section/toolbar/legend/body/viewport/status skeleton (DOM order and class names taken from the two canvases; see "DOM").
- The `!world` placeholder (P12-5): inside `.world-canvas__viewport`, `<p className="app__canvas-placeholder">Could not load the world: {error}</p>` when `!world && error`, else `Loading world…` when `!world` (GBC `GbcWorldCanvas.tsx:1210-1214`).
- View through `useStage` (continuous policy, `WHEEL_FACTOR`, `worldZoomRange(nativePx)`, in-context cap via `useWorldContext().maxWorldZoom`).
- First-load fit, manual Fit, dungeon-filter fit, jump fit + jump highlight + reveal-on-jump.
- Culling, tile loading through `useWorldTiles`, the canvas draw loop (tiles → adapter extra layers → conflict badges).
- DOM overlays that need no Task 6 data, all from ONE projection (P12-6): selection outlines (render from a `selected: Set<string>` state that Task 6 will set; initial empty), jump highlight, encounter border, lens overlay, spotlight overlay, `WorldContextOverlayMount`. The lens control, lens legend, spotlight search and conflict legend render in the toolbar/legend as today. Encounter fetch per visible map (cache by ref, failure counted, `EncounterFetchAlert`), coverage via the adapter.
- `UnplacedRail` rendered with the unplaced names (hidden in context mode is Task 6; leave it shown) — rendering only; drops are Task 6.
- Status bar from adapter items.

Task 6 (NOT now): `useWorldDrag` wiring, mouse/click/double-click/key/context-menu handlers, hover + conflict tooltip, warp fetch/markers/connection lines/warp switches/warp alert/warp popup, dungeon auto-layout switch and its POST, placement POSTs and save errors, reload error alert, rail drop, hiding the rail in context. Leave a short `// Task 6:` marker where each plugs in, nothing more. The canvas element keeps `tabIndex={0}` and the family `aria-label` (adapter field).

## Adapter type (`worldSurfaceAdapter.ts`) — the design; you may refine names, not the shape

```ts
import type { ReactNode } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import type { PlacementLedger } from "../shared/placementLedger.js";
import type { SpeciesSummary } from "../encounters/summary.js";
import type { View } from "./view.js";

/** A placement as the surface sees it. Width/height are REAL (the adapter resolves GBA 0x0 orphans from its
 *  singleton sizes); component is the index into `components`, -1 for a manual orphan. */
export interface SurfacePlacement { map: string; x: number; y: number; width: number; height: number; component: number }
export interface SurfaceComponent { index: number; maps: readonly string[]; bounds: { x: number; y: number; width: number; height: number } }

export interface SurfaceWorld<P extends SurfacePlacement, C extends WireConflict> {
  /** Iteration order is draw order and hit order (topmost = last). */
  placements: ReadonlyMap<string, P>;
  components: readonly SurfaceComponent[];
  conflicts: readonly C[];
  dungeonAutoLayout: boolean;
}

/** The family world hook's result. The hook owns the GET, the optimistic positions and their reconciliation
 *  against each GET through the ledger (each family's existing code; Tasks 7-8). */
export interface WorldData<P extends SurfacePlacement, C extends WireConflict> {
  world: SurfaceWorld<P, C> | null;
  error: string | null;
  /** Issues a GET; returns its generation. */
  reload(): number;
  loadedGen: number;
  dismissError(): void;
  /** Optimistic positions (drag frames, rail drop); Task 6 calls it. */
  move(positions: ReadonlyMap<string, { x: number; y: number }>): void;
}

export interface WorldStatus<P extends SurfacePlacement, C extends WireConflict> {
  world: SurfaceWorld<P, C> | null;
  mapFilter: ReadonlySet<string> | null;
  zoomPercent: number;          // Math.round(zoom / nativePx * 100)
  hiddenCount: number;          // placed, non-empty, not drawnByDefault and not revealed (GBA's rule, global, not culled)
  unplacedCount: number;
  acceptedCount: number;        // conflictAcceptance.acceptedCount
  hover: null;                  // Task 6 widens this
}

export interface WorldSurfaceAdapter<P extends SurfacePlacement, C extends WireConflict> {
  /** Native px per world unit: 16 (tile) or 32 (block). Zoom range, LOD, context native, zoom %. */
  nativePx: number;
  /** Called once per render, unconditionally. */
  useWorld(ledger: PlacementLedger): WorldData<P, C>;
  imageUrl(p: P, version: number | undefined): string;
  /** A change drops every cached tile (time of day, or a constant). */
  cacheKey: string | number;
  /** Shown in the unfiltered world unless revealed by a jump. */
  drawnByDefault(p: P): boolean;
  /** Extra canvas layers drawn after tiles and before conflict badges (vertical-link triangles). */
  drawExtraLayers?(ctx: CanvasRenderingContext2D, a: { world: SurfaceWorld<P, C>; view: View; inScope(map: string): boolean }): void;
  conflictTooltip(c: C): string;
  /** Per-map encounter fetch (rejects on failure); the tint is the method-lens colour for that map, or null. */
  fetchEncounters(map: string): Promise<{ summaries: SpeciesSummary[]; methodTint: string | null }>;
  /** Encounter border inputs: the band (BORDER_BAND.<x>) and the optional time used for dimming. */
  border: { band: number; time?: unknown };   // tighten the type to EncounterBorder's props
  useCoverage(): { coverage: /* WorldLensLegend's coverage prop type */ unknown; error: string | null; levelByMap: readonly { mapName?: string | null; averageLevel: number }[]; emptyMapNames: ReadonlySet<string> };
  lensLegend: { methodKey?: unknown; legendCopy?: unknown }; // WorldLensLegend's props
  /** Status bar items, rendered inside `.world-canvas__status`. */
  statusItems(s: WorldStatus<P, C>): ReactNode;
  /** Canvas aria-label. */
  canvasLabel: string;
  /** Family toolbar groups the shared toolbar does not own, at the slot(s) the DOM comparison shows are needed. */
  toolbarExtras?: ReactNode;
}
```

Tighten every `unknown` above to the real prop types of the shared components (`WorldLensLegend`, `EncounterBorder`, `SpeciesSpotlight` hit type, `useLensOverlayEntries`). Confirm `methodTint` per family is a pure function of the fetched sources (GBC `methodTint`, GBA's `methodTintFor`), so computing it once at fetch time is equivalent; if not, say so in the report and change the field.

## `WorldSurface` props

```ts
export interface WorldSurfaceProps<P, C> {
  adapter: WorldSurfaceAdapter<P, C>;
  mapFilter?: Set<string> | null;
  jumpToMap?: string | null;
  jumpToken?: number;
  onSelectMap?(name: string): void;      // Task 6
  onOpenMap?(name: string): void;        // Task 6 + context menu hook
  onJumpToMap?(name: string): void;      // lens legend list
  onPlacementsSaved?(names: string[]): void; // Task 6
  onLayoutChanged?(): void;              // Task 6
  onEditHere?(name: string): void;
  context?: { map: string; origin: { x: number; y: number } | null; renderCanvas(view: MapView, onViewChange: (v: MapView) => void): ReactNode; onExitRequest(): void };
  tileVersions?: Record<string, number>;
}
export function WorldSurface<P extends SurfacePlacement, C extends WireConflict>(props: WorldSurfaceProps<P, C>): JSX.Element
```
These are the union of both canvases' props (minus GBC `time`, which the GBC adapter carries). The adapter object identity is stable per family input (the wrapper memoises it), so effects may depend on it.

## Behaviour rules (each from the spec/plan; cite them in comments where non-obvious)

1. **Ledger:** `const ledger = useRef(createPlacementLedger())`; pass `ledger.current` to `adapter.useWorld`.
2. **View (P12-4j):** `useStage<WorldView>` where `WorldView = View & { fitted?: boolean }` (uncontrolled), options: `zoomPolicy: { kind: "continuous", factor: WHEEL_FACTOR, ...worldZoomRange(nativePx), boundsFor }`, `mapName: "world"` (constant), `imgLoaded: false`, `pixelWidth: 0`, `pixelHeight: 0`, `bandNative: 0`, a `side` value the type accepts, `fit:` a stable callback that calls the latest surface fit through a ref, `chromeless: true` (the surface calls `useFitShortcut(fit, fitEnabled)` itself after `useWorldContext`, exactly as both canvases do; no `ContextMapFit` provider wraps a world canvas, so `useContextMapFit` stays inert).
3. **Zoom cap (useStage change):** add an optional `boundsFor?: (zoom: number) => { min: number; max: number }` to the continuous `StageZoomPolicy`. When present, `useStageZoom`'s updater clamps with `boundsFor(view.zoom)` of the updater's own view (GBC today: `zoomBoundsFor(v.zoom)` inside `setView`, `GbcWorldCanvas.tsx:887`, `:898`). Read `boundsFor` through a ref so a new function identity never re-binds the wheel listener. The surface's `boundsFor` is `(z) => worldZoomBounds(nativePx, z, latestMaxWorldZoom)` with `latestMaxWorldZoom` the current `worldContext.maxWorldZoom` via a ref (the context hook needs the stage's outputs, so it runs after `useStage`). Add one `useStage.test.tsx`-style test in the NEW test file (not the existing one): with `boundsFor` returning `max = max(base, current)`, a wheel-in at a zoom above `base` stays put and a wheel-out divides by 1.2.
4. **Scope and culling.** `inScope(map) = !mapFilter || mapFilter.has(map)`. `drawn` (memo, no pan/zoom dependency): world placements **in world placement order** (ruling P12-4t), skipping width/height ≤ 0, skipping maps outside the filter, and — only when there is no filter — skipping `!adapter.drawnByDefault(p) && !revealed.has(p.map)`. `visible` = `drawn` intersecting the viewport in world units (the shared AABB rule, both canvases' `intersects`), and **`[]` until `view.fitted`** (GBC's F5 gate: nothing is culled, requested or drawn from any pre-fit view; keep GBC's header comment's reasoning, shortened).
5. **First-load fit (P12-4e/m):** once per mount (ref), when `world` and a measured viewport (`w>0 && h>0`) exist: bounds = `mapFilter ? fitFilter(placements, mapFilter, components) : fitClusters(placements, components)`; if non-null, `updateView({ ...computeFit(bounds, viewport, worldZoomRange(nativePx)), fitted: true })` — one updater value so StrictMode's double invocation is harmless. Null bounds (empty world): no fit.
6. **Filter fit:** GBC's `fittedFilterRef` rule (`GbcWorldCanvas.tsx:548-556`, and GBA's long comment at `WorldCanvas.tsx:761-817` — keep its reasoning, shortened): once per `mapFilter` Set instance, reset when the filter goes null, via `fitFilter`.
7. **Manual Fit:** `mapFilter ? fitFilter : fitClusters`, same `computeFit` (P12-4m). `fit()` = context fit when in context else manual fit; `fitEnabled = !inContext || worldContext.fitEnabled` (both canvases).
8. **Jump (P12-4m/p/q/u):** GBC's effect (`GbcWorldCanvas.tsx:1114-1123`) with the applied-token ref: return early (token NOT stamped) while `!jumpToMap || !world || (mapFilter && !mapFilter.has(jumpToMap))` (P12-4u: wait). Then stamp; if the placement is missing or empty, stop. If `!mapFilter && !adapter.drawnByDefault(p)`, add it to `revealed` (P12-4q; GBA `WorldCanvas.tsx:721-723`). `updateView({ ...jumpFit(rect, viewport, worldZoomRange(nativePx)), fitted: true })`; `setJumpHighlight({ map, token })`. Fade effect scoped to `jumpHighlight` alone, 2000 ms (keep both canvases' reasoning). The highlight node is keyed by the token (P12-4p).
9. **Tiles:** `useWorldTiles({ visible, imageUrl: adapter.imageUrl, sizeOf: (p) => p, nativePx, cacheKey: adapter.cacheKey, tileVersions })`.
10. **Draw effect** (deps include `viewport` — keep the Task 21 canvas-blanking citation; and `tiles.version`): clear; for each visible placement with a tile, draw `small` when `smallTilesAt(zoom, nativePx)` else `img`, at `rectOf(p, view)`; then `adapter.drawExtraLayers?.(ctx, { world, view, inScope })`; then conflict badges exactly as GBC's loop (`GbcWorldCanvas.tsx:832-859`: in-scope only, non-empty placement, `conflictBadgeOffsets`, `conflictBadgeCenter`, `drawDiamond` with accepted/danger colours, the ✓, and a `badgesRef` of `{x,y,key,map,accepted,text}` with `text` = accepted prefix + `adapter.conflictTooltip(c)` for Task 6's tooltip). Compare with GBA's badge loop and report any difference. `drawDiamond` is imported from `../components/WorldCanvas.js` for now (it moves in Task 8).
11. **One projection (P12-6):** one `rectByMap` memo built with `rectOf(p, view)` over `visible`; selection outlines, jump highlight, encounter border, lens, spotlight all read it (selection/jump of an in-scope map that is drawn but culled may use `rectOf` directly — same function). No other `* zoom + pan` arithmetic in the surface.
12. **Encounters:** as both canvases (`GbcWorldCanvas.tsx:689-716`): per visible map at most once ever (not keyed on `cacheKey`), placeholder written synchronously, failure counted (`EncounterFetchAlert count`) and marked loaded, a version bump on arrival. Border side memo over every drawn placement (`pickBorderSide(rect, rects, adapter.border.band)`, keep the ponytail O(n²) comment). `EncounterBorder` gets `lodZoom = nativePx * LOD_SCALE`.
13. **Lens/spotlight:** `useLensOverlayEntries` with `levelColorByMap = themedLevelColorMap(levelByMap)` (import from `../components/WorldCanvas.js` for now), `emptyMapNames`, and `methodTintFor(map)` reading the encounter cache's stored tint; `SpotlightOverlay` with the best-percent hit per map (both canvases' `spotlightByMap`).
14. **Context:** `useWorldContext({ native: nativePx, context, placement: in-scope context placement with size > 0 or null, world: { pan, zoom, setView: (v) => updateView((prev) => ({ ...prev, zoom: v.zoom, pan: v.pan })) }, viewport, canvasRef, snapPointerRef, isBlocked: () => contextMenu.menu !== null })`, with `useConflictAcceptanceMenu({ conflicts: world?.conflicts, canvasRef, onOpenMap, onEditHere })` supplying `conflictAcceptance`, `contextMenu`, `snapPointerRef`. Render `WorldContextMenu` and `ConflictErrorToast` and `ConflictTooltip` (tooltip state stays null until Task 6).
15. **Unplaced names:** `singletonSizes(world.components)` keys not in `placements`, sorted (both canvases). Rail filter state as today.

## DOM

Build the JSX from both canvases (`GbcWorldCanvas.tsx:1151-1300`, `WorldCanvas.tsx:1813-2008`). Before writing it, diff the two families' toolbar, legend, body and status DOM (element order, class names, roles, aria, text). Everything identical goes in the surface; every difference becomes the smallest adapter slot (prefer `toolbarExtras`-style ReactNode slots and `statusItems`). Put the comparison table (element → GBA → GBC → where it lives now) in your report. No new class names, roles, aria or test ids except where a ruling names them.

## Comments

Moved logic keeps its rationale comments (shortened, the reason kept). Do not park a comment block above a short wrapper. No `key={url}`-style remounts anywhere.

## Tests (`packages/ui/test/canvas/WorldSurface.test.tsx`, fake adapter, all must pass)

Read `packages/ui/test/gbc/GbcWorldCanvas.test.tsx` for the existing harness patterns (viewport measuring via ResizeObserver/clientWidth mocks, fake `Image` with manual `onload`, a 2D context spy recording `drawImage`/path calls, StrictMode render). Write a fake adapter: placements, components (two 2-map clusters plus singletons), conflicts, `imageUrl` returning `/t/<map>?v=<n>`, `drawExtraLayers` recording a call, `useWorld` returning controlled data you can change between renders.

Required cases (hand-derive every expected number in a comment; a production call may only cross-check, never supply):
1. Placeholder: `error` and no world → "Could not load the world: boom"; neither → "Loading world…"; world loaded → no placeholder.
2. Under `<StrictMode>`: no `Image` is created and nothing drawn before the fit lands; after world + viewport, the view equals the hand-derived `fitClusters` fit (singletons excluded) and pan is applied exactly once (assert the exact pan numbers).
3. Manual Fit button gives the cluster fit after a wheel; filter fit uses the anchored members only (a shelved member far away excluded); jump fit at 60% (exact zoom/pan), highlight keyed by token (a re-jump of the same map renders a new node), reveal on jump of a `drawnByDefault=false` map (its tile is then requested), jump outside the filter waits and applies when the filter changes to include it.
4. Culling: a placement off-screen after the fit is never requested; a hidden-by-default one is not requested until revealed.
5. Draw order: tiles (`drawImage`) before the extra-layer call before the first badge path (record one ordered call log).
6. Projection: after a pan (drive `updateView` via a wheel event and the stage) and a wheel zoom, the jump-highlight outline's `left/top/width/height` equal the rect the canvas passed to `drawImage` for that map.
7. Retention reaches the draw: bump `tileVersions` for a map; until the new image's `onload`, the old image object is still drawn; after, the new one.
8. Status items render (`statusItems` receives `zoomPercent`, `hiddenCount`, `unplacedCount`; render them and assert text).
9. The zoom-cap test from rule 3.

Run new async tests under fake or bounded timers; never a DOM-mutating probe inside `waitFor`.

## Verify (Claude runs it; you cannot run vitest in the sandbox — if you can, use exactly this, from the repo root)

`npx vitest run packages/ui/test/canvas/WorldSurface.test.tsx packages/ui/test/canvas/useStage.test.tsx` → all pass; `npm run typecheck` → clean. Never run the full suite or `npm test`.

## Report

Write `docs/superpowers/task-reports/pokemap-plan-12b-world-surface/task-5-impl-notes.md`: files, the DOM comparison table, every family difference you found that this brief does not rule (keep each family's behaviour through an adapter field and list it — the conductor asks the user), the methodTint check, and anything you could not do. Commit if you can (`feat(canvas): 12b Task 5 WorldSurface render, view and data contract`); if git refuses (index.lock EPERM), leave the files and say so.
