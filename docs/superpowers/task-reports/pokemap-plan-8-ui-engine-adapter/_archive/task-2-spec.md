# Plan 8 Task 2: executed spec (shared world context mode)

Plan: `docs/superpowers/plans/2026-10-12-pokemap-plan-8-ui-engine-adapter.md`, section "Task 2". The plan's interface block is binding in intent; where it disagrees with the real code, the rulings below adapt it (R1). Base: `dc33490` on `plan-8-ui-engine-adapter`.

## Anchors (at `dc33490`)

GBA, `packages/ui/src/components/WorldCanvas.tsx`:
- `:340-352` `WorldCanvasContext` (`map`, `origin`, `renderCanvas`, `onExitRequest`). The prop type stays exported and unchanged.
- `:382-390` `snapPointerRef`, `menuPointRef`, `requestEditHere` (stay in the canvas; the hook reads `snapPointerRef`).
- `:422-423` world view is two states, `pan`/`setPan` and `zoom`/`setZoom`.
- `:1436-1523` the context section: `inContext`, placement + `sizeOfPlacement`, the snap effect (`snappedForRef`/`snappedFor`, focus on exit), the capture-phase Escape effect, `contextView`, `onContextViewChange`, `setContextZoom`, `overlayRef`, `onOverlayDoubleClick`.
- `:1541-1543` wheel bound `Math.min(Math.max(MAX_ZOOM, zoom), …)` (no context-specific cap; `MAX_ZOOM = 16`).
- `:2149-2176` overlay JSX.

GBC, `packages/ui/src/gbc/GbcWorldCanvas.tsx`:
- `:441-450` `GbcWorldCanvasContext` (same shape). Stays exported and unchanged.
- `:111-113` `GBC_MAX_ZOOM = 32`, `GBC_CONTEXT_MAX_ZOOM = GBC_MAX_ZOOM * 4`.
- `:480` one view state `view`/`setView` (`{ zoom, pan, fitted }`), updater form.
- `:936-1024` the context section (twin of GBA's; `validContextPlacement`, `zoomBoundsFor`, `native: BLOCK_PX`).
- `:1197-1204` the in-context `+ = - _` key handler, with the M6 bug at `:1201-1202` (`ZOOM_LEVELS.indexOf(contextView.zoom)` is -1 for a non-level zoom after a wheel, so `+` goes to 1x).
- `:1263` Fit all `disabled={inContext}`.
- `:1435-1462` overlay JSX.

Existing witnesses (must stay unchanged and green): `test/WorldCanvasContext.test.tsx`, `test/AppContextEdit.test.tsx`, `test/gbc/GbcWorldCanvasContext.test.tsx`, `test/gbc/GbcAppContext.test.tsx`, `test/gbc/GbcAppContextSelection.test.tsx`, `test/AppWorldContextMenu.test.tsx`, `test/stylesContext.test.ts`.

## Coordinator rulings (binding for the implementer)

R1. **Interface adapted to the real code.** Implement this (it supersedes the plan block's field names, keeps its intent):

```ts
// packages/ui/src/shared/useWorldContext.ts
import type { MapView, Zoom } from "../components/mapView.js";
export interface ContextPlacement { x: number; y: number; width: number; height: number }
export interface UseWorldContextArgs {
  native: number;                                   // 16 GBA tile, 32 GBC block. Required, no default.
  context: { map: string; origin: { x: number; y: number } | null; onExitRequest(): void } | null;
  placement: ContextPlacement | null;               // null unless width > 0 && height > 0
  world: { pan: { x: number; y: number }; zoom: number; setView(v: { pan: { x: number; y: number }; zoom: number }): void };
  viewport: { w: number; h: number };               // pivot for setContextZoom (centre)
  canvasRef: React.RefObject<HTMLCanvasElement>;    // box for the pointer at snap; focus target on exit
  snapPointerRef: React.MutableRefObject<{ x: number; y: number } | null>; // client px; read and cleared at snap
  isBlocked(): boolean;                             // family-specific: its context menu is open
}
export interface WorldContext {
  inContext: boolean;
  contextView: MapView | null;
  onContextViewChange(next: MapView): void;
  setContextZoom(z: Zoom): void;
  stepZoom(direction: 1 | -1): void;                // M6-safe; no-op while contextView is null
  overlayRef: React.RefObject<HTMLDivElement>;
  onOverlayDoubleClick(e: React.MouseEvent<HTMLDivElement>): void;
  maxWorldZoom(base: number): number;               // inContext ? base * 4 : base
}
export function useWorldContext(args: UseWorldContextArgs): WorldContext;
```

`WorldContextOverlay` (`packages/ui/src/shared/WorldContextOverlay.tsx`, a module-level component) renders exactly today's markup: `world-canvas__context` (with `ref={overlayRef}` and `onDoubleClick`), `world-canvas__context-dim` (`aria-hidden="true"`), `renderCanvas(contextView, onContextViewChange)` only when `contextView` is non-null, `world-canvas__context-bar` (`role="group"`, `aria-label="Editing <map> in place"`), `world-canvas__context-name`, `world-canvas__context-zoom` (`role="group"`, `aria-label="Zoom"`) with the `ZOOM_LEVELS` buttons (`map-canvas__btn`, `aria-pressed`, `disabled={!contextView}`, label `{z}×`), and Done (`aria-label="Done editing <map>"`). Props are the implementer's choice (e.g. `{ map, ctx: WorldContext, renderCanvas, onDone }`).

R2. **Escape check split.** The hook owns the capture-phase window listener and the shared checks: `e.key !== "Escape"`, `e.defaultPrevented`, `document.querySelector('[aria-modal="true"]')`, and the text-field `closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')`. The family supplies only `isBlocked()` (its `contextMenu.menu !== null`, read through a ref so the listener sees the latest value). The listener lives only while `inContext`. `onExitRequest` is read through a ref, as today.

R3. **`maxWorldZoom` is consumed by GBC only.** GBC's `zoomBoundsFor` becomes `{ min: GBC_MIN_ZOOM, max: Math.max(ctx.maxWorldZoom(GBC_MAX_ZOOM), current) }`. GBA keeps its own wheel bound unchanged: GBA has no context cap today (`test/WorldCanvasContext.test.tsx:279-308`), and `maxWorldZoom(16)` would let a 1x-context wheel-in rise above 16, an unnamed behaviour change.

R4. **M6, `stepZoom(direction)`.** `+1` → the smallest `ZOOM_LEVELS` entry strictly greater than `contextView.zoom`, else the largest level; `-1` → the largest entry strictly less, else the smallest. On a level this equals today's index ± 1, clamped. Then `setContextZoom(target)`. GBC's key handler at `:1197-1204` keeps its shape (`preventDefault`, consume the key even while `contextView` is null, `return`) and calls `ctx.stepZoom(direction)`. GBA has no in-context step-zoom UI and gains none; M6 is witnessed in the shared suite and the GBC family (same pattern as the Task 1 M3 ruling).

R5. **Snap effect deps.** Depend on `[contextName, placement?.x, placement?.y, placement?.width, placement?.height, hasOrigin]` (primitives), not on the family `world` object. Same behaviour: the ref guard already made re-runs on a new `world` with the same placement no-ops, and a world load still flips the placement from null to set. Keep the `eslint-disable` comment explaining that `zoom` is read at entry only.

R6. **Zero-size placement → `null`.** Both families pass `null` when the placement is missing or has width/height ≤ 0. GBC already does (`validContextPlacement`). GBA today snaps only for a positive size, and its overlay double-click with a zero-size placement would request an exit; after this, it is ignored. Accepted: a zero-size GBA map cannot be entered in the first place (no snap, no overlay canvas).

R7. **`world.setView` per family.** GBA: `(v) => { setZoom(v.zoom); setPan(v.pan); }` (two sequential setters, never nested, as today). GBC: `(v) => setView((prev) => ({ ...prev, zoom: v.zoom, pan: v.pan }))` (one updater, as today, keeping `fitted`).

R8. **No remount (Review focus 1).** Render `{context && <WorldContextOverlay … />}` in the same JSX position as today's `{context && (<div …>)}`. Do not change any `key`, wrapper, or the order of siblings around the world `<canvas>`. Never define the overlay component inside the canvas function body.

R9. **Focus on exit** stays in the hook's snap effect: when `contextName` becomes null after a snap, `canvasRef.current?.focus()`.

R10. **GBC-only UI stays GBC-side:** the `+ = - _` handler (calling `stepZoom`), Fit all `disabled={inContext}`, and the wheel's `zoomBoundsFor`. GBA keeps its wheel effect as is.

R11. **Comments.** Move the existing explanatory comments (snap timing, capture-phase rationale, StrictMode ref guard) into the hook, merged once; the canvases keep a one-line pointer to `shared/useWorldContext.ts`.

## Tests

- `packages/ui/test/shared/useWorldContext.test.tsx` (new), via `renderHook` with a fake world (`pan`, `zoom`, `setView` spy), a real `<canvas>` ref stub with a mocked `getBoundingClientRect`, and a fake context:
  - snap per family: GBA `native: 16` at world zoom 16/32/64 → `contextView.zoom` 1/2/4; GBC `native: 32` at 32/64/128 → 1/2/4;
  - enter centres the placement on the recorded client pointer (converted with the canvas box at snap time), and on the canvas centre with none; the pointer ref is cleared;
  - no snap while `origin` is null; snaps once (StrictMode-style re-render does not snap twice);
  - Escape (dispatched on `window`) calls `onExitRequest` once; not when `defaultPrevented`, not when `isBlocked()` is true, not from an `<input>`/contenteditable target, not when an `[aria-modal="true"]` element exists, including the case where a `document` bubble listener removes the modal on Escape (capture must judge first); no listener when not in context;
  - an overlay double-click outside the placement rect exits; inside it, or on `.world-canvas__context-bar`, does not;
  - `stepZoom` from a non-level zoom (world zoom set so `contextView.zoom` is e.g. 3.2 for GBC / 1.5 for GBA): `+1` → 4, `-1` → 2 (resp. 2 / 1); at 4, `+1` stays 4; at 1, `-1` stays 1;
  - `maxWorldZoom(32)` is 128 in context and 32 outside;
  - focus returns to the canvas on exit only after a snap.
- `packages/ui/test/gbc/GbcWorldCanvasContextZoom.test.tsx` (new; GBC M6 family witness), reusing the harness shape of `test/gbc/GbcWorldCanvasContext.test.tsx` (copy the minimum; do not edit that file): enter context, wheel out once at 128 (→ 128 / 1.2, overlay zoom ≈ 3.33), press `+` → the 4× button is `aria-pressed`; from the same non-level state, press `-` → 2×. Must FAIL on the pre-change code (record the failing run in the report: today `+` gives 1×).
- `WorldContextOverlay` needs no separate test file: the existing family tests pin its markup.

## Test oracle

`git diff dc33490 -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` must print nothing.

## Out of scope for the implementer

Step 6 (mutation teeth-proof) and Step 7's live check are run by the coordinator. The implementer runs Steps 1-5 and the gate, then commits.
