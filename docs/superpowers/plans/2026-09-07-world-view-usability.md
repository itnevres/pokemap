# World View Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select map moving, a World-mode jump-to-map (reusing the existing sidebar filter), and a species type-ahead dropdown to PokeMap's world view.

**Architecture:** All three features extend `WorldCanvas.tsx` and its immediate collaborators (`App.tsx`, `MapTree.tsx`, `SpeciesSpotlight.tsx`) with no new top-level components. One new server route (`GET /api/species`) exposes `coverage.ts`'s already-implemented `allSpecies()`. No decomp writes beyond the existing `/api/world/placement` route, reused as-is.

**Tech Stack:** React 19, TypeScript strict, vitest + @testing-library/react, existing Node HTTP server (no framework).

**Spec:** `docs/superpowers/specs/2026-09-07-world-view-usability-design.md`

---

## Before you start

Read `packages/ui/src/components/WorldCanvas.tsx` in full — it's ~1,240 lines and every task below modifies it. In particular, understand before touching anything:

- `DragState` (a discriminated union) and the `dragRef` it lives in — the existing `"pan"`/`"map"` kinds and how `onMouseDown`/`onMouseMove`/`onMouseUp`/`onMouseLeaveCanvas`/`onPointerDownCapture` cooperate.
- `sizeOfPlacement`/`componentOfPlacement` — every placement's size/component MUST go through these, never `components[placement.component]` directly (a `component: -1` sentinel exists for manually-placed, not-yet-clustered maps).
- `visible` (culled placements), `screenToWorld`, `hitTest`.
- `computeFit`/`worldBoundsOf` — reused for the jump feature.
- The existing DOM-overlay pattern (`lensOverlayEntries`, `spotlightOverlayEntries`, each a `useMemo` producing `{ map, rect, ... }[]`, rendered as absolutely-positioned `<div>`s). New visual overlays (selection outline, marquee, jump highlight) follow this exact pattern — **never** add new drawing to the imperative canvas `useEffect` (already dense; this file's own history has several postmortems about that).
- `postPlacement(map, x, y)` — the existing single-placement POST helper, reused unchanged.

Every step that touches `WorldCanvas.tsx` runs the full file's test suite before and after, since this file has no internal module boundaries to isolate a change to.

---

## Task 1: Multi-select move

**Files:**
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

### Step 1: Write the failing tests for plain click / Ctrl+click selection

Add to `packages/ui/test/WorldCanvas.test.tsx`, inside a new `describe` block after the existing ones (before the final closing of the outer `describe("WorldCanvas", ...)`):

```tsx
  // -------------------------------------------------------------------
  // Multi-select move
  // -------------------------------------------------------------------
  describe("multi-select", () => {
    function threeMapsWorld() {
      return makeWorld({
        placements: {
          A: { map: "A", x: 0, y: 0, width: 10, height: 10, component: 0 },
          B: { map: "B", x: 20, y: 0, width: 10, height: 10, component: 1 },
          C: { map: "C", x: 0, y: 20, width: 10, height: 10, component: 2 },
        },
      });
    }

    it("plain click on a map selects only that map", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0 }); // inside A
      fireEvent.mouseUp(canvas, { clientX: 5, clientY: 5 });
      fireEvent.click(canvas, { clientX: 5, clientY: 5 });

      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(1);
    });

    it("plain click on empty canvas clears the selection", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0 });
      fireEvent.mouseUp(canvas, { clientX: 5, clientY: 5 });
      fireEvent.click(canvas, { clientX: 5, clientY: 5 });
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(1);

      fireEvent.mouseDown(canvas, { clientX: 90, clientY: 90, button: 0 }); // empty space
      fireEvent.mouseUp(canvas, { clientX: 90, clientY: 90 });
      fireEvent.click(canvas, { clientX: 90, clientY: 90 });
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(0);
    });

    it("Ctrl+click toggles a map in and out of the selection without starting a drag", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // A
      fireEvent.mouseDown(canvas, { clientX: 25, clientY: 5, button: 0, ctrlKey: true }); // B
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(2);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // toggle A off
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(1);
    });

    it("a plain drag over a map still pans and does not change the selection", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // select A
      fireEvent.mouseDown(canvas, { clientX: 25, clientY: 5, button: 0 }); // plain drag starting on B
      fireEvent.mouseMove(canvas, { clientX: 40, clientY: 20 });
      fireEvent.mouseUp(canvas, { clientX: 40, clientY: 20 });

      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(1);
    });
  });
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "multi-select"`
Expected: FAIL — `.world-canvas__selection-outline` never appears (no such class exists yet).

### Step 3: Add selection state and the click handler

In `packages/ui/src/components/WorldCanvas.tsx`, add a new state hook next to the existing ones (after `const [lens, setLens] = useState<LensId | null>(null);`):

```ts
  // Feature: multi-select move. Plain click selects one map (clearing the
  // rest); Ctrl/Cmd+click toggles; a marquee (Step 5) replaces the
  // selection outright. Set of map NAMES, matching how everything else in
  // this file keys placements.
  const [selected, setSelected] = useState<Set<string>>(new Set());
```

Add a new handler after `onMouseMove` (before `commitMapDrag`):

```ts
  // Native click, not a custom mousedown/mouseup movement-threshold check:
  // the browser already suppresses `click` after a real drag (mousedown
  // and mouseup at meaningfully different positions), so this only ever
  // fires for a genuine click -- no new "was this a drag" logic needed.
  // Ctrl/Cmd+click and Shift+click are both handled entirely in
  // onMouseDown (toggle, or a map/group drag) and must not ALSO trigger
  // this plain-select behaviour, hence the guard.
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(w.x, w.y);
    setSelected(hit ? new Set([hit.map]) : new Set());
  };
```

Wire `onClick` onto the canvas element (in the JSX, alongside the existing `onMouseDown`/`onMouseMove`/etc.):

```tsx
            onMouseUp={onMouseUp}
            onClick={onCanvasClick}
```

Now handle Ctrl/Cmd+click in `onMouseDown`. Replace the existing `onMouseDown` body:

```ts
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (e.ctrlKey || e.metaKey) {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(hit.map)) next.delete(hit.map);
          else next.add(hit.map);
          return next;
        });
      }
      // Ctrl/Cmd+drag starting on empty space becomes a marquee -- Step 5.
      return;
    }

    const hit = e.shiftKey ? hitTest(w.x, w.y) : null;
    if (hit) {
      dragRef.current = { kind: "map", map: hit.map, grabDX: w.x - hit.x, grabDY: w.y - hit.y, startTileX: hit.x, startTileY: hit.y };
      setIsDraggingMap(true);
    } else {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: pan };
    }
  };
```

(This is the same body as before, with the new `if (e.ctrlKey || e.metaKey)` branch inserted at the top. Group-drag on a multi-selection is Step 7 — for now Shift+drag still only ever moves the single map hit.)

### Step 4: Add the selection outline overlay

Add a new memo after `spotlightOverlayEntries`:

```ts
  const selectionOverlayEntries = useMemo(() => {
    if (selected.size === 0) return [] as Array<{ map: string; rect: EncounterGutterMapEntry["rect"] }>;
    const out: Array<{ map: string; rect: EncounterGutterMapEntry["rect"] }> = [];
    for (const p of visible) {
      if (!selected.has(p.map)) continue;
      const size = sizeOfPlacement(p, sizeByMap);
      out.push({ map: p.map, rect: { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom } });
    }
    return out;
  }, [selected, visible, sizeByMap, pan, zoom]);
```

Render it in the JSX, immediately after the `<EncounterGutter .../>` line:

```tsx
          <EncounterGutter maps={encounterEntries} zoom={zoom} />
          {selectionOverlayEntries.length > 0 && (
            <div className="world-canvas__selection" aria-hidden="true">
              {selectionOverlayEntries.map((e) => (
                <div
                  key={e.map}
                  className="world-canvas__selection-outline"
                  style={{ left: e.rect.x, top: e.rect.y, width: e.rect.width, height: e.rect.height }}
                />
              ))}
            </div>
          )}
```

### Step 5: Run tests to verify they pass

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "multi-select"`
Expected: FAIL still — the CSS class exists in JSX now but there's no visible styling difference the test cares about; the test only checks the class is present in the DOM, which it now is once `selected` is populated. Re-check: the click handler needs a real style class rendered. At this point the 4 tests from Step 1 should PASS (the DOM query only checks for element presence, not computed style). If any fail, re-read the failure — a common mistake here is the click firing before `mountReady`'s canvas rect stub is applied; `mountReady` already sets `getBoundingClientRect`, so this should not occur if Step 1's tests use the `canvas` returned by `mountReady`.

Expected: PASS, 4 tests.

### Step 6: Commit

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): click/Ctrl+click map selection in the world view"
```

### Step 7: Write the failing test for marquee selection

Add to the `describe("multi-select", ...)` block:

```tsx
    it("Ctrl+drag right selects only maps fully enclosed by the marquee", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      // A is [0,10)x[0,10), B is [20,30)x[0,10), C is [0,10)x[20,30).
      // Starting the drag AT (0,0) would land directly inside A's own
      // hit-box and take the plain Ctrl+click toggle path instead of ever
      // starting a marquee -- (-5,-5) is genuinely empty space, so this
      // actually exercises the marquee's containment test. A marquee from
      // (-5,-5) to (25,15) fully encloses A (C's top edge is at 20, out of
      // the y-span) but only PARTIALLY overlaps B (B's rect is
      // [20,30)x[0,10) -- the marquee's x-span [-5,25] covers B's left
      // portion, 20 to 25, but not its right portion, 25 to 30). B
      // therefore intersects the marquee without being contained by it --
      // this is deliberate, not incidental: if a right-drag ever used the
      // crossing test (`intersects`) instead of the enclosure test
      // (`contains`), B would wrongly join the selection here too, and
      // this test would catch it (confirmed live: a deliberate swap of
      // contains/intersects in the implementation turns this test red).
      fireEvent.mouseDown(canvas, { clientX: -5, clientY: -5, button: 0, ctrlKey: true });
      fireEvent.mouseMove(canvas, { clientX: 25, clientY: 15, ctrlKey: true });
      fireEvent.mouseUp(canvas, { clientX: 25, clientY: 15 });

      const outlines = canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline");
      expect(outlines.length).toBe(1);
    });

    it("Ctrl+drag left selects every map the marquee touches at all", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      // A marquee from (25,-5) back to (5,15) (end.x < start.x: a
      // left-drag). Its world x-span is [5,25] (y-span [-5,15], covering
      // both A and B's own y-band). A's rect [0,10)x[0,10) sticks out
      // past the marquee's left edge (0 < 5); B's rect [20,30)x[0,10)
      // sticks out past its right edge (30 > 25) -- both merely crossed,
      // neither fully enclosed, and C ([0,10)x[20,30)) sits entirely
      // below the marquee's y-span and is untouched.
      fireEvent.mouseDown(canvas, { clientX: 25, clientY: -5, button: 0, ctrlKey: true });
      fireEvent.mouseMove(canvas, { clientX: 5, clientY: 15, ctrlKey: true });
      fireEvent.mouseUp(canvas, { clientX: 5, clientY: 15 });

      const outlines = canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline");
      expect(outlines.length).toBe(2);
    });

    it("a Ctrl+drag over empty space selects nothing and clears any prior selection", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // select A
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(1);

      fireEvent.mouseDown(canvas, { clientX: 60, clientY: 60, button: 0, ctrlKey: true });
      fireEvent.mouseMove(canvas, { clientX: 70, clientY: 70, ctrlKey: true });
      fireEvent.mouseUp(canvas, { clientX: 70, clientY: 70 });

      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(0);
    });
```

### Step 8: Run test to verify it fails

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "marquee"`
Expected: FAIL — Ctrl+drag on empty space currently does nothing at all (falls through `onMouseDown`'s new Ctrl branch with `hit` null, `return`s without starting any drag).

### Step 9: Implement the marquee

Add a `contains` helper near the existing `intersects` function (top of the file, after `intersects`):

```ts
/** Full-containment AABB test, in world-tile space -- the "dragged right"
 *  half of the marquee's direction-sensitive selection (Step 9 below).
 *  `intersects` (already in this file) is the "dragged left" / crossing
 *  half. */
function contains(px: number, py: number, pw: number, ph: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return px >= x0 && py >= y0 && px + pw <= x1 && py + ph <= y1;
}
```

Extend `DragState` (near the top of the file) with a `"marquee"` variant:

```ts
type DragState =
  | { kind: "pan"; startX: number; startY: number; startPan: Pan }
  | { kind: "map"; map: string; grabDX: number; grabDY: number; startTileX: number; startTileY: number }
  | { kind: "marquee"; startX: number; startY: number }
  | null;
```

Add marquee-rect state next to `selected`:

```ts
  const [marqueeRect, setMarqueeRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
```

In `onMouseDown`, replace the Ctrl/Cmd branch's empty-space case:

```ts
    if (e.ctrlKey || e.metaKey) {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(hit.map)) next.delete(hit.map);
          else next.add(hit.map);
          return next;
        });
      } else {
        dragRef.current = { kind: "marquee", startX: sx, startY: sy };
        setMarqueeRect({ x0: sx, y0: sy, x1: sx, y1: sy });
      }
      return;
    }
```

In `onMouseMove`, add a marquee branch (after the existing `if (drag?.kind === "map") { ... }` block, before the "not dragging: hover" section):

```ts
    if (drag?.kind === "marquee") {
      const rect = e.currentTarget.getBoundingClientRect();
      setMarqueeRect({ x0: drag.startX, y0: drag.startY, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
      return;
    }
```

Add a commit function after `commitMapDrag`:

```ts
  const commitMarquee = () => {
    const drag = dragRef.current;
    if (drag?.kind !== "marquee" || !marqueeRect) return;
    const draggedRight = marqueeRect.x1 > marqueeRect.x0;
    const wA = screenToWorld(marqueeRect.x0, marqueeRect.y0);
    const wB = screenToWorld(marqueeRect.x1, marqueeRect.y1);
    const x0 = Math.min(wA.x, wB.x), x1 = Math.max(wA.x, wB.x);
    const y0 = Math.min(wA.y, wB.y), y1 = Math.max(wA.y, wB.y);
    const hits = new Set<string>();
    for (const p of visible) {
      const size = sizeOfPlacement(p, sizeByMap);
      const test = draggedRight ? contains : intersects;
      if (test(p.x, p.y, size.width, size.height, x0, y0, x1, y1)) hits.add(p.map);
    }
    setSelected(hits);
  };
```

Call it from `onMouseUp` and clear `marqueeRect` in both `onMouseUp` and `onMouseLeaveCanvas`:

```ts
  const onMouseUp = () => {
    commitMapDrag();
    commitMarquee();
    dragRef.current = null;
    setIsDraggingMap(false);
    setMarqueeRect(null);
  };
```

```ts
  const onMouseLeaveCanvas = () => {
    commitMapDrag();
    commitMarquee();
    dragRef.current = null;
    setIsDraggingMap(false);
    setHover(null);
    setTooltip(null);
    setMarqueeRect(null);
  };
```

Render the live marquee rectangle in the JSX, right after the selection-outline block:

```tsx
          {marqueeRect && (
            <div
              className="world-canvas__marquee"
              style={{
                left: Math.min(marqueeRect.x0, marqueeRect.x1),
                top: Math.min(marqueeRect.y0, marqueeRect.y1),
                width: Math.abs(marqueeRect.x1 - marqueeRect.x0),
                height: Math.abs(marqueeRect.y1 - marqueeRect.y0),
              }}
            />
          )}
```

### Step 10: Run test to verify it passes

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "multi-select"`
Expected: PASS, 7 tests (4 from Step 1 + 3 from Step 7).

### Step 11: Commit

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): Ctrl+drag marquee selection, direction-sensitive"
```

### Step 12: Write the failing test for group move

Add to `describe("multi-select", ...)`:

```tsx
    it("Shift+drag on a selected map moves every selected map together, preserving offsets", async () => {
      const { impl, calls } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // select A
      fireEvent.mouseDown(canvas, { clientX: 25, clientY: 5, button: 0, ctrlKey: true }); // select B

      // Shift+drag starting on A (grabbed at its own origin), moved by
      // world-delta (5,5).
      fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0, shiftKey: true });
      fireEvent.mouseMove(canvas, { clientX: 5, clientY: 5, shiftKey: true });
      fireEvent.mouseUp(canvas);

      const placementCalls = calls.filter((c) => c.url.startsWith("/api/world/placement"));
      const bodies = placementCalls.map((c) => JSON.parse(String(c.init?.body)) as { map: string; x: number; y: number });
      expect(bodies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ map: "A", x: 5, y: 5 }),
          expect.objectContaining({ map: "B", x: 25, y: 5 }),
        ]),
      );
      // C was never selected and must not have moved or been posted.
      expect(bodies.some((b) => b.map === "C")).toBe(false);
    });

    it("Shift+drag on an unselected map moves only that one map, even with a selection active", async () => {
      const { impl, calls } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // select A only

      fireEvent.mouseDown(canvas, { clientX: 25, clientY: 5, button: 0, shiftKey: true }); // Shift+drag B, not selected
      fireEvent.mouseMove(canvas, { clientX: 30, clientY: 10, shiftKey: true });
      fireEvent.mouseUp(canvas);

      const placementCalls = calls.filter((c) => c.url.startsWith("/api/world/placement"));
      const bodies = placementCalls.map((c) => JSON.parse(String(c.init?.body)) as { map: string });
      expect(bodies).toEqual([expect.objectContaining({ map: "B" })]);
    });
```

### Step 13: Run test to verify it fails

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "group move"`
Expected: FAIL — the first test's `bodies` only contains A's placement today (B never moves; Shift+drag only ever handles the single `"map"` kind).

### Step 14: Implement group move

Extend `DragState` again to add a `"group"` kind:

```ts
type DragState =
  | { kind: "pan"; startX: number; startY: number; startPan: Pan }
  | { kind: "map"; map: string; grabDX: number; grabDY: number; startTileX: number; startTileY: number }
  | { kind: "group"; anchorMap: string; grabDX: number; grabDY: number; starts: Map<string, { x: number; y: number }> }
  | { kind: "marquee"; startX: number; startY: number }
  | null;
```

In `onMouseDown`, change the Shift-drag branch to check the selection first:

```ts
    const hit = e.shiftKey ? hitTest(w.x, w.y) : null;
    if (hit) {
      if (selected.has(hit.map) && selected.size > 1) {
        const starts = new Map<string, { x: number; y: number }>();
        for (const name of selected) {
          const p = world?.placements.get(name);
          if (p) starts.set(name, { x: p.x, y: p.y });
        }
        dragRef.current = { kind: "group", anchorMap: hit.map, grabDX: w.x - hit.x, grabDY: w.y - hit.y, starts };
      } else {
        dragRef.current = { kind: "map", map: hit.map, grabDX: w.x - hit.x, grabDY: w.y - hit.y, startTileX: hit.x, startTileY: hit.y };
      }
      setIsDraggingMap(true);
    } else {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, startPan: pan };
    }
```

In `onMouseMove`, add a `"group"` branch (alongside the existing `"map"` one):

```ts
    if (drag?.kind === "group") {
      const rect = e.currentTarget.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const anchorStart = drag.starts.get(drag.anchorMap)!;
      const rawX = w.x - drag.grabDX, rawY = w.y - drag.grabDY;
      const dx = Math.round(rawX) - anchorStart.x, dy = Math.round(rawY) - anchorStart.y;
      setWorld((prev) => {
        if (!prev) return prev;
        const next = new Map(prev.placements);
        for (const [name, start] of drag.starts) {
          const existing = next.get(name);
          if (existing) next.set(name, { ...existing, x: start.x + dx, y: start.y + dy });
        }
        return { ...prev, placements: next };
      });
      setCompositeVersion((v) => v + 1);
      return;
    }
```

Add a commit function, mirroring `commitMapDrag`, after it:

```ts
  const commitGroupDrag = () => {
    const drag = dragRef.current;
    if (drag?.kind !== "group") return;
    for (const [name, start] of drag.starts) {
      const p = world?.placements.get(name);
      if (p && (p.x !== start.x || p.y !== start.y)) postPlacement(name, p.x, p.y);
    }
  };
```

Call it from `onMouseUp` and `onMouseLeaveCanvas`, alongside `commitMapDrag`/`commitMarquee`:

```ts
  const onMouseUp = () => {
    commitMapDrag();
    commitGroupDrag();
    commitMarquee();
    dragRef.current = null;
    setIsDraggingMap(false);
    setMarqueeRect(null);
  };
```

```ts
  const onMouseLeaveCanvas = () => {
    commitMapDrag();
    commitGroupDrag();
    commitMarquee();
    dragRef.current = null;
    setIsDraggingMap(false);
    setHover(null);
    setTooltip(null);
    setMarqueeRect(null);
  };
```

### Step 15: Run test to verify it passes

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "multi-select"`
Expected: PASS, 9 tests.

### Step 16: Run the FULL WorldCanvas suite

This file has ~35 pre-existing tests that touch the exact handlers just modified (`onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseLeaveCanvas`, `DragState`). Confirm nothing broke.

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, all tests (pre-existing + new).

### Step 17: Add the CSS

In `packages/ui/src/styles.css`, add a new token next to the other overlay tokens (near `--overlay-spotlight-dim` in both the `:root` block and the `[data-theme="light"]` / dark-mode override block — follow the exact pattern already there for that token):

```css
  --overlay-selection: #22d3ee;
```

(Light-mode override, alongside `--overlay-spotlight-dim`'s own light value:)

```css
  --overlay-selection: #0891b2;
```

Add the selection/marquee rules near `.world-canvas__spotlight-dim` (same file, same general area as the other `.world-canvas__*` overlay rules):

```css
.world-canvas__selection {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.world-canvas__selection-outline {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid var(--overlay-selection);
  border-radius: 2px;
}

.world-canvas__marquee {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed var(--overlay-selection);
  background: rgba(34, 211, 238, 0.14);
  pointer-events: none;
}
```

(No `color-mix()` — this codebase's stylesheet has no existing use of it and consistently expresses translucency as a literal `rgba()`, e.g. `--overlay-collision`/`--overlay-spotlight-dim`; `rgba(34, 211, 238, 0.14)` is `--overlay-selection`'s own `#22d3ee` at 14% opacity, matching that convention rather than introducing a new CSS feature for one rule.)

### Step 18: Write the failing test for Escape clearing the selection

Add to `describe("multi-select", ...)`:

```tsx
    it("Escape clears the selection", async () => {
      const { impl } = makeFetchMock(threeMapsWorld());
      const { canvas } = await mountReady(impl);

      fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0, ctrlKey: true }); // select A
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(1);

      fireEvent.keyDown(canvas, { key: "Escape" });
      expect(canvas.parentElement!.querySelectorAll(".world-canvas__selection-outline").length).toBe(0);
    });
```

### Step 19: Run test to verify it fails

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "Escape clears"`
Expected: FAIL — the canvas has no keydown handler at all today.

### Step 20: Implement it

Add a handler and wire it onto the canvas, alongside the other handlers in the JSX:

```ts
  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "Escape") setSelected(new Set());
  };
```

```tsx
            onClick={onCanvasClick}
            onKeyDown={onCanvasKeyDown}
            tabIndex={0}
```

(`tabIndex={0}` makes the canvas a real keyboard target — without it, a `<canvas>` cannot receive focus at all, so no `keydown` would ever reach it regardless of the handler. `fireEvent.keyDown` in jsdom bypasses real focus requirements, which is why the test above passes even before this attribute is added — add it anyway, since it's required for the real browser, and note this discrepancy: the test alone cannot catch a missing `tabIndex`, only manual verification (Step 22) can.)

### Step 21: Run test to verify it passes

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "multi-select"`
Expected: PASS, 10 tests.

### Step 22: Verify live

```bash
npm run dev -w @pokemap/ui
```

In World mode: Ctrl+click two maps, confirm both outline. Ctrl+drag a marquee both directions over a cluster of maps, confirm the containment-vs-crossing difference. Shift+drag one of the selected maps, confirm the whole group moves together, then reload and confirm all of them stuck. Click the canvas once (to focus it) and press Escape with a selection active, confirm it clears.

### Step 23: Commit

```bash
git add packages/ui/src/components/WorldCanvas.tsx packages/ui/src/styles.css
git commit -m "feat(ui): Shift+drag moves a multi-selection together, plus selection visuals"
```

---

## Task 2: Map-list jump in World mode

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/components/WorldCanvas.tsx`
- Test: `packages/ui/test/WorldCanvas.test.tsx`

### Step 1: Write the failing test

Add a new `describe` block to `packages/ui/test/WorldCanvas.test.tsx`:

```tsx
  // -------------------------------------------------------------------
  // Map-list jump (App.tsx passes jumpToMap/jumpToken)
  // -------------------------------------------------------------------
  describe("jump to map", () => {
    it("pans/zooms to the given map's real placement when jumpToken changes", async () => {
      const { impl } = makeFetchMock(
        makeWorld({
          placements: {
            Target: { map: "Target", x: 40, y: 40, width: 10, height: 10, component: 0 },
            Other: { map: "Other", x: 0, y: 0, width: 10, height: 10, component: 1 },
          },
        }),
      );
      vi.stubGlobal("fetch", impl);
      const utils = render(<WorldCanvas jumpToMap="Target" jumpToken={1} />);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      canvas.getBoundingClientRect = () => ({
        left: 0, top: 0, right: VIEWPORT_SIZE, bottom: VIEWPORT_SIZE, width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, x: 0, y: 0, toJSON() {},
      });
      const stageCtx = ctxByCanvas.get(canvas)!;
      await waitFor(() => expect(stageCtx.clearRect).toHaveBeenCalled());

      // computeFit on Target's own 10x10 bounds in a 100x100 viewport:
      // zoom = min(100/10, 100/10) = 10 (clamped to MAX_ZOOM=16, so 10
      // stands), pan centres it -- Target's rect after this must be
      // exactly [0,100)x[0,100), the full viewport, hand-computed the
      // same way computeFit's own test above does.
      const jumpOutline = utils.container.querySelector(".world-canvas__jump-highlight") as HTMLElement;
      expect(jumpOutline).toBeTruthy();
    });

    it("re-jumps even when clicking the same map name again (jumpToken changes, jumpToMap does not)", async () => {
      const { impl } = makeFetchMock(
        makeWorld({ placements: { Target: { map: "Target", x: 40, y: 40, width: 10, height: 10, component: 0 } } }),
      );
      vi.stubGlobal("fetch", impl);
      const { rerender, container } = render(<WorldCanvas jumpToMap="Target" jumpToken={1} />);
      await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
      const canvas = container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      canvas.getBoundingClientRect = () => ({
        left: 0, top: 0, right: VIEWPORT_SIZE, bottom: VIEWPORT_SIZE, width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, x: 0, y: 0, toJSON() {},
      });
      await waitFor(() => expect(container.querySelector(".world-canvas__jump-highlight")).toBeTruthy());

      // Pan away, then re-request the SAME map -- jumpToMap is unchanged
      // but jumpToken bumps, which must still re-trigger the jump.
      fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50, button: 0 });
      fireEvent.mouseMove(canvas, { clientX: 90, clientY: 90 });
      fireEvent.mouseUp(canvas);

      rerender(<WorldCanvas jumpToMap="Target" jumpToken={2} />);
      await waitFor(() => expect(container.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    });
  });
```

### Step 2: Run test to verify it fails

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "jump to map"`
Expected: FAIL — `WorldCanvas` accepts no props at all today (`export function WorldCanvas() {`), so `jumpToMap`/`jumpToken` are silently ignored by TypeScript... actually this will be a TYPE ERROR at compile time, not a runtime test failure, since `<WorldCanvas jumpToMap=... />` doesn't match `WorldCanvas()`'s zero-prop signature. Confirm this: `npx tsc --noEmit -p packages/ui/tsconfig.json` should fail here. That IS "verify it fails" for a typed component — proceed to Step 3.

### Step 3: Give WorldCanvas its new props and the jump effect

Change the component signature:

```ts
export interface WorldCanvasProps {
  /** A map name to pan/zoom to, or null/undefined for none. Mirrors
   *  App.tsx's shared `selected` state -- set by clicking a name in the
   *  sidebar map list while in World mode. */
  jumpToMap?: string | null;
  /** Bumped by the caller on every click, even a re-click of the same
   *  name -- jumpToMap alone can't distinguish "jump here again" from "no
   *  change", since React state setters no-op on an identical primitive
   *  value. */
  jumpToken?: number;
}

export function WorldCanvas({ jumpToMap, jumpToken }: WorldCanvasProps = {}) {
```

Add jump-highlight state next to `selected`:

```ts
  const [jumpHighlight, setJumpHighlight] = useState<string | null>(null);
```

Add the jump effect after the `fitWorld` callback definition:

```ts
  // Map-list jump: App.tsx passes the sidebar's shared `selected` map name
  // through as jumpToMap, bumping jumpToken on every click (even a
  // re-click of the same name). Reuses fitWorld's own computeFit call,
  // but fits the ONE target map's own bounds, not the whole
  // landmass/world. A map with no current placement (e.g. it's in the
  // unplaced side rail, dungeon-auto-layout off) has nothing to jump to;
  // silently does nothing rather than fitting some unrelated bounds.
  useEffect(() => {
    if (!jumpToMap || !world) return;
    const p = world.placements.get(jumpToMap);
    if (!p) return;
    const size = sizeOfPlacement(p, sizeByMap);
    if (size.width <= 0 || size.height <= 0) return;
    const fit = computeFit({ x: p.x, y: p.y, width: size.width, height: size.height }, viewport);
    setZoom(fit.zoom);
    setPan(fit.pan);
    setJumpHighlight(jumpToMap);
    const timer = setTimeout(() => setJumpHighlight(null), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jumpToken is
    // the intended re-trigger signal; world/sizeByMap/viewport are read
    // fresh each time this runs but must not themselves cause a re-jump.
  }, [jumpToken]);
```

Render the jump highlight, reusing the exact same visual as the selection outline (per the design spec's own explicit "one visual language" instruction) — add this in the JSX right after the `world-canvas__selection` block.

**Audit note, caught before dispatch:** a bare sibling `<div>` here (outside any `z-index`-bearing wrapper) would reproduce the exact overlay-layering bug Task 1's own review round just fixed — `.world-canvas__selection-outline` itself carries no `z-index` of its own, only its `.world-canvas__selection` *wrapper* does (`z-index: 6`), and `.world-canvas__lens`/`.world-canvas__spotlight` (`z-index: 2`, but each establishing its own stacking context) would still paint over a bare `z-index: auto` sibling regardless of DOM order. Wrap the jump highlight in the same `.world-canvas__selection` container class, exactly like the real selection outlines, rather than introducing an unwrapped exception:

```tsx
          {jumpHighlight && world?.placements.get(jumpHighlight) && (() => {
            const p = world.placements.get(jumpHighlight)!;
            const size = sizeOfPlacement(p, sizeByMap);
            const rect = { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y, width: size.width * zoom, height: size.height * zoom };
            return (
              <div className="world-canvas__selection" aria-hidden="true">
                <div
                  className="world-canvas__selection-outline world-canvas__jump-highlight"
                  style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                />
              </div>
            );
          })()}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run packages/ui/test/WorldCanvas.test.tsx -t "jump to map"`
Expected: PASS, 2 tests.

Run the full file too: `npx vitest run packages/ui/test/WorldCanvas.test.tsx`
Expected: PASS, all tests (the `jumpToMap`/`jumpToken` props are both optional, so every pre-existing `<WorldCanvas />` call with no props still compiles and behaves identically).

### Step 5: Wire App.tsx

Read `packages/ui/src/App.tsx` first (it's short, 66 lines) to confirm nothing has changed since this plan was written. Replace its body:

```tsx
import { useState } from "react";
import { MapTree } from "./components/MapTree.js";
import { MapCanvas } from "./components/MapCanvas.js";
import { WorldCanvas } from "./components/WorldCanvas.js";
import { useMapGroups } from "./hooks/useMapGroups.js";
import { useMapLayout } from "./hooks/useMapLayout.js";

type Mode = "map" | "world";

export function App() {
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every sidebar click, even a re-click of the same map name --
  // see WorldCanvas's own jumpToken doc comment for why jumpToMap alone
  // can't carry that signal.
  const [selectVersion, setSelectVersion] = useState(0);
  const { data, error } = useMapGroups();
  const layout = useMapLayout(selected);

  const selectMap = (name: string) => {
    setSelected(name);
    setSelectVersion((v) => v + 1);
  };

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        <div className="app__mode" role="group" aria-label="View">
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "map"}
            onClick={() => setMode("map")}
          >
            Map
          </button>
          <button
            type="button"
            className="map-canvas__btn"
            aria-pressed={mode === "world"}
            onClick={() => setMode("world")}
          >
            World
          </button>
        </div>
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {error ? (
            <p className="map-tree__empty">Could not load map groups: {error}</p>
          ) : data ? (
            <MapTree data={data} selected={selected} onSelect={selectMap} />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {mode === "world" ? (
            <WorldCanvas jumpToMap={selected} jumpToken={selectVersion} />
          ) : !selected ? (
            <p className="app__canvas-placeholder">Select a map</p>
          ) : layout.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {layout.error}</p>
          ) : layout.data ? (
            <MapCanvas mapName={selected} data={layout.data} />
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
        </main>
      </div>
    </div>
  );
}
```

(Only real changes from the current file: `selectVersion` state, the `selectMap` wrapper, `MapTree`'s `onSelect={selectMap}` instead of `onSelect={setSelected}`, and `WorldCanvas`'s two new props. Everything else is unchanged.)

### Step 6: Add the CSS for the jump highlight

The jump highlight reuses `.world-canvas__selection-outline`'s base styling (Task 1, Step 17) entirely. Add one modifier in `packages/ui/src/styles.css`, near that rule:

```css
.world-canvas__jump-highlight {
  animation: world-canvas-jump-fade 2s ease-out forwards;
}

@keyframes world-canvas-jump-fade {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
```

### Step 7: Run typecheck and the full UI suite

```bash
npm run typecheck
npx vitest run packages/ui
```
Expected: both clean.

### Step 8: Verify live

```bash
npm run dev -w @pokemap/ui
```

Switch to World mode. Use the sidebar's existing filter box to narrow the list, click a map name, confirm the canvas pans/zooms to it and briefly outlines it. Click the same name again, confirm it re-centers (not a no-op). Turn on a lens (e.g. level-curve) or the species spotlight first, THEN click a map name — confirm the jump highlight is genuinely visible on top of the tint/dim, not hidden underneath it (this is exactly the layering bug the audit note in Step 3 exists to prevent; verify it actually worked, don't just trust the wrapper was added correctly).

### Step 9: Commit

```bash
git add packages/ui/src/App.tsx packages/ui/src/components/WorldCanvas.tsx packages/ui/src/styles.css packages/ui/test/WorldCanvas.test.tsx
git commit -m "feat(ui): clicking a map in the sidebar jumps to it in World mode"
```

---

## Task 3: Species type-ahead

**Files:**
- Modify: `packages/core/src/analyse/coverage.ts` (export `allSpecies`)
- Modify: `packages/server/src/index.ts` (add `GET /api/species`)
- Modify: `packages/ui/src/components/SpeciesSpotlight.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `packages/core/test/analyse/coverage.test.ts`
- Test: `packages/server/test/api.test.ts`
- Test: `packages/ui/test/SpeciesSpotlight.test.tsx`

### Step 1: Write the failing core test

Add to `packages/core/test/analyse/coverage.test.ts` (inside the existing `describe("coverage", ...)` block, or a new one if that file's structure has since changed — check before editing):

```ts
import { allSpecies } from "../../src/analyse/coverage.js";

// ... inside a describe block:
  itWithCorpus("allSpecies returns every SPECIES_X the project has art for, sorted", () => {
    const species = allSpecies(proj);
    expect(species.length).toBeGreaterThan(300);
    expect(species).toContain("SPECIES_ESPEON");
    expect(species).toEqual([...species].sort());
  });
```

### Step 2: Run test to verify it fails

Run: `npx vitest run packages/core/test/analyse/coverage.test.ts -t "allSpecies"`
Expected: FAIL — `allSpecies` is not exported (`Cannot find name 'allSpecies'` / import error), and it's currently unsorted (returns `readdirSync`'s own OS-dependent order).

### Step 3: Export and sort `allSpecies`

In `packages/core/src/analyse/coverage.ts`, change:

```ts
/** Species the project actually has art for -- the honest denominator. */
function allSpecies(proj: Project): string[] {
  const dir = `${proj.paths.root}/graphics/pokemon`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `SPECIES_${d.name.toUpperCase()}`);
}
```

to:

```ts
/** Species the project actually has art for -- the honest denominator.
 *  Exported (not just used internally by `coverage()`'s own
 *  `unusedSpecies`) for the species type-ahead's `/api/species` route --
 *  sorted so that route can serve it straight to the client with no
 *  further work. */
export function allSpecies(proj: Project): string[] {
  const dir = `${proj.paths.root}/graphics/pokemon`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `SPECIES_${d.name.toUpperCase()}`)
    .sort();
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run packages/core/test/analyse/coverage.test.ts`
Expected: PASS, all tests (the new one plus every pre-existing one — `coverage()`'s own `unusedSpecies` output is unaffected in content, only now sorted, and nothing in the existing tests asserts a specific unsorted order).

### Step 5: Commit

```bash
git add packages/core/src/analyse/coverage.ts packages/core/test/analyse/coverage.test.ts
git commit -m "feat(core): export allSpecies, sorted, for the species type-ahead route"
```

### Step 6: Write the failing server test

Add to `packages/server/test/api.test.ts` (check its existing structure first — it uses the same `createServer`/`SUBJECT_ROOT` pattern every other server test file in this plan has used):

```ts
  it("GET /api/species returns every species name, sorted", async () => {
    const r = await fetch(`http://127.0.0.1:${s.port}/api/species`);
    expect(r.status).toBe(200);
    const species = await r.json() as string[];
    expect(species.length).toBeGreaterThan(300);
    expect(species).toContain("SPECIES_ESPEON");
    expect(species).toEqual([...species].sort());
  });
```

### Step 7: Run test to verify it fails

Run: `npx vitest run packages/server/test/api.test.ts -t "api/species"`
Expected: FAIL — 404, route doesn't exist.

### Step 8: Add the route

In `packages/server/src/index.ts`, add the import:

```ts
import { coverage, whereSpecies, allSpecies } from "@pokemap/core/src/analyse/coverage.js";
```

Add a cache next to `coverageCache` (same file, same section):

```ts
  // allSpecies(project) reads one directory listing -- cheap even
  // uncached, but the result can't change for the lifetime of a
  // read-only-decomp server process (I8), same reasoning as every other
  // cache in this file. Computed on the first request that needs it.
  let speciesCache: string[] | undefined;
  const getSpecies = () => (speciesCache ??= allSpecies(project));
```

Add the route, next to `/api/coverage`:

```ts
      if (url.pathname === "/api/species") {
        return send(200, getSpecies());
      }
```

### Step 9: Run test to verify it passes

Run: `npx vitest run packages/server/test/api.test.ts`
Expected: PASS, all tests.

### Step 10: Commit

```bash
git add packages/server/src/index.ts packages/server/test/api.test.ts
git commit -m "feat(server): GET /api/species"
```

### Step 11: Write the failing UI tests

Add to `packages/ui/test/SpeciesSpotlight.test.tsx`, inside the existing `describe("SpeciesSpotlight", ...)` block. This file's existing tests each set `global.fetch` to a single mocked response for `/api/where/:species`; the type-ahead needs a SECOND route (`/api/species`) mocked too, so every existing test's `global.fetch` mock needs to also answer that route or these new tests will get "unexpected fetch" style failures. Add a shared helper near the top of the file, above `describe`:

```tsx
const ALL_SPECIES = ["SPECIES_MAGIKARP", "SPECIES_MAREEP", "SPECIES_MARILL", "SPECIES_PIKACHU", "SPECIES_ESPEON"];

function fetchMockWithSpecies(whereImpl: (url: string) => Promise<Response>) {
  return vi.fn((url: string) => {
    if (url === "/api/species") return Promise.resolve({ ok: true, json: async () => ALL_SPECIES } as Response);
    return whereImpl(url);
  });
}
```

Then add new tests:

```tsx
  describe("type-ahead", () => {
    it("shows a dropdown of species starting with the typed prefix, case-insensitively", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      const box = screen.getByRole("searchbox");
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });

      // Starts with "ma": MAGIKARP, MAREEP, MARILL. PIKACHU and ESPEON
      // don't start with "ma" (a substring-match bug would also catch
      // neither of those here, so this alone doesn't discriminate --
      // that's why the next test targets a genuine near-miss).
      await waitFor(() => {
        expect(screen.getByText("Magikarp")).toBeTruthy();
        expect(screen.getByText("Mareep")).toBeTruthy();
        expect(screen.getByText("Marill")).toBeTruthy();
      });
      expect(screen.queryByText("Pikachu")).toBeNull();
    });

    it("does not show a species that merely CONTAINS the prefix, only ones that START with it", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      const box = screen.getByRole("searchbox");
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      // "rill" is a substring of MARILL but not a prefix -- a
      // substring-match implementation would wrongly include it.
      fireEvent.change(box, { target: { value: "rill" } });
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText("Marill")).toBeNull();
    });

    it("clicking a dropdown entry fills the box and fires the search immediately, no debounce wait", async () => {
      const onHits = vi.fn();
      let resolveWhere: (v: Response) => void = () => {};
      const wherePromise = new Promise<Response>((resolve) => { resolveWhere = resolve; });
      global.fetch = fetchMockWithSpecies((url) => {
        if (url.startsWith("/api/where/")) return wherePromise;
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });
      await waitFor(() => expect(screen.getByText("Marill")).toBeTruthy());
      fireEvent.click(screen.getByText("Marill"));

      expect(box.value).toBe("MARILL");
      resolveWhere({ ok: true, json: async () => [{ mapName: "Route1", percent: 10, minLevel: 1, maxLevel: 2, method: "land_mons" }] } as Response);
      await waitFor(() => expect(onHits).toHaveBeenCalled());
    });

    it("ArrowDown/ArrowUp move a highlighted entry and Enter selects it", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      const box = screen.getByRole("searchbox") as HTMLInputElement;
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));

      fireEvent.change(box, { target: { value: "ma" } });
      await waitFor(() => expect(screen.getByText("Magikarp")).toBeTruthy());

      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "Enter" });

      // First option is Magikarp, second is Mareep (ALL_SPECIES order,
      // filtered) -- two ArrowDowns highlights the second.
      expect(box.value).toBe("MAREEP");
    });

    it("the dropdown never appears with an empty box", async () => {
      global.fetch = fetchMockWithSpecies(() => Promise.resolve({ ok: true, json: async () => [] } as Response)) as never;
      render(<SpeciesSpotlight onHits={() => {}} />);
      await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("/api/species"));
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("if /api/species fails, plain typed search still works with no dropdown", async () => {
      const onHits = vi.fn();
      global.fetch = vi.fn((url: string) => {
        if (url === "/api/species") return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response);
        return Promise.resolve({ ok: true, json: async () => [{ mapName: "Route1", percent: 10, minLevel: 1, maxLevel: 2, method: "land_mons" }] } as Response);
      }) as never;
      render(<SpeciesSpotlight onHits={onHits} />);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MARILL" } });
      expect(screen.queryByRole("listbox")).toBeNull();
      await waitFor(() => expect(onHits).toHaveBeenCalled());
    });
  });
```

Every EXISTING test in this file (before `describe("type-ahead", ...)`) also needs its `global.fetch` mock updated to answer `/api/species` — otherwise the component's own new fetch-on-mount will hit each existing test's mock with an unhandled URL. Go through every existing `global.fetch = vi.fn()...` / `.mockResolvedValue(...)` assignment in this file and wrap it with `fetchMockWithSpecies`, e.g.:

```tsx
    global.fetch = fetchMockWithSpecies(() =>
      Promise.resolve({ ok: true, json: async () => ([{ mapName: "Route29", percent: 20, minLevel: 3, maxLevel: 5, method: "land_mons" }]) } as Response),
    ) as never;
```

(Replacing each existing `global.fetch = vi.fn().mockResolvedValue({...}) as never;` with the equivalent `fetchMockWithSpecies` wrapper around the same response. There are 8 such assignments in the existing file as of this plan's writing — re-count against the actual current file rather than assuming that number is still exact.)

### Step 12: Run tests to verify they fail

Run: `npx vitest run packages/ui/test/SpeciesSpotlight.test.tsx`
Expected: FAIL — the new `type-ahead` tests fail (no dropdown exists), AND several pre-existing tests now fail too (their fetch mocks don't yet answer `/api/species`, which the still-unmodified component doesn't call yet, so this second failure mode won't actually appear until Step 13 adds that fetch — confirm the CURRENT failure is just the 6 new tests, then proceed).

### Step 13: Implement the dropdown

Rewrite `packages/ui/src/components/SpeciesSpotlight.tsx` in full:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { SpeciesHit } from "@pokemap/core/src/analyse/coverage.js";

export interface SpeciesSpotlightProps {
  /**
   * Called whenever a real, debounced lookup resolves -- never on mount
   * with the box still empty, so a caller (WorldCanvas) doesn't have to
   * special-case its own initial render just because this component
   * exists.
   *
   *  - `null` means "no active search": the untouched box, or one the
   *    user has cleared after searching. The world should draw undimmed.
   *  - `[]` means "searched, found nowhere" -- a real, meaningful result
   *    (the empty-state message below renders the same fact), distinct
   *    from `null` so a caller can still dim the whole world to say so,
   *    rather than leaving it looking like no search happened at all.
   *  - otherwise the hit array itself, straight from `/api/where/:species`
   *    (whereSpecies' own contract: sorted by percent, descending).
   */
  onHits: (hits: SpeciesHit[] | null) => void;
}

/** Long enough that ordinary typing ("PIKA...CHU") collapses to one
 *  request, short enough that the result still feels immediate. */
const DEBOUNCE_MS = 250;

/** "PIKACHU" / "pikachu" / "SPECIES_PIKACHU" all read back as "Pikachu" for
 *  the empty-state sentence and the dropdown's own option labels. */
function displaySpecies(query: string): string {
  const bare = query.trim().replace(/^SPECIES_/i, "");
  return bare
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Species spotlight (spec §9), now with a type-ahead dropdown: type a
 * species, the stitched world dims except the maps containing it, each lit
 * with its rate and level band. Purely a control -- like LensPanel, it
 * draws nothing on the canvas itself; WorldCanvas owns turning `onHits`'
 * payload into the actual dim/highlight overlay.
 *
 * The dropdown's data source (`GET /api/species`) is fetched once on
 * mount and filtered CLIENT-SIDE as you type (prefix match, case
 * insensitive) -- the full roster is a few hundred to ~1,000 short
 * strings, cheap enough that no per-keystroke network round trip is
 * worth it, unlike the real search below which genuinely needs the
 * server's own encounter data. A failed /api/species fetch just means no
 * dropdown ever appears; the plain typed-and-submitted search is entirely
 * independent of this list and is unaffected.
 */
export function SpeciesSpotlight({ onHits }: SpeciesSpotlightProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SpeciesHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [allSpecies, setAllSpecies] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // True once the user has typed a real (non-whitespace) query at least
  // once -- see onHits' own "never called at all on mount" doc above.
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/species")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/species -> ${r.status}`);
        return r.json() as Promise<string[]>;
      })
      .then((list) => {
        if (!cancelled) setAllSpecies(list);
      })
      .catch(() => {
        // Best-effort: no dropdown, plain search still works. No error
        // state of its own -- this is a nice-to-have on top of a fully
        // functional search, not something worth a banner over.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const withPrefix = q.startsWith("SPECIES_") ? q : `SPECIES_${q}`;
    return allSpecies.filter((s) => s.startsWith(withPrefix)).slice(0, 50);
  }, [query, allSpecies]);

  useEffect(() => {
    setActiveIndex(0);
  }, [matches]);

  function runSearch(rawQuery: string, immediate: boolean) {
    setQuery(rawQuery);
    if (immediate) setDropdownOpen(false);
  }

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setHits(null);
      setLoading(false);
      setFetchError(null);
      if (startedRef.current) onHits(null);
      return;
    }

    startedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const timer = setTimeout(() => {
      fetch(`/api/where/${encodeURIComponent(trimmed)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`GET /api/where/${trimmed} -> ${r.status}`);
          return r.json() as Promise<SpeciesHit[]>;
        })
        .then((data) => {
          if (cancelled) return;
          setHits(data);
          setLoading(false);
          onHits(data);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setLoading(false);
          setFetchError(e instanceof Error ? e.message : String(e));
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, onHits]);

  const mapCount = hits ? new Set(hits.map((h) => h.mapName).filter((n): n is string => !!n)).size : 0;

  function pick(species: string) {
    // A click is a complete, deliberate choice -- skip the debounce
    // rather than making the user wait 250ms after they've already
    // finished deciding.
    setQuery(species);
    setDropdownOpen(false);
    startedRef.current = true;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/where/${encodeURIComponent(species)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/where/${species} -> ${r.status}`);
        return r.json() as Promise<SpeciesHit[]>;
      })
      .then((data) => {
        setHits(data);
        setLoading(false);
        onHits(data);
      })
      .catch((e: unknown) => {
        setLoading(false);
        setFetchError(e instanceof Error ? e.message : String(e));
      });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[activeIndex]!);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  return (
    <div className="species-spotlight">
      <input
        type="search"
        className="species-spotlight__input"
        placeholder="Spotlight a species…"
        aria-label="Species spotlight"
        role="searchbox"
        value={query}
        onChange={(e) => {
          runSearch(e.target.value, false);
          setDropdownOpen(e.target.value.trim().length > 0);
        }}
        onBlur={() => setTimeout(() => setDropdownOpen(false), 100)}
        onKeyDown={onKeyDown}
      />
      {dropdownOpen && matches.length > 0 && (
        <ul className="species-spotlight__dropdown" role="listbox">
          {matches.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`species-spotlight__option${i === activeIndex ? " species-spotlight__option--active" : ""}`}
                // onMouseDown, not onClick: fires before the input's onBlur
                // closes the dropdown, so the click actually lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                {displaySpecies(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <span className="species-spotlight__status" role="status">
          Searching…
        </span>
      )}
      {!loading && fetchError && (
        <span className="species-spotlight__status species-spotlight__status--error" role="alert">
          {fetchError}
        </span>
      )}
      {!loading && !fetchError && hits && mapCount > 0 && (
        <span className="species-spotlight__status">
          {mapCount} map{mapCount === 1 ? "" : "s"}
        </span>
      )}
      {!loading && !fetchError && hits && mapCount === 0 && (
        <p className="species-spotlight__empty" role="status">
          {displaySpecies(query)} appears in no encounter table anywhere in the project.
        </p>
      )}
    </div>
  );
}
```

### Step 14: Run tests to verify they pass

Run: `npx vitest run packages/ui/test/SpeciesSpotlight.test.tsx`
Expected: PASS, all tests (pre-existing, updated for the new fetch mock, plus the 6 new type-ahead tests).

### Step 15: Run the full UI suite and typecheck

`SpeciesSpotlight` is also mounted inside `WorldCanvas`, whose own tests mock `fetch` via `makeFetchMock` (Task 1's tests and every pre-existing `WorldCanvas.test.tsx` test) — that mock does not currently answer `/api/species`, and `makeFetchMock`'s catch-all rejects unknown URLs. Check whether this breaks any `WorldCanvas.test.tsx` test; if it does, add an `/api/species` branch to `makeFetchMock` (in `WorldCanvas.test.tsx`, alongside its existing `/api/coverage` branch) returning a small fixture array, mirroring exactly how that file's own comment describes the `/api/coverage` addition it already needed for the same reason (Task 29's own history).

```bash
npm run typecheck
npx vitest run packages/ui
```
Expected: both clean.

### Step 16: Add the CSS

In `packages/ui/src/styles.css`, near the existing `.species-spotlight*` rules:

```css
.species-spotlight {
  position: relative;
}

.species-spotlight__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 6;
  margin: var(--space-1) 0 0;
  padding: var(--space-1) 0;
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  min-width: 200px;
}

.species-spotlight__option {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--space-1) var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  background: none;
  border: none;
  cursor: pointer;
}

.species-spotlight__option:hover,
.species-spotlight__option--active {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

(`--bg-panel-raised`/`--border-strong`/box-shadow values copied directly from `.world-canvas__tooltip`'s own rule — the closest existing floating-panel precedent in this stylesheet, both themed already. `--bg-hover` is the same hover token `.map-tree__map:hover` already uses.)

### Step 17: Verify live

```bash
npm run dev -w @pokemap/ui
```

Type a letter into the species spotlight, confirm the dropdown filters to matching species. Type a prefix that matches many species (e.g. "M"), confirm the list scrolls. Click an entry, confirm it searches immediately and the world dims/lights correctly. Try ArrowDown/ArrowUp/Enter. Confirm the empty box shows no dropdown.

### Step 18: Commit

```bash
git add packages/ui/src/components/SpeciesSpotlight.tsx packages/ui/test/SpeciesSpotlight.test.tsx packages/ui/test/WorldCanvas.test.tsx packages/ui/src/styles.css
git commit -m "feat(ui): species search type-ahead dropdown"
```

---

## Final verification

- [ ] **Step 1:** `npm test` — all suites green.
- [ ] **Step 2:** `npm run typecheck` — clean.
- [ ] **Step 3:** `git status` in `C:\Programming Projects\Pokemon Game\game` — unchanged from whatever it was before this plan started (this plan makes no new decomp-writing code paths; the existing `/api/world/placement` route, reused by multi-select's group-move, is already I8-compliant).
- [ ] **Step 4:** Live walkthrough in the running app: multi-select (click, Ctrl+click, both marquee directions, Shift+drag group move, reload survives), sidebar jump in World mode (including re-clicking the same name), species type-ahead (filtering, scrolling, click-to-pick, keyboard nav, empty-box behavior).
