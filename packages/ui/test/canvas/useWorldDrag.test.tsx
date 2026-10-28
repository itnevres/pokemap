import { useState, type MouseEvent } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorldDrag, type WorldDragMove } from "../../src/canvas/useWorldDrag.js";
import { createPlacementLedger } from "../../src/shared/placementLedger.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

interface Placement { map: string; x: number; y: number; width: number; height: number }
type Modifiers = Partial<Pick<MouseEvent<HTMLElement>, "button" | "ctrlKey" | "metaKey" | "shiftKey">>;

function event(clientX: number, clientY: number, modifiers: Modifiers = {}, left = 0, top = 0): MouseEvent<HTMLElement> {
  return { button: 0, clientX, clientY, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers,
    currentTarget: { getBoundingClientRect: () => ({ left, top }) } } as MouseEvent<HTMLElement>;
}

// Ten screen px per unit. A occupies [2,4) x [3,5), B [8,11) x [4,6),
// and C [20,22) x [20,22). All expected positions below are derived from these starts.
function setup(selected: string[] = [], initial?: Placement[]) {
  const placements = new Map((initial ?? [
    { map: "A", x: 2, y: 3, width: 2, height: 2 },
    { map: "B", x: 8, y: 4, width: 3, height: 2 },
    { map: "C", x: 20, y: 20, width: 2, height: 2 },
  ]).map((p) => [p.map, { ...p }]));
  const ledger = createPlacementLedger();
  const begin = vi.spyOn(ledger, "begin");
  const noop = vi.spyOn(ledger, "noop");
  const moved = vi.spyOn(ledger, "moved");
  const commit = vi.fn<(moves: WorldDragMove[]) => void>();
  let captured = false;
  const stage = { startPan: vi.fn(), movePan: vi.fn(), endPan: vi.fn(), hasCapture: () => captured };
  const movePlacements = vi.fn((positions: ReadonlyMap<string, { x: number; y: number }>) => {
    for (const [name, position] of positions) {
      const p = placements.get(name);
      if (p) placements.set(name, { ...p, ...position });
    }
  });
  const setSelected = vi.fn<(update: (prev: ReadonlySet<string>) => Set<string>) => void>();
  const host = renderHook(() => {
    const [selection, updateSelection] = useState<ReadonlySet<string>>(() => new Set(selected));
    setSelected.mockImplementation((update) => updateSelection(update));
    const drag = useWorldDrag({
      stage, ledger, commit, selected: selection, setSelected, movePlacements,
      toWorld: (sx, sy) => ({ x: sx / 10, y: sy / 10 }),
      placement: (name) => placements.get(name),
      hitTest: (wx, wy) => [...placements.values()].reverse().find((p) =>
        wx >= p.x && wx < p.x + p.width && wy >= p.y && wy < p.y + p.height) ?? null,
      marqueeCandidates: () => placements.values(),
    });
    return { ...drag, selection };
  });
  return { ...host, placements, ledger, begin, noop, moved, commit, stage, movePlacements, setSelected,
    capture: (value: boolean) => { captured = value; },
    down: (x = 25, y = 35, modifiers: Modifiers = { shiftKey: true }) => {
      act(() => { host.result.current.onMouseDown(event(x, y, modifiers)); });
    },
    move: (x = 58, y = 16) => {
      let consumed = false;
      act(() => { consumed = host.result.current.onMouseMove(event(x, y)); });
      return consumed;
    },
    up: () => { act(() => { host.result.current.onMouseUp(); }); },
    leave: () => { act(() => { host.result.current.onMouseLeave(); }); },
    cancel: () => { act(() => { host.result.current.cancel(); }); },
  };
}

function position(p: Placement | undefined) { return p && { x: p.x, y: p.y }; }

describe("world drag modifiers", () => {
  it.each([
    ["plain on a map", 25, 35, {}],
    ["Shift on empty", 0, 0, { shiftKey: true }],
  ] as const)("%s starts pan", (_name, x, y, modifiers) => {
    const h = setup();
    h.down(x, y, modifiers);
    expect(h.stage.startPan).toHaveBeenCalledOnce();
    expect(h.result.current.draggingMap).toBe(false);
    expect(h.begin).not.toHaveBeenCalled();
    h.move();
    expect(h.stage.movePan).toHaveBeenCalledOnce();
    h.up();
    expect(h.stage.endPan).toHaveBeenCalledOnce();
    expect(h.commit).not.toHaveBeenCalled();
  });

  it.each([[], ["A"]].map((selected) => ({ selected })))("Shift starts one map with selection %j", ({ selected }) => {
    const h = setup(selected);
    h.down();
    expect(h.result.current.draggingMap).toBe(true);
    expect(h.stage.startPan).not.toHaveBeenCalled();
    h.move();
    // Grab (.5,.5); (5.8,1.6)-grab=(5.3,1.1), rounded=(5,1).
    expect(position(h.placements.get("A"))).toEqual({ x: 5, y: 1 });
    expect(position(h.placements.get("B"))).toEqual({ x: 8, y: 4 });
    expect(h.begin.mock.calls).toEqual([["A"]]);
  });

  it.each(["ctrlKey", "metaKey"] as const)("%s toggles without drag or pan, even with Shift", (key) => {
    const h = setup();
    h.down(25, 35, { [key]: true, shiftKey: true });
    expect(h.result.current.selection).toEqual(new Set(["A"]));
    expect(h.move()).toBe(false);
    h.down(25, 35, { [key]: true });
    expect(h.result.current.selection).toEqual(new Set());
    expect(h.result.current.draggingMap).toBe(false);
    expect(h.stage.startPan).not.toHaveBeenCalled();
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
  });

  it.each(["ctrlKey", "metaKey"] as const)("%s on empty starts marquee", (key) => {
    const h = setup();
    h.down(0, 0, { [key]: true });
    // Both endpoints start at the same local screen origin.
    expect(h.result.current.marqueeRect).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
    expect(h.result.current.draggingMap).toBe(false);
    expect(h.stage.startPan).not.toHaveBeenCalled();
    expect(h.move(100, 100)).toBe(true);
  });

  it("ignores button 2", () => {
    const h = setup();
    h.down(25, 35, { button: 2, shiftKey: true });
    expect(h.move()).toBe(false);
    expect(h.result.current.dragMoved()).toBe(false);
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.stage.startPan).not.toHaveBeenCalled();
    expect(h.result.current.marqueeRect).toBeNull();
  });
});

describe("map and group movement", () => {
  it("uses local screen coordinates and handlers from a single render", () => {
    const h = setup();
    const handlers = h.result.current;
    act(() => {
      // Subtract (100,200): down=(25,35), move=(58,16). Grab (.5,.5)
      // gives round(5.8-.5, 1.6-.5)=(5,1), even before React renders again.
      handlers.onMouseDown(event(125, 235, { shiftKey: true }, 100, 200));
      handlers.onMouseMove(event(158, 216, {}, 100, 200));
      handlers.onMouseUp();
    });
    const version = h.begin.mock.results[0]!.value;
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith([{ map: "A", x: 5, y: 1, version }]);
    expect(h.result.current.draggingMap).toBe(false);
  });

  it("moves the whole selected group by the anchor's rounded delta in start order", () => {
    const h = setup(["B", "missing", "A"]);
    h.down();
    expect(h.result.current.draggingMap).toBe(true);
    h.move();
    // A anchor: round(5.8-.5,1.6-.5)=(5,1); delta=(3,-2).
    // B=(8+3,4-2)=(11,2); A=(2+3,3-2)=(5,1); C was not selected.
    expect(position(h.placements.get("A"))).toEqual({ x: 5, y: 1 });
    expect(position(h.placements.get("B"))).toEqual({ x: 11, y: 2 });
    expect(position(h.placements.get("C"))).toEqual({ x: 20, y: 20 });
    expect([...h.movePlacements.mock.calls[0]![0]]).toEqual([["B", { x: 11, y: 2 }], ["A", { x: 5, y: 1 }]]);
    expect(h.begin.mock.calls).toEqual([["B"], ["A"]]);
    const firstMove = h.movePlacements.mock.invocationCallOrder[0]!;
    expect(h.begin.mock.invocationCallOrder.every((order) => order < firstMove)).toBe(true);
    h.up();
    const [bVersion, aVersion] = h.begin.mock.results.map((r) => r.value);
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith([
      { map: "B", x: 11, y: 2, version: bVersion },
      { map: "A", x: 5, y: 1, version: aVersion },
    ]);
    expect(h.noop).not.toHaveBeenCalled();
    expect(h.moved).not.toHaveBeenCalled();
  });

  it("begins a map before its first optimistic move and commits its begun version once", () => {
    const h = setup();
    h.down();
    h.move();
    expect(h.begin.mock.invocationCallOrder[0]!).toBeLessThan(h.movePlacements.mock.invocationCallOrder[0]!);
    const version = h.begin.mock.results[0]!.value;
    // Grab (.5,.5); round((58,16)/10-grab)=(5,1), off start (2,3).
    h.up();
    h.up();
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith([{ map: "A", x: 5, y: 1, version }]);
    expect(h.moved).not.toHaveBeenCalled();
    expect(h.ledger.serverShows("A", h.ledger.snapshot())).toBe(false);
  });

  it.each([[], ["A", "B"]].map((selected) => ({ selected })))("no move begins or commits nothing, selection %j", ({ selected }) => {
    const h = setup(selected);
    h.down();
    h.up();
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.movePlacements).not.toHaveBeenCalled();
    expect(h.noop).not.toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.result.current.dragMoved()).toBe(false);
    expect(h.result.current.draggingMap).toBe(false);
  });

  it.each([[], ["A", "B"]].map((selected) => ({ selected })))("begins on first sub-tile move but sends only changed positions, selection %j", ({ selected }) => {
    const h = setup(selected);
    h.down();
    // (26,36)/10-(.5,.5)=(2.1,3.1), still rounds to start (2,3).
    h.move(26, 36);
    expect(h.begin).toHaveBeenCalledTimes(selected.length || 1);
    expect(h.movePlacements).not.toHaveBeenCalled();
    h.move();
    // (59,17)/10-(.5,.5)=(5.4,1.2), same rounded (5,1) as (58,16).
    h.move(59, 17);
    expect(h.movePlacements).toHaveBeenCalledOnce();
    expect(h.begin).toHaveBeenCalledTimes(selected.length || 1);
  });

  it.each([[], ["B", "A"]].map((selected) => ({ selected })))("a returned drag settles every begun map without commit, selection %j", ({ selected }) => {
    const h = setup(selected);
    h.down();
    h.move();
    // Returning to (25,35) minus grab (.5,.5) gives exactly start (2,3),
    // so the group delta is (0,0) and B also returns to (8,4).
    h.move(25, 35);
    h.up();
    expect(h.commit).not.toHaveBeenCalled();
    for (const [index, call] of h.begin.mock.calls.entries()) {
      const name = call[0];
      expect(h.noop).toHaveBeenCalledWith(name, h.begin.mock.results[index]!.value);
      expect(h.ledger.serverShows(name, h.ledger.snapshot())).toBe(true);
    }
    expect(h.noop).toHaveBeenCalledTimes(selected.length || 1);
    expect(position(h.placements.get("A"))).toEqual({ x: 2, y: 3 });
    expect(position(h.placements.get("B"))).toEqual({ x: 8, y: 4 });
  });

  // Rounding is to the nearest unit (Math.round), not floor. Down at (25,35) = world (2.5,3.5) over A (2,3): grab (.5,.5).
  it("map drag rounds a half-unit target upward and commits the rounded position", () => {
    const h = setup();
    h.down(25, 35, { shiftKey: true });
    // (50,40)/10 - (.5,.5) = (4.5,3.5) -> (5,4); floor would give (4,3).
    h.move(50, 40);
    expect(position(h.placements.get("A"))).toEqual({ x: 5, y: 4 });
    const version = h.begin.mock.results[0]!.value;
    h.up();
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledWith([{ map: "A", x: 5, y: 4, version }]);
  });

  it("map drag rounds negative coordinates to the nearest unit", () => {
    const h = setup([], [{ map: "A", x: -2, y: -3, width: 2, height: 2 }]);
    // Down (-15,-25) = world (-1.5,-2.5) over A: grab (.5,.5).
    h.down(-15, -25, { shiftKey: true });
    // (-21,-11)/10 - (.5,.5) = (-2.6,-1.6) -> (-3,-2) (floor agrees here).
    h.move(-21, -11);
    expect(position(h.placements.get("A"))).toEqual({ x: -3, y: -2 });
    // (-19,-14)/10 - (.5,.5) = (-2.4,-1.9) -> (-2,-2); floor would give (-3,-2).
    h.move(-19, -14);
    expect(position(h.placements.get("A"))).toEqual({ x: -2, y: -2 });
    const version = h.begin.mock.results[0]!.value;
    h.up();
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledWith([{ map: "A", x: -2, y: -2, version }]);
  });

  it("group drag rounds the anchor delta upward for every member", () => {
    const h = setup(["A", "B"]);
    h.down(25, 35, { shiftKey: true });
    // Anchor A: round((50,40)/10 - (.5,.5)) = (5,4), delta (3,1). B (8,4) -> (11,5).
    h.move(50, 40);
    expect(position(h.placements.get("A"))).toEqual({ x: 5, y: 4 });
    expect(position(h.placements.get("B"))).toEqual({ x: 11, y: 5 });
    const [vA, vB] = h.begin.mock.results.map((r) => r.value);
    h.up();
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledWith([
      { map: "A", x: 5, y: 4, version: vA }, { map: "B", x: 11, y: 5, version: vB },
    ]);
  });

  it("group drag rounds a negative anchor delta for every member", () => {
    const h = setup(["A", "B"], [
      { map: "A", x: -2, y: -3, width: 2, height: 2 },
      { map: "B", x: 2, y: -1, width: 3, height: 2 },
    ]);
    // Down (-15,-25) over A: grab (.5,.5). Move (-19,-14): round(-2.4,-1.9) = (-2,-2), delta (0,1); floor gives (-3,-2), delta (-1,1).
    h.down(-15, -25, { shiftKey: true });
    h.move(-19, -14);
    expect(position(h.placements.get("A"))).toEqual({ x: -2, y: -2 });
    expect(position(h.placements.get("B"))).toEqual({ x: 2, y: 0 });
    const [vA, vB] = h.begin.mock.results.map((r) => r.value);
    h.up();
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit).toHaveBeenCalledWith([
      { map: "A", x: -2, y: -2, version: vA }, { map: "B", x: 2, y: 0, version: vB },
    ]);
  });

  // The rule follows the horizontal direction only. World rect [0,10] x [0,10] both ways:
  // A [2,4)x[3,5) is inside, B [8,11)x[4,6) crosses the right edge, C is outside.
  it("dragged right-and-up selects only fully contained maps", () => {
    const h = setup(["C"]);
    h.down(0, 100, { ctrlKey: true });
    h.move(100, 0);
    h.up();
    expect(h.result.current.selection).toEqual(new Set(["A"]));
  });

  it("dragged left-and-down also selects partially intersecting maps", () => {
    const h = setup(["C"]);
    h.down(100, 0, { ctrlKey: true });
    h.move(0, 100);
    h.up();
    expect(h.result.current.selection).toEqual(new Set(["A", "B"]));
  });
});

describe("gesture lifecycle", () => {
  it.each([
    ["pan", [], {}],
    ["map", [], { shiftKey: true }],
    ["group", ["A", "B"], { shiftKey: true }],
    ["marquee", [], { ctrlKey: true }],
  ] as const)("%s marks movement and resets on the next down", (kind, selected, modifiers) => {
    const h = setup([...selected]);
    const start = kind === "marquee" ? 0 : 25;
    h.down(start, kind === "marquee" ? 0 : 35, modifiers);
    expect(h.result.current.dragMoved()).toBe(false);
    expect(h.move()).toBe(true);
    expect(h.result.current.dragMoved()).toBe(true);
    h.up();
    expect(h.result.current.dragMoved()).toBe(true);
    h.down(0, 0, {});
    expect(h.result.current.dragMoved()).toBe(false);
    h.up();
    expect(h.result.current.dragMoved()).toBe(false);
  });

  it("consumes moves only while a gesture is live", () => {
    const h = setup();
    expect(h.move()).toBe(false);
    h.down(0, 0, {});
    expect(h.move()).toBe(true);
    h.up();
    expect(h.move()).toBe(false);
  });

  it("ignores a second down without resetting or replacing the live drag", () => {
    const h = setup();
    h.down();
    h.move();
    h.down(0, 0, { ctrlKey: true });
    expect(h.result.current.dragMoved()).toBe(true);
    expect(h.result.current.marqueeRect).toBeNull();
    expect(h.stage.startPan).not.toHaveBeenCalled();
    expect(h.begin).toHaveBeenCalledOnce();
    h.up();
    // The original grab still ended at round(5.8-.5,1.6-.5)=(5,1).
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith([
      { map: "A", x: 5, y: 1, version: h.begin.mock.results[0]!.value },
    ]);
  });

  it("capture keeps a map drag live through leave until the outside mouseup", () => {
    const h = setup();
    h.capture(true);
    h.down();
    h.move();
    h.leave();
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.result.current.draggingMap).toBe(true);
    // (68,26)/10-(.5,.5)=(6.3,2.1), rounded=(6,2).
    expect(h.move(68, 26)).toBe(true);
    h.up();
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith([
      { map: "A", x: 6, y: 2, version: h.begin.mock.results[0]!.value },
    ]);
  });

  it.each([[], ["B", "A"]].map((selected) => ({ selected })))("uncaptured leave commits map/group once, selection %j", ({ selected }) => {
    const h = setup(selected);
    h.down();
    h.move();
    h.leave();
    // Anchor ends at (5,1), delta=(3,-2). B ends at (11,2), in start order.
    const moves = selected.length ? [
      { map: "B", x: 11, y: 2, version: h.begin.mock.results[0]!.value },
      { map: "A", x: 5, y: 1, version: h.begin.mock.results[1]!.value },
    ] : [{ map: "A", x: 5, y: 1, version: h.begin.mock.results[0]!.value }];
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.commit).toHaveBeenCalledWith(moves);
    expect(h.result.current.draggingMap).toBe(false);
    expect(h.move()).toBe(false);
    h.up();
    expect(h.commit).toHaveBeenCalledOnce();
  });

  it("uncaptured marquee leave selects and clears; pan leave ends pan", () => {
    const h = setup(["C"]);
    h.down(0, 0, { ctrlKey: true });
    h.move(100, 100);
    h.leave();
    // Rightward [0,100]^2 /10 contains A only; B extends beyond world x=10.
    expect(h.result.current.selection).toEqual(new Set(["A"]));
    expect(h.result.current.marqueeRect).toBeNull();
    h.up();
    expect(h.setSelected).toHaveBeenCalledOnce();
    h.down(0, 0, {});
    h.move();
    h.leave();
    h.up();
    expect(h.stage.endPan).toHaveBeenCalledOnce();
  });
});

describe("cancel", () => {
  it("reverts a moved map, noops its begun version, and preserves the click guard", () => {
    const h = setup();
    h.down();
    h.move();
    const version = h.begin.mock.results[0]!.value;
    h.cancel();
    // The optimistic (5,1) is replaced by A's original (2,3).
    expect(position(h.placements.get("A"))).toEqual({ x: 2, y: 3 });
    expect(h.movePlacements).toHaveBeenLastCalledWith(new Map([["A", { x: 2, y: 3 }]]));
    expect(h.noop).toHaveBeenCalledOnce();
    expect(h.noop).toHaveBeenCalledWith("A", version);
    expect(h.ledger.serverShows("A", h.ledger.snapshot())).toBe(true);
    expect(h.result.current.dragMoved()).toBe(true);
    expect(h.result.current.draggingMap).toBe(false);
    expect(h.move()).toBe(false);
    h.up();
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.moved).not.toHaveBeenCalled();
  });

  it("a cancelled version waits for an earlier unresolved POST", () => {
    const h = setup();
    const earlier = h.ledger.begin("A");
    h.ledger.moved("A", earlier);
    h.begin.mockClear();
    h.down();
    h.move();
    const cancelled = h.begin.mock.results[0]!.value;
    h.cancel();
    expect(h.noop).toHaveBeenCalledOnce();
    expect(h.noop).toHaveBeenCalledWith("A", cancelled);
    // Cancel restores start (2,3), but the previous POST still owns server reconciliation.
    expect(position(h.placements.get("A"))).toEqual({ x: 2, y: 3 });
    expect(h.ledger.serverShows("A", h.ledger.snapshot())).toBe(false);
    h.ledger.resolve("A", earlier, true);
    expect(h.ledger.serverShows("A", h.ledger.snapshot())).toBe(true);
    h.up();
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("reverts every begun group member in one update before noop", () => {
    const h = setup(["B", "A"]);
    h.down();
    h.move();
    h.movePlacements.mockClear();
    h.cancel();
    // The shared delta (3,-2) is undone: B (11,2)->(8,4), A (5,1)->(2,3).
    expect(h.movePlacements).toHaveBeenCalledOnce();
    expect(h.movePlacements).toHaveBeenCalledWith(new Map([
      ["B", { x: 8, y: 4 }], ["A", { x: 2, y: 3 }],
    ]));
    expect(position(h.placements.get("B"))).toEqual({ x: 8, y: 4 });
    expect(position(h.placements.get("A"))).toEqual({ x: 2, y: 3 });
    expect(h.noop.mock.calls).toEqual([
      ["B", h.begin.mock.results[0]!.value], ["A", h.begin.mock.results[1]!.value],
    ]);
    const rollback = h.movePlacements.mock.invocationCallOrder[0]!;
    expect(h.noop.mock.invocationCallOrder.every((order) => order > rollback)).toBe(true);
    for (const name of ["A", "B"]) expect(h.ledger.serverShows(name, h.ledger.snapshot())).toBe(true);
    h.up();
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.result.current.draggingMap).toBe(false);
  });

  it.each([[], ["A", "B"]].map((selected) => ({ selected })))("unmoved cancel begins nothing and performs no rollback, selection %j", ({ selected }) => {
    const h = setup(selected);
    h.down();
    h.cancel();
    h.up();
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.movePlacements).not.toHaveBeenCalled();
    expect(h.noop).not.toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("drops marquee without selecting and drops pan without ending it again", () => {
    const h = setup(["C"]);
    h.down(0, 0, { ctrlKey: true });
    h.move(100, 100);
    h.cancel();
    expect(h.result.current.marqueeRect).toBeNull();
    expect(h.result.current.selection).toEqual(new Set(["C"]));
    expect(h.setSelected).not.toHaveBeenCalled();
    expect(h.result.current.dragMoved()).toBe(true);
    h.up();
    h.down(0, 0, {});
    h.move();
    h.cancel();
    h.up();
    expect(h.stage.endPan).not.toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
  });
});

describe("unmount cleanup", () => {
  it("unmount mid map drag reverts the map and settles its begun version", () => {
    const h = setup();
    h.down();
    h.move();
    const version = h.begin.mock.results[0]!.value;
    h.unmount();
    expect(h.movePlacements).toHaveBeenLastCalledWith(new Map([["A", { x: 2, y: 3 }]]));
    expect(h.noop).toHaveBeenCalledTimes(1);
    expect(h.noop).toHaveBeenCalledWith("A", version);
    expect(h.ledger.serverShows("A", h.ledger.snapshot())).toBe(true);
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("unmount mid group drag reverts and settles every member", () => {
    const h = setup(["A", "B"]);
    h.down();
    h.move();
    const [vA, vB] = h.begin.mock.results.map((r) => r.value);
    h.unmount();
    expect(h.movePlacements).toHaveBeenLastCalledWith(new Map([["A", { x: 2, y: 3 }], ["B", { x: 8, y: 4 }]]));
    expect(h.noop).toHaveBeenCalledTimes(2);
    expect(h.noop).toHaveBeenCalledWith("A", vA);
    expect(h.noop).toHaveBeenCalledWith("B", vB);
    expect(h.ledger.serverShows("A", h.ledger.snapshot())).toBe(true);
    expect(h.ledger.serverShows("B", h.ledger.snapshot())).toBe(true);
  });

  it("unmount with no gesture does nothing", () => {
    const h = setup();
    h.unmount();
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.movePlacements).not.toHaveBeenCalled();
    expect(h.noop).not.toHaveBeenCalled();
    expect(h.commit).not.toHaveBeenCalled();
  });
});
