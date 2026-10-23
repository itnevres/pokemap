import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import { GbcMapCanvas, type GbcMapCanvasProps } from "../../src/gbc/GbcMapCanvas.js";
import type { UseGbcEditSessionResult } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";

// 3x2 blocks, border ring 1 => origin (32,32), 32 px blocks, 16 px steps.
// Client (72,72) at zoom 1, pan 0, rect.left/top 0 => block (1,1), step (2,2).
const NO_EVENTS: GbcMapEvents = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const OBJECT = { x: 2, y: 2, sprite: "SPRITE_TEACHER", moveData: "M", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "S", eventFlag: "-1", lineIndex: 0 };
const BLOCKS = [0, 1, 2, 3, 4, 5].map((metatileId) => ({ metatileId }));

const DATA: GbcMapPayload = {
  family: "gbc",
  map: {
    name: "M", constName: "M", group: 1, number: 1, width: 3, height: 2, blkPath: "maps/M.blk", tileset: "T",
    environment: "E", landmark: "L", music: "X", phoneFlag: "0", palette: "P", fishGroup: "0", border: 1, connectionFlags: "0", connections: [],
  },
  layout: { blkPath: "maps/M.blk", width: 3, height: 2 },
  blocks: BLOCKS,
  metatileCount: 6,
  tileset: { constName: "T", name: "T" },
  collision: Array.from({ length: 6 }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 })),
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: NO_EVENTS,
  defects: [],
  incomplete: [], paddingWidth: 3,
};

const STAMP = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
let log: string[];

function session(over: Partial<UseGbcEditSessionResult> = {}): UseGbcEditSessionResult {
  const note = (n: string) => vi.fn((..._a: unknown[]) => { log.push(n); return Promise.resolve(); });
  return {
    blocks: BLOCKS, events: NO_EVENTS, isDirty: false, canUndo: false, canRedo: false,
    beginStroke: note("begin"), applyPaint: vi.fn((b: unknown) => { log.push(`apply ${JSON.stringify(b)}`); return Promise.resolve(); }),
    endStroke: note("end"), undo: note("undo"), redo: note("redo"), discard: note("discard"), markClean: vi.fn(),
    moveEvent: note("move"), addEvent: note("add"), deleteEvent: vi.fn(() => Promise.resolve({ warpRenumberWarnings: [] })),
    ...over,
  };
}

class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  log = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error -- narrow test stub
  HTMLCanvasElement.prototype.getContext = () => ({ imageSmoothingEnabled: true, drawImage() {}, clearRect() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData() {}, save() {}, restore() {}, strokeRect() {} });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 160, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 128, configurable: true });
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mount(props: Partial<GbcMapCanvasProps> = {}) {
  const u = render(<GbcMapCanvas mapName="M" data={DATA} time="day" {...props} />);
  const canvas = u.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  const img = u.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
  return { ...u, canvas, img };
}
const at = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0 });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const delayedBegin = (ms: number) => vi.fn((): Promise<void> => { log.push("begin"); return sleep(ms); });

describe("GbcMapCanvas painting (Plan 7 Task 5)", () => {
  it("a fast click with a delayed beginStroke still applies exactly one pencil paint, then endStroke, in order", async () => {
    const s = session({ beginStroke: delayedBegin(40) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(72, 72));
    fireEvent.mouseUp(canvas, at(72, 72)); // inside the begin delay
    await waitFor(() => expect(log).toContain("end"));
    expect(log).toEqual([
      "begin",
      `apply ${JSON.stringify({ tool: "pencil", targets: [{ x: 1, y: 1 }], stamp: STAMP, origin: { x: 1, y: 1 } })}`,
      "end",
    ]);
  });

  it("units: paint targets are BLOCKS (client 72,72 -> block 1,1, not step 2,2)", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(72, 72));
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalled());
    expect((s.applyPaint as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ targets: [{ x: 1, y: 1 }], origin: { x: 1, y: 1 } });
  });

  it("bucket sends block coordinates and the stamp's id", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "bucket", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(72, 72));
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledWith({ tool: "bucket", x: 1, y: 1, replacement: { metatileId: 9 } }));
  });

  it("rect: mousedown at A, mouseup at B, with a delayed begin, sends one rect", async () => {
    const s = session({ beginStroke: delayedBegin(40) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "rect", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(40, 40)); // block 0,0
    fireEvent.mouseUp(canvas, at(104, 72)); // block 2,1
    await waitFor(() => expect(log).toContain("end"));
    expect(log).toEqual([
      "begin",
      `apply ${JSON.stringify({ tool: "rect", x0: 0, y0: 0, x1: 2, y1: 1, stamp: STAMP, origin: { x: 0, y: 0 } })}`,
      "end",
    ]);
  });

  it("shift sends the block delta of the drag", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "shift" } });
    fireEvent.mouseDown(canvas, at(40, 40));
    fireEvent.mouseUp(canvas, at(104, 72));
    await waitFor(() => expect(log).toContain("end"));
    expect(s.applyPaint).toHaveBeenCalledWith({ tool: "shift", dx: 2, dy: 1 });
  });

  it("mouseleave mid-stroke ends the stroke", async () => {
    const s = session({ beginStroke: delayedBegin(20) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(72, 72));
    fireEvent.mouseLeave(canvas);
    await waitFor(() => expect(log).toContain("end"));
    expect(log[0]).toBe("begin");
    expect(log.at(-1)).toBe("end");
  });

  it("a click off the map paints nothing and opens no stroke", () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(5, 5));
    expect(s.beginStroke).not.toHaveBeenCalled();
  });
});

describe("GbcMapCanvas dropper", () => {
  it("picks the clicked block's id as a 1x1 stamp and opens no stroke", () => {
    const s = session();
    const onDropperPick = vi.fn();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "dropper" }, onDropperPick });
    fireEvent.mouseDown(canvas, at(72, 72)); // block (1,1) = index 4
    fireEvent.mouseUp(canvas, at(72, 72));
    expect(onDropperPick).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 4 }] });
    expect(s.beginStroke).not.toHaveBeenCalled();
    expect(s.endStroke).not.toHaveBeenCalled();
  });
});

describe("GbcMapCanvas events", () => {
  const withObject: GbcMapEvents = { ...NO_EVENTS, objects: [OBJECT] };

  it("units: a drag reports STEP coordinates (client 72,72 -> step 2,2; release at 104,72 -> 4,2)", () => {
    const onSelectEvent = vi.fn();
    const onMoveEvent = vi.fn();
    const { canvas } = mount({ editSession: session({ events: withObject }), onSelectEvent, onMoveEvent });
    fireEvent.mouseDown(canvas, at(72, 72));
    expect(onSelectEvent).toHaveBeenCalledWith({ kind: "object", index: 0 });
    fireEvent.mouseMove(canvas, at(90, 72));
    fireEvent.mouseUp(canvas, at(104, 72));
    expect(onMoveEvent).toHaveBeenCalledTimes(1);
    expect(onMoveEvent).toHaveBeenCalledWith({ kind: "object", index: 0, x: 4, y: 2 });
  });

  it("releasing on the start step moves nothing", () => {
    const onMoveEvent = vi.fn();
    const { canvas } = mount({ editSession: session({ events: withObject }), onSelectEvent: vi.fn(), onMoveEvent });
    fireEvent.mouseDown(canvas, at(72, 72));
    fireEvent.mouseUp(canvas, at(75, 75));
    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  it("an active tool wins over event selection (precedence mirrors GBA)", () => {
    const onSelectEvent = vi.fn();
    const { canvas } = mount({ editSession: session({ events: withObject }), activeTool: { kind: "pencil", stamp: STAMP }, onSelectEvent });
    fireEvent.mouseDown(canvas, at(72, 72));
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it("a click on empty ground deselects (and falls through to the pan drag)", () => {
    const onSelectEvent = vi.fn();
    const { canvas } = mount({ editSession: session({ events: withObject }), onSelectEvent });
    fireEvent.mouseDown(canvas, at(120, 100));
    expect(onSelectEvent).toHaveBeenCalledWith(null);
  });

  it("only the left button acts (GBA convention)", () => {
    const onSelectEvent = vi.fn();
    const { canvas } = mount({ editSession: session({ events: withObject }), onSelectEvent });
    fireEvent.mouseDown(canvas, { clientX: 72, clientY: 72, button: 2 });
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it("hover reads the session's events, not data.events", () => {
    const { canvas, container } = mount({ editSession: session({ events: withObject }) });
    fireEvent.mouseMove(canvas, at(72, 72));
    expect(container.querySelector(".map-canvas__hover")!.textContent).toContain("object #0");
  });
});

describe("GbcMapCanvas image freshness", () => {
  it("with a session, a paint bumps &v= after the debounce (timer held, not slept)", () => {
    vi.useFakeTimers();
    const first = session();
    const { img, rerender } = mount({ editSession: first });
    expect(img.getAttribute("src")).toBe("/api/render/M.png?border=1&time=day");
    rerender(<GbcMapCanvas mapName="M" data={DATA} time="day" editSession={{ ...first, blocks: [...BLOCKS] }} />);
    act(() => { vi.advanceTimersByTime(199); });
    expect(img.getAttribute("src")).toBe("/api/render/M.png?border=1&time=day");
    act(() => { vi.advanceTimersByTime(1); });
    expect(img.getAttribute("src")).toBe("/api/render/M.png?border=1&time=day&v=1");
  });

  it("a burst of block changes coalesces into one bump", () => {
    vi.useFakeTimers();
    const first = session();
    const { img, rerender } = mount({ editSession: first });
    for (let i = 0; i < 3; i++) rerender(<GbcMapCanvas mapName="M" data={DATA} time="day" editSession={{ ...first, blocks: [...BLOCKS] }} />);
    act(() => { vi.advanceTimersByTime(250); });
    expect(img.getAttribute("src")).toContain("&v=1");
  });

  it("a map switch alone does not bump", () => {
    vi.useFakeTimers();
    const first = session();
    const { img, rerender } = mount({ editSession: first });
    rerender(<GbcMapCanvas mapName="N" data={DATA} time="day" editSession={{ ...first, blocks: [...BLOCKS] }} />);
    act(() => { vi.advanceTimersByTime(500); });
    expect(img.getAttribute("src")).toBe("/api/render/N.png?border=1&time=day");
    // ...but tracking resumes: a real edit on the new map still bumps.
    rerender(<GbcMapCanvas mapName="N" data={DATA} time="day" editSession={{ ...first, blocks: [...BLOCKS] }} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(img.getAttribute("src")).toBe("/api/render/N.png?border=1&time=day&v=1");
  });

  it("without a session the URL has no v= even when data changes", () => {
    vi.useFakeTimers();
    const { img, rerender } = mount();
    rerender(<GbcMapCanvas mapName="M" data={{ ...DATA, blocks: [...BLOCKS] }} time="day" />);
    act(() => { vi.advanceTimersByTime(500); });
    expect(img.getAttribute("src")).toBe("/api/render/M.png?border=1&time=day");
  });
});

describe("GbcMapCanvas errors and drag dedupe", () => {
  it("a rejected request reports its message through onEditError", async () => {
    const onEditError = vi.fn();
    const s = session({ beginStroke: vi.fn((): Promise<void> => Promise.reject(new Error("boom: server said no"))) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP }, onEditError });
    fireEvent.mouseDown(canvas, at(72, 72));
    await waitFor(() => expect(onEditError).toHaveBeenCalledWith("boom: server said no"));
  });

  it("a held pencil drag paints each new block once, not once per mousemove", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(72, 72)); // block 1,1 (painted by the begin chain)
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { clientX: 74, clientY: 74, buttons: 1 });
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 80, buttons: 1 });
    await act(async () => {}); // moves queue on the stroke chain; let them run before the negative count
    expect(s.applyPaint).toHaveBeenCalledTimes(1);
    fireEvent.mouseMove(canvas, { clientX: 104, clientY: 72, buttons: 1 }); // block 2,1
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(2));
    fireEvent.mouseMove(canvas, { clientX: 105, clientY: 73, buttons: 1 });
    await act(async () => {});
    expect(s.applyPaint).toHaveBeenCalledTimes(2);
  });

  it("the dedupe resets with the stroke: the same block is painted again by the next stroke", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    for (let i = 0; i < 2; i++) {
      fireEvent.mouseDown(canvas, at(72, 72));
      fireEvent.mouseUp(canvas, at(72, 72));
      await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(log.filter((l) => l === "end").length).toBe(i + 1));
    }
  });
});

function held() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("GbcMapCanvas stroke completion barrier (B1)", () => {
  it.each(["begin", "apply", "end"] as const)("retired %s failure does not update the next visit's error UI", async (phase) => {
    const pending = held();
    const onEditError = vi.fn();
    const old = session({ [phase === "begin" ? "beginStroke" : phase === "apply" ? "applyPaint" : "endStroke"]: vi.fn(() => pending.promise) });
    const props = { activeTool: { kind: "rect" as const, stamp: STAMP }, onEditError };
    const mounted = mount({ ...props, editSession: old });
    fireEvent.mouseDown(mounted.canvas, at(40, 40));
    fireEvent.mouseUp(mounted.canvas, at(72, 72));
    await waitFor(() => expect(phase === "begin" ? old.beginStroke : phase === "apply" ? old.applyPaint : old.endStroke).toHaveBeenCalledTimes(1));
    mounted.rerender(<GbcMapCanvas mapName="N" data={DATA} time="day" {...props} editSession={session()} />);
    await act(async () => pending.reject(new Error("retired failure")));
    expect(onEditError).not.toHaveBeenCalled();
  });
  for (const phase of ["begin", "apply"] as const) it.each(["map", "ABA", "unmount"])("%s retires pending " + phase + " without mouseup and finishes its issued begin", async (retirement) => {
    const begin = held();
    const old = session(phase === "begin" ? { beginStroke: vi.fn(() => begin.promise) } : { applyPaint: vi.fn(() => begin.promise) });
    const next = session();
    const props = { activeTool: { kind: phase === "begin" ? "rect" as const : "pencil" as const, stamp: STAMP } };
    const mounted = mount({ ...props, editSession: old });
    fireEvent.mouseDown(mounted.canvas, at(40, 40));
    await waitFor(() => expect(old.beginStroke).toHaveBeenCalledTimes(1));
    if (phase === "apply") await waitFor(() => expect(old.applyPaint).toHaveBeenCalledTimes(1));
    if (retirement === "unmount") mounted.unmount();
    else {
      mounted.rerender(<GbcMapCanvas mapName="N" data={DATA} time="day" {...props} editSession={next} />);
      if (retirement === "ABA") mounted.rerender(<GbcMapCanvas mapName="M" data={DATA} time="day" {...props} editSession={next} />);
      fireEvent.mouseUp(mounted.canvas, at(104, 72));
    }
    await act(async () => begin.resolve());
    expect(old.applyPaint).toHaveBeenCalledTimes(phase === "begin" ? 0 : 1);
    expect(old.endStroke).toHaveBeenCalledTimes(1);
    expect(next.applyPaint).not.toHaveBeenCalled();
    expect(next.endStroke).not.toHaveBeenCalled();
  });
  it("queues a held-begin pencil move behind begin and the initial cell", async () => {
    const begin = held();
    const s = session({ beginStroke: vi.fn(() => begin.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(40, 40));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(72, 40), buttons: 1 });
    fireEvent.mouseUp(canvas, at(72, 40));
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => begin.resolve());
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
    expect((s.applyPaint as ReturnType<typeof vi.fn>).mock.calls.map(([body]) => body.targets)).toEqual([[{ x: 0, y: 0 }], [{ x: 1, y: 0 }]]);
  });

  it.each(["pencil", "bucket", "rect", "shift"] as const)("%s immediate mouseup waits for an independently held first apply", async (kind) => {
    const begin = held();
    const apply = held();
    const s = session({ beginStroke: vi.fn(() => begin.promise), applyPaint: vi.fn(() => apply.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind, stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(40, 40));
    fireEvent.mouseUp(canvas, at(104, 72));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    expect(s.applyPaint).not.toHaveBeenCalled();
    await act(async () => begin.resolve());
    expect(s.applyPaint).toHaveBeenCalledTimes(1);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => apply.resolve());
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
  });

  it("serializes three independently held drag applies and end waits for every cell", async () => {
    const cells = [held(), held(), held()];
    let index = 0;
    const s = session({ applyPaint: vi.fn(() => cells[index++]!.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(40, 40));
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(72, 40), buttons: 1 });
    fireEvent.mouseMove(canvas, { ...at(104, 40), buttons: 1 });
    fireEvent.mouseMove(canvas, { ...at(105, 41), buttons: 1 }); // same-cell dedupe while queued
    fireEvent.mouseUp(canvas, at(104, 40));
    expect(s.applyPaint).toHaveBeenCalledTimes(1);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => cells[0]!.resolve());
    expect(s.applyPaint).toHaveBeenCalledTimes(2);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => cells[1]!.resolve());
    expect(s.applyPaint).toHaveBeenCalledTimes(3);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => cells[2]!.resolve());
    expect(s.endStroke).toHaveBeenCalledTimes(1);
    expect((s.applyPaint as ReturnType<typeof vi.fn>).mock.calls.map(([body]) => body.targets)).toEqual([[{ x: 0, y: 0 }], [{ x: 1, y: 0 }], [{ x: 2, y: 0 }]]);
  });

  it("a following stroke waits for the previous end round trip", async () => {
    const end = held();
    const s = session({ endStroke: vi.fn().mockImplementationOnce(() => end.promise).mockResolvedValue(undefined) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(40, 40));
    fireEvent.mouseUp(canvas, at(40, 40));
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(canvas, at(72, 40));
    fireEvent.mouseUp(canvas, at(72, 40));
    await act(async () => {}); // Let queued begin run if it incorrectly bypasses the held end round trip.
    expect(s.beginStroke).toHaveBeenCalledTimes(1);
    await act(async () => end.resolve());
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(2));
    expect(s.beginStroke).toHaveBeenCalledTimes(2);
  });

  for (const aba of [false, true]) for (const phase of ["begin", "apply"] as const) {
    it("retires queued " + phase + " work on a map visit change (ABA=" + aba + ")", async () => {
      const pending = held();
      const old = session(phase === "begin" ? { beginStroke: vi.fn(() => pending.promise) } : { applyPaint: vi.fn(() => pending.promise) });
      const next = session();
      const props = { activeTool: { kind: "pencil" as const, stamp: STAMP } };
      const mounted = mount({ ...props, editSession: old });
      fireEvent.mouseDown(mounted.canvas, at(40, 40));
      await waitFor(() => expect(old.beginStroke).toHaveBeenCalledTimes(1));
      if (phase === "apply") await waitFor(() => expect(old.applyPaint).toHaveBeenCalledTimes(1));
      fireEvent.mouseMove(mounted.canvas, { ...at(72, 40), buttons: 1 });
      fireEvent.mouseUp(mounted.canvas, at(72, 40));
      mounted.rerender(<GbcMapCanvas mapName="N" data={{ ...DATA, map: { ...DATA.map, name: "N" } }} time="day" {...props} editSession={next} />);
      if (aba) mounted.rerender(<GbcMapCanvas mapName="M" data={DATA} time="day" {...props} editSession={next} />);
      await act(async () => pending.resolve());
      expect(old.applyPaint).toHaveBeenCalledTimes(phase === "begin" ? 0 : 1);
      expect(old.endStroke).toHaveBeenCalledTimes(1); // Finish only the captured old session, not the new map.
      expect(next.beginStroke).not.toHaveBeenCalled();
      expect(next.applyPaint).not.toHaveBeenCalled();
      expect(next.endStroke).not.toHaveBeenCalled();
    });
  }

  it("unmount retires pending begin continuations", async () => {
    const begin = held();
    const s = session({ beginStroke: vi.fn(() => begin.promise) });
    const mounted = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(mounted.canvas, at(40, 40));
    fireEvent.mouseUp(mounted.canvas, at(40, 40));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    mounted.unmount();
    await act(async () => begin.resolve());
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).toHaveBeenCalledTimes(1);
  });

  it("begin failure is visible and queued moves do not paint after it", async () => {
    const begin = held();
    const onEditError = vi.fn();
    const s = session({ beginStroke: vi.fn(() => begin.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP }, onEditError });
    fireEvent.mouseDown(canvas, at(40, 40));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(72, 40), buttons: 1 });
    fireEvent.mouseUp(canvas, at(72, 40));
    await act(async () => begin.reject(new Error("held begin failed")));
    expect(onEditError).toHaveBeenCalledWith("held begin failed");
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).toHaveBeenCalledTimes(1); // cleanup remains after the settled failure
  });

  it("apply failure is visible and later queued apply still blocks end until settled", async () => {
    const first = held();
    const second = held();
    const onEditError = vi.fn();
    const s = session({ applyPaint: vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP }, onEditError });
    fireEvent.mouseDown(canvas, at(40, 40));
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(72, 40), buttons: 1 });
    fireEvent.mouseUp(canvas, at(72, 40));
    await act(async () => first.reject(new Error("held apply failed")));
    expect(onEditError).toHaveBeenCalledWith("held apply failed");
    expect(s.applyPaint).toHaveBeenCalledTimes(2);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => second.resolve());
    expect(s.endStroke).toHaveBeenCalledTimes(1);
  });

  it("an off-map mousedown followed by a held move creates no apply or end without begin", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(5, 5));
    fireEvent.mouseMove(canvas, { ...at(40, 40), buttons: 1 });
    fireEvent.mouseUp(canvas, at(40, 40));
    await act(async () => {});
    expect(s.beginStroke).not.toHaveBeenCalled();
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).not.toHaveBeenCalled();
  });
});
