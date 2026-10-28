import { useRef, useState, useEffect, useLayoutEffect, type MouseEvent } from "react";
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
  /** Release of a map or group drag: maps off their start tile, each with its begun version. Once per gesture, only when non-empty. */
  commit(moves: WorldDragMove[]): void;
}

type Position = { x: number; y: number };
type DragState =
  | { kind: "pan" }
  // startTileX/Y is the placement's OWN position at the moment the drag
  // began, kept so release can tell "did this actually move to a
  // different tile" from "the user grabbed it and let go again" -- see
  // its own review-fix comment.
  | { kind: "map"; map: string; grabDX: number; grabDY: number; startTileX: number; startTileY: number; last: Position; version?: PlacementVersion }
  | { kind: "group"; anchorStart: Position; grabDX: number; grabDY: number; starts: Map<string, Position>; dx: number; dy: number; versions?: Map<string, PlacementVersion> }
  | { kind: "marquee"; rect: WorldDragRect }
  | null;

/** AABB test in world-tile space. Mirrors the CLI's render-world culling
 *  exactly (`p.x + p.width <= bx || p.x >= bx + bw || ...`) so the two stay
 *  consistent. */
function intersects(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return !(px + pw <= x0 || px >= x1 || py + ph <= y0 || py >= y1);
}

/** Full-containment AABB test, in world-tile space -- the "dragged right"
 *  half of the marquee's direction-sensitive selection.
 *  `intersects` (already in this file) is the "dragged left" / crossing
 *  half. */
function contains(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return px >= x0 && py >= y0 && px + pw <= x1 && py + ph <= y1;
}

function screenPoint(e: MouseEvent<HTMLElement>): Position {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function useWorldDrag<P extends { map: string; x: number; y: number }>(o: UseWorldDragOptions<P>): {
  onMouseDown(e: MouseEvent<HTMLElement>): void;
  /** True when a live drag consumed the move (the caller does hover only when false). */
  onMouseMove(e: MouseEvent<HTMLElement>): boolean;
  onMouseUp(): void;
  onMouseLeave(): void;
  /** Wire to useStage's onCancel (pointercancel / unexpected lostpointercapture). */
  cancel(): void;
  /** True after any live drag moved since the last mouse down: the following click/dblclick selects nothing. */
  dragMoved(): boolean;
  marqueeRect: WorldDragRect | null;
  draggingMap: boolean; // a map or group drag is live (cursor)
} {
  const dragRef = useRef<DragState>(null);
  // Review fix (CRITICAL): this used to rely on "the browser already
  // suppresses `click` after a real drag" -- that is false. A browser fires
  // `click` whenever mousedown and mouseup share the same target ELEMENT,
  // with no movement-distance suppression of any kind; confirmed live
  // against the real app, a 288x224px drag on the canvas still fired a
  // `click` afterward. Since a plain drag ALWAYS pans (mousedown starts a
  // "pan" drag whenever Shift is not held, regardless of what is under the
  // cursor -- see onMouseDown below), that click landed unguarded and
  // silently rewrote the selection at the end of every ordinary pan: two
  // Ctrl+click-selected maps could drop to zero, or collapse to whichever
  // single map the pan happened to end over.
  //
  // dragMovedRef (reset to false at the top of onMouseDown, set to true by
  // onMouseMove whenever a drag is actually live) is what actually tells a
  // genuine click apart from the trailing click of a completed drag
  // gesture -- not element identity, which a drag and a click share.
  // Ctrl/Cmd+click and Shift+click are both handled entirely in
  // onMouseDown (toggle, or a map/group drag) and must not ALSO trigger
  // the caller's plain-select behaviour, hence its modifier guards too.
  const dragMovedRef = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState<WorldDragRect | null>(null);
  const [draggingMap, setDraggingMap] = useState(false);

  // Review fix: a plain mousedown used to start a map-drag whenever the
  // cursor happened to be over a placement, with no way to tell that
  // apart from "the user just wants to pan from here" -- and placements
  // cover most of the viewport (measured live: ~35% at the default zoom,
  // ~100% once panned inside a landmass), so panning was effectively
  // broken exactly where it matters most. A plain drag now ALWAYS pans,
  // matching every other map-like tool (Google Maps, Porymap's own
  // connection editor); moving a placement is the special case and
  // requires holding Shift while the drag starts over it -- surfaced to
  // the user via the caller's hover status strip's "Shift+drag to move"
  // hint, not left undiscoverable.
  const onMouseDown = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || dragRef.current) return;
    dragMovedRef.current = false;
    const s = screenPoint(e);
    const w = o.toWorld(s.x, s.y);
    if (e.ctrlKey || e.metaKey) {
      const hit = o.hitTest(w.x, w.y);
      if (hit) {
        o.setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(hit.map)) next.delete(hit.map);
          else next.add(hit.map);
          return next;
        });
      } else {
        const rect = { x0: s.x, y0: s.y, x1: s.x, y1: s.y };
        dragRef.current = { kind: "marquee", rect };
        setMarqueeRect(rect);
      }
      return;
    }
    const hit = e.shiftKey ? o.hitTest(w.x, w.y) : null;
    if (hit) {
      const grabDX = w.x - hit.x, grabDY = w.y - hit.y;
      if (o.selected.has(hit.map) && o.selected.size > 1) {
        const starts = new Map<string, Position>();
        for (const name of o.selected) {
          const p = o.placement(name);
          if (p) starts.set(name, { x: p.x, y: p.y });
        }
        dragRef.current = { kind: "group", anchorStart: { x: hit.x, y: hit.y }, grabDX, grabDY, starts, dx: 0, dy: 0 };
      } else {
        dragRef.current = { kind: "map", map: hit.map, grabDX, grabDY, startTileX: hit.x, startTileY: hit.y, last: { x: hit.x, y: hit.y } };
      }
      setDraggingMap(true);
    } else {
      dragRef.current = { kind: "pan" };
      o.stage.startPan(e);
    }
  };

  const onMouseMove = (e: MouseEvent<HTMLElement>): boolean => {
    const drag = dragRef.current;
    if (!drag) return false;
    // Any live drag (pan/map/group/marquee) counts as real movement for
    // dragMovedRef's purpose -- see its own comment above for why.
    dragMovedRef.current = true;
    if (drag.kind === "pan") o.stage.movePan(e);
    else if (drag.kind === "marquee") {
      const s = screenPoint(e);
      drag.rect = { ...drag.rect, x1: s.x, y1: s.y };
      setMarqueeRect(drag.rect);
    } else {
      const s = screenPoint(e);
      const w = o.toWorld(s.x, s.y);
      const nx = Math.round(w.x - drag.grabDX), ny = Math.round(w.y - drag.grabDY);
      if (drag.kind === "map") {
        drag.version ??= o.ledger.begin(drag.map);
        if (nx !== drag.last.x || ny !== drag.last.y) {
          drag.last = { x: nx, y: ny };
          o.movePlacements(new Map([[drag.map, drag.last]]));
        }
      } else {
        const dx = nx - drag.anchorStart.x, dy = ny - drag.anchorStart.y;
        drag.versions ??= new Map([...drag.starts.keys()].map((name) => [name, o.ledger.begin(name)]));
        // Review fix: mirrors the "map" branch's own no-op guard just above
        // -- skip creating a new `world` object (and re-running every
        // world-keyed useMemo, including the full placement cull) when the
        // anchor's rounded position has not actually changed since the last
        // update, the same sub-tile-mousemove waste sizeByMap/unplacedNames
        // were already fixed for.
        if (dx !== drag.dx || dy !== drag.dy) {
          drag.dx = dx;
          drag.dy = dy;
          o.movePlacements(new Map([...drag.starts].map(([name, start]) => [name, { x: start.x + dx, y: start.y + dy }])));
        }
      }
    }
    return true;
  };

  const clear = () => {
    dragRef.current = null;
    setDraggingMap(false);
    setMarqueeRect(null);
  };

  // Review fix: shared so onMouseLeave can run the identical commit check
  // -- see its own comment below for why leaving the canvas mid-drag
  // needs this too, not just mouseup.
  const onMouseUp = () => {
    const drag = dragRef.current;
    const moves: WorldDragMove[] = [];
    if (drag?.kind === "map" && drag.version !== undefined) {
      // Review fix: only write when the placement actually landed on a
      // different tile than it started on -- a Shift+click (or a Shift+drag
      // that rounds back to the same tile) must not silently POST an
      // unchanged position and spend a write for nothing.
      if (drag.last.x !== drag.startTileX || drag.last.y !== drag.startTileY) {
        moves.push({ map: drag.map, ...drag.last, version: drag.version });
      } else o.ledger.noop(drag.map, drag.version);
    } else if (drag?.kind === "group" && drag.versions) {
      for (const [name, start] of drag.starts) {
        const version = drag.versions.get(name)!;
        if (drag.dx !== 0 || drag.dy !== 0) moves.push({ map: name, x: start.x + drag.dx, y: start.y + drag.dy, version });
        else o.ledger.noop(name, version);
      }
    } else if (drag?.kind === "marquee") {
      const r = drag.rect;
      const a = o.toWorld(r.x0, r.y0), b = o.toWorld(r.x1, r.y1);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const test = r.x1 > r.x0 ? contains : intersects;
      const hits = new Set<string>();
      for (const p of o.marqueeCandidates()) {
        if (test(p.x, p.y, p.width, p.height, x0, y0, x1, y1)) hits.add(p.map);
      }
      o.setSelected(() => hits);
    } else if (drag?.kind === "pan") o.stage.endPan();
    if (moves.length) o.commit(moves);
    clear();
  };

  // Review fix: releasing a Shift+drag outside the canvas (toward the side
  // rail or the status bar is a completely normal gesture) used to clear
  // the drag state here WITHOUT running onMouseUp's commit logic -- the map
  // had already been moved visually (onMouseMove writes straight into
  // `world`), so it looked placed, but nothing was ever POSTed, and it
  // silently reverted on the next reload. Runs the exact same commit
  // onMouseUp does before clearing state, so this outcome now matches an
  // ordinary mouseup.
  //
  // The stage's setPointerCapture is the primary, more robust fix in a real
  // browser: once captured, mousemove/mouseup stay targeted at the canvas
  // even past its bounds -- or past the browser window entirely -- until
  // the button is released, so mouseleave normally does not fire mid-drag
  // at all, and the eventual commit reflects wherever the button actually
  // came up, not just wherever the cursor first crossed the canvas edge.
  // jsdom has no hit-testing/capture model, so fireEvent.mouseLeave fires
  // unconditionally in tests regardless of any capture call -- which is
  // exactly what makes this fallback the one half of the fix a unit test
  // can pin; the capture half was confirmed by hand in a real browser
  // instead (setPointerCapture actually invoked and accepted --
  // canvas.hasPointerCapture(id) true immediately after a real pointerdown,
  // false again after the matching pointerup). With capture held, leave
  // keeps the gesture live for the eventual mouseup.
  const onMouseLeave = () => { if (!o.stage.hasCapture()) onMouseUp(); };

  const cancel = () => {
    const drag = dragRef.current;
    if (drag?.kind === "map" && drag.version !== undefined) {
      o.movePlacements(new Map([[drag.map, { x: drag.startTileX, y: drag.startTileY }]]));
      o.ledger.noop(drag.map, drag.version);
    } else if (drag?.kind === "group" && drag.versions) {
      o.movePlacements(new Map(drag.starts));
      for (const [name, version] of drag.versions) o.ledger.noop(name, version);
    }
    // Stage already dropped a cancelled pan. Preserve the trailing-click guard.
    clear();
  };

  // Unmount mid-gesture settles it like a cancel: begun maps revert and their versions noop, so none stays pending.
  const cancelRef = useRef(cancel);
  useLayoutEffect(() => {
    cancelRef.current = cancel;
  });
  useEffect(() => () => cancelRef.current(), []);

  return { onMouseDown, onMouseMove, onMouseUp, onMouseLeave, cancel,
    dragMoved: () => dragMovedRef.current, marqueeRect, draggingMap };
}
