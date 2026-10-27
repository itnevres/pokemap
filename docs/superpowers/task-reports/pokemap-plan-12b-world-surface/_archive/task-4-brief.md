# Task 4 brief: world drag dispatcher `packages/ui/src/canvas/useWorldDrag.ts` — High

Plan 12b (PokeMap, unified GBA/GBC world canvas). This hook is GBA's world drag dispatcher, lifted out of `packages/ui/src/components/WorldCanvas.tsx` so a later task's shared `WorldSurface` uses it for both families. It is NOT wired into any canvas in this task.

Create exactly two files:
- `packages/ui/src/canvas/useWorldDrag.ts`
- `packages/ui/test/canvas/useWorldDrag.test.tsx`

Touch nothing else. No `gba`/`gbc`/`family` word or branch anywhere in the hook.

## Source to lift (read it; move its rationale comments with the code, shortened only where a comment explains a GBA-only detail)

`packages/ui/src/components/WorldCanvas.tsx`:
- `DragState` type, lines 189-198; `intersects`/`contains`, lines 248-262.
- `onMouseDown` 1476-1515 (and the long comment above it from ~1455), `onCanvasClick`'s `dragMovedRef` comment 1517-1536, `onMouseMove` drag branches 1584-1640, `commitMapDrag` 1657-1671, `commitGroupDrag` 1673-1684, `commitMarquee` 1686-1701, `onMouseUp` 1703-1710, `onMouseLeaveCanvas` and its comment 1712-1744.
- Ledger: `packages/ui/src/shared/placementLedger.ts` (`begin`, `noop`; read `noop` at lines 93-104).
- Stage capture: `packages/ui/src/canvas/useStage.ts` lines 128-205 (`startPan`, `movePan`, `endPan`, `hasCapture`, `onCancel` option).

## API (exact names)

```ts
import type { PlacementLedger, PlacementVersion } from "../shared/placementLedger.js";

export interface WorldDragMove { map: string; x: number; y: number; version: PlacementVersion }
export interface WorldDragRect { x0: number; y0: number; x1: number; y1: number } // canvas-local screen px

export interface WorldDragStage {
  startPan(point: { clientX: number; clientY: number }): void;
  movePan(point: { clientX: number; clientY: number }): void;
  endPan(): void;
  hasCapture(): boolean;
}

export interface UseWorldDragOptions<P extends { map: string; x: number; y: number }> {
  stage: WorldDragStage;
  /** Canvas-local screen px -> world native units, under the current view. */
  toWorld(sx: number, sy: number): { x: number; y: number };
  /** Topmost placement at a world point, or null. */
  hitTest(wx: number, wy: number): P | null;
  /** Current position of a placed map (group starts), or undefined. */
  placement(map: string): P | undefined;
  selected: ReadonlySet<string>;
  setSelected(update: (prev: ReadonlySet<string>) => Set<string>): void;
  /** Optimistic position update for the given maps (no POST). */
  movePlacements(positions: ReadonlyMap<string, { x: number; y: number }>): void;
  /** Maps a marquee may select, with their sizes in native units (the caller's culled visible list). */
  marqueeCandidates(): Iterable<{ map: string; x: number; y: number; width: number; height: number }>;
  ledger: PlacementLedger;
  /** Release of a map or group drag: the maps that ended off their start tile, each with its begun version. Called once per gesture, only when non-empty. */
  commit(moves: WorldDragMove[]): void;
}

export function useWorldDrag<P extends { map: string; x: number; y: number }>(o: UseWorldDragOptions<P>): {
  onMouseDown(e: React.MouseEvent<HTMLElement>): void;
  /** True when a live drag consumed the move (the caller does hover only when false). */
  onMouseMove(e: React.MouseEvent<HTMLElement>): boolean;
  onMouseUp(): void;
  onMouseLeave(): void;
  /** Wire to useStage's `onCancel` (pointercancel / unexpected lostpointercapture). */
  cancel(): void;
  /** True after any live drag moved since the last mouse down: the following click/dblclick selects nothing. */
  dragMoved(): boolean;
  marqueeRect: WorldDragRect | null;
  draggingMap: boolean; // a map or group drag is live (cursor)
}
```

Screen point of a mouse event: `e.clientX - rect.left`, `e.clientY - rect.top` with `rect = e.currentTarget.getBoundingClientRect()` (as GBA).

## Behaviour (GBA's today, unless stated)

1. Mouse down, button 0 only (others ignored). Reset `dragMoved` to false.
   - Ctrl or Meta on a map: toggle it in the selection via `setSelected(prev => ...)`. No drag.
   - Ctrl or Meta on empty space: marquee from the screen point; `marqueeRect = {x0:sx, y0:sy, x1:sx, y1:sy}`.
   - Shift on a map: if the map is selected and the selection has more than one map, a group drag (starts = `placement(name)` for each selected map that resolves); else a map drag (start tile = the hit placement's x, y). `grabDX = w.x - hit.x`, `grabDY = w.y - hit.y`. `draggingMap = true`.
   - Otherwise (including Shift on empty space): `stage.startPan(e)`.
2. Mouse move: if a drag is live, `dragMoved = true`.
   - Pan: `stage.movePan(e)`.
   - Map: `nx = Math.round(w.x - grabDX)`, `ny = Math.round(w.y - grabDY)`. On the FIRST move only, `version = ledger.begin(map)` BEFORE the first `movePlacements` call. Then `movePlacements(new Map([[map, {x:nx, y:ny}]]))` only when (nx, ny) differs from the last position sent (or from the start for the first move). Remember the last position in the drag state.
   - Group: anchor delta `dx = Math.round(w.x - grabDX) - anchorStart.x`, same for y. On the first move, `ledger.begin(name)` for every member (in `starts` order) BEFORE the first `movePlacements`. Then move every member to `start + (dx, dy)` when the delta changed since the last send.
   - Marquee: `marqueeRect = {x0:startX, y0:startY, x1:sx, y1:sy}`.
   - Returns true while any drag is live, false otherwise.
3. Release (mouse up): 
   - Map drag with a version: the last position differs from the start tile → `commit([{map, x, y, version}])`; else `ledger.noop(map, version)`.
   - Group drag with versions: each member off its start → into one `commit(moves)` call (start order); each member back on its start → `ledger.noop(name, version)`. `commit` is not called with an empty list.
   - A map or group drag that never moved began nothing and calls neither.
   - Marquee: world corners `toWorld(x0,y0)`, `toWorld(x1,y1)`, min/max; `draggedRight = x1 > x0` (screen) → full containment, else intersection (GBA `contains`/`intersects`, keep both functions and their comments); `setSelected(() => hits)` replaces the selection.
   - Pan: `stage.endPan()`.
   - Then clear: drag null, `draggingMap = false`, `marqueeRect = null`.
4. Mouse leave: if `stage.hasCapture()` → do nothing (the gesture continues; mouseup ends it wherever it happens; the caller clears hover). Else run exactly the release of step 3 (GBA's commit-on-leave fallback, `WorldCanvas.tsx:1712-1744`; GBA commits a marquee on leave too, keep that).
5. `cancel()` (P12-4a: pointercancel / unexpected lostpointercapture): drop the gesture with no commit. A map or group drag that began versions: move every begun map back to its start position with one `movePlacements` call, then `ledger.noop(name, version)` for each. A marquee clears `marqueeRect` without changing the selection. A pan: nothing (useStage already dropped its pan). Clear drag state. `dragMoved` stays as it was (a click right after a cancelled moved drag still selects nothing).
6. Drag state lives in a ref (not React state), so handlers in one render see each other's writes; `marqueeRect` and `draggingMap` are state. Mouse down while a gesture is live (a second mousedown) is ignored.

## Tests (`test/canvas/useWorldDrag.test.tsx`), all with a real `createPlacementLedger()` and a fake stage `{ startPan, movePan, endPan: vi.fn(), hasCapture: () => captured }`

Use `renderHook` plus a tiny harness: identity projection (`toWorld = (sx, sy) => ({ x: sx / 10, y: sy / 10 })`, i.e. 10 px per native unit, pan 0), placements in a mutable Map the fake `movePlacements` writes to, `hitTest` topmost-last over that map. Call handlers inside `act` with fake events `{ button: 0, clientX, clientY, ctrlKey, metaKey, shiftKey, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }`. Derive every expected number by hand in a comment.

Each must exist:
1. Each drag kind starts from the right modifiers: plain on a map → pan (startPan called, no begin); Shift on a map → map drag; Shift on a selected map in a selection of 2+ → group; Shift on a map selected alone → map drag; Shift on empty → pan; Ctrl on a map → toggle on, again → off (no drag, no pan); Meta same as Ctrl; Ctrl on empty → marquee; button 2 → nothing.
2. Group drag moves every selected map by the anchor's rounded delta (hand-derived positions); unselected maps unchanged.
3. Marquee direction: dragged right selects only fully contained maps; dragged left (same rectangle) selects intersecting maps too; the selection is replaced, not merged.
4. `dragMoved`: false after mouse down; true after a moved pan, map, group or marquee; reset by the next mouse down; false after a down/up with no move.
5. Ledger ordering: `begin` runs before the first `movePlacements` (spy order, map and group); a drag with no move calls neither `begin` nor `commit`.
6. Release off start → `commit` once with the hand-derived position and the begun version; then `ledger.moved` by the caller is not this hook's job (do not call it).
7. A drag returned to its start tile calls `noop` (spy on the real ledger), never `commit`; after `noop`, `ledger.serverShows(map, ledger.snapshot())` is true.
8. Group release with one member returned... (a group moves as one, so instead): group moved off start → one `commit` call carrying every member, in start order.
9. Capture held (`hasCapture` true): mouse leave mid map drag commits nothing and keeps the drag; the next mouse up (outside) commits once.
10. No capture: mouse leave mid map drag commits once; a following mouse up commits nothing more; mid group drag same; mid marquee replaces the selection (GBA) and clears the rect; mid pan calls `endPan`.
11. Cancel: mid map drag → no commit, the map is back at its start position, `noop` called; with no earlier POST in flight, `ledger.serverShows(map, ledger.snapshot())` is true right after. Cancel after an unresolved POST of the same map (call `ledger.moved(map, v1)` for an earlier version first, unresolved): the map stays pending (`serverShows` false) until `ledger.resolve(map, v1, true)`, then true (`placementLedger.ts:93-104`). Cancel mid group drag reverts every member. Cancel mid marquee keeps the selection and clears the rect. A mouse up after cancel commits nothing.
12. Mouse down while a gesture is live does not start a second one (pointerdown → mousedown ordering: one gesture).
13. `onMouseMove` returns false with no drag, true during one.

## Mutations the conductor will run after you finish (your tests must catch each)

Group drag moves only the anchor; marquee ignores direction; cancel commits; cancel skips `noop`; a returned drag commits; the no-capture leave drops a map drag; `dragMoved` not set on pan.

## Verify

Codex cannot run vitest here; the conductor runs it. Make the code typecheck by reading: strict TS, ESM `.js` import suffixes, React 19 types. Match the repo's terse comment style. Commit both files in this worktree with message `feat(canvas): 12b Task 4 world drag dispatcher (useWorldDrag)` if you can; if commit fails, leave them uncommitted and say so.
