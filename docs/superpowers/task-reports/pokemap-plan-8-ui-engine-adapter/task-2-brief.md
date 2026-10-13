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

