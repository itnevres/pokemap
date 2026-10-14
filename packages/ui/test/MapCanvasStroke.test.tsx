import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import { MapCanvas, type MapCanvasProps } from "../src/components/MapCanvas.js";
import type { MapLayoutData } from "../src/hooks/useMapLayout.js";
import type { UseEditSessionResult } from "../src/hooks/useEditSession.js";

// Plan 8 Task 1 (F6): the GBA canvas gains the GBC stroke-completion barrier (B1) through the shared chain.
// Mirrors GbcMapCanvasEdit.test.tsx "stroke completion barrier (B1)". Fixture as MapCanvas.test.tsx: 2x2 layout,
// 1-block border, 16 px blocks, viewport 64 -> zoom 1 pan 0, so client (16 + 16x, 16 + 16y) is block (x, y).
const DATA: MapLayoutData = {
  map: {
    id: "MAP_FOO", name: "Foo", layout: "LAYOUT_FOO", music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE",
    mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE", connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  layout: {
    id: "LAYOUT_FOO", name: "Foo_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1,
    primaryTileset: "gTileset_General", secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/Foo/border.bin", blockdataFilepath: "data/layouts/Foo/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0x05 },
    { metatileId: 0x11, collision: 1, elevation: 3, behavior: 0x05 },
    { metatileId: 0x12, collision: 0, elevation: 0, behavior: 0x05 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0x09 },
  ],
  primaryCount: 512,
  secondaryCount: 144,
};
const STAMP = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
const at = (bx: number, by: number) => ({ clientX: 16 + 16 * bx, clientY: 16 + 16 * by, button: 0 });
const held = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let log: string[];

function session(over: Partial<UseEditSessionResult> = {}): UseEditSessionResult {
  const note = (n: string) => vi.fn((..._a: unknown[]) => { log.push(n); return Promise.resolve(); });
  return {
    blocks: [], border: [], map: undefined, isDirty: false, canUndo: false, canRedo: false,
    beginStroke: note("begin"),
    applyPaint: vi.fn((b: { targets?: { x: number }[] }) => { log.push(`apply ${b.targets?.[0]?.x}`); return Promise.resolve(); }) as UseEditSessionResult["applyPaint"],
    endStroke: note("end"), undo: note("undo"), redo: note("redo"), markClean: vi.fn(), moveEvent: note("move"),
    addEvent: note("add"), deleteEvent: vi.fn().mockResolvedValue(undefined), applyExternalMapUpdate: vi.fn(), discard: note("discard"),
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
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 64, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 64, configurable: true });
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
});

function mount(props: Partial<MapCanvasProps> = {}) {
  const u = render(<MapCanvas mapName="Foo" data={DATA} {...props} />);
  const canvas = u.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  return { ...u, canvas };
}
const rerenderAs = (u: ReturnType<typeof mount>, mapName: string, props: Partial<MapCanvasProps>) =>
  u.rerender(<MapCanvas mapName={mapName} data={DATA} {...props} />);
const calls = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls;

describe("MapCanvas stroke completion barrier (Plan 8 Task 1, F6)", () => {
  it("a fast click with a delayed begin applies once, then ends, in order", async () => {
    const s = session({ beginStroke: vi.fn(() => { log.push("begin"); return new Promise<void>((r) => setTimeout(r, 40)); }) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    fireEvent.mouseUp(canvas, at(0, 0));
    await waitFor(() => expect(log).toContain("end"));
    expect(log).toEqual(["begin", "apply 0", "end"]);
  });

  it("queues a held-begin pencil move behind begin and the initial cell", async () => {
    const begin = held();
    const s = session({ beginStroke: vi.fn(() => begin.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(1, 0), buttons: 1 });
    fireEvent.mouseUp(canvas, at(1, 0));
    await act(async () => {});
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => begin.resolve());
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
    expect(calls(s.applyPaint).map(([body]) => body.targets)).toEqual([[{ x: 0, y: 0 }], [{ x: 1, y: 0 }]]);
  });

  it.each(["pencil", "bucket", "rect", "shift"] as const)("%s immediate mouseup waits for an independently held first apply", async (kind) => {
    const begin = held();
    const apply = held();
    const s = session({ beginStroke: vi.fn(() => begin.promise), applyPaint: vi.fn(() => apply.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind, stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    fireEvent.mouseUp(canvas, at(1, 1));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(s.applyPaint).not.toHaveBeenCalled();
    await act(async () => begin.resolve());
    expect(s.applyPaint).toHaveBeenCalledTimes(1);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => apply.resolve());
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
  });

  it("serializes four independently held drag applies (no dedupe on GBA) and end waits for every cell", async () => {
    const cells = [held(), held(), held(), held()];
    let index = 0;
    const s = session({ applyPaint: vi.fn(() => cells[index++]!.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(1, 0), buttons: 1 });
    fireEvent.mouseMove(canvas, { ...at(0, 1), buttons: 1 });
    fireEvent.mouseMove(canvas, { ...at(1, 1), buttons: 1 });
    fireEvent.mouseUp(canvas, at(1, 1));
    for (let i = 1; i <= 4; i++) {
      await act(async () => {});
      expect(s.applyPaint).toHaveBeenCalledTimes(i);
      expect(s.endStroke).not.toHaveBeenCalled();
      await act(async () => cells[i - 1]!.resolve());
    }
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
    expect(calls(s.applyPaint).map(([body]) => body.targets)).toEqual([[{ x: 0, y: 0 }], [{ x: 1, y: 0 }], [{ x: 0, y: 1 }], [{ x: 1, y: 1 }]]);
  });

  it("a following stroke waits for the previous end round trip", async () => {
    const end = held();
    const s = session({ endStroke: vi.fn().mockImplementationOnce(() => end.promise).mockResolvedValue(undefined) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    fireEvent.mouseUp(canvas, at(0, 0));
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(canvas, at(1, 0));
    fireEvent.mouseUp(canvas, at(1, 0));
    await act(async () => {}); // Let a queued begin run if it incorrectly bypasses the held end round trip.
    expect(s.beginStroke).toHaveBeenCalledTimes(1);
    await act(async () => end.resolve());
    await waitFor(() => expect(s.endStroke).toHaveBeenCalledTimes(2));
    expect(s.beginStroke).toHaveBeenCalledTimes(2);
  });

  it("a lost mouseup: a second mousedown ends the open stroke before the new begin (two undo steps)", async () => {
    const end = held();
    const s = session({ endStroke: vi.fn(() => { log.push("end"); return end.promise; }) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    await waitFor(() => expect(log).toEqual(["begin", "apply 0"]));
    fireEvent.mouseDown(canvas, at(1, 0)); // no mouseup in between
    await act(async () => {});
    expect(log).toEqual(["begin", "apply 0", "end"]);
    await act(async () => end.resolve());
    await waitFor(() => expect(log).toEqual(["begin", "apply 0", "end", "begin", "apply 1"]));
  });

  for (const phase of ["begin", "apply"] as const) it.each(["map", "ABA", "unmount"])("%s retires pending " + phase + " and still finishes its issued begin", async (retirement) => {
    const pending = held();
    const old = session(phase === "begin" ? { beginStroke: vi.fn(() => pending.promise) } : { applyPaint: vi.fn(() => pending.promise) });
    const next = session();
    const props = { activeTool: { kind: "pencil" as const, stamp: STAMP } };
    const mounted = mount({ ...props, editSession: old });
    fireEvent.mouseDown(mounted.canvas, at(0, 0));
    await waitFor(() => expect(old.beginStroke).toHaveBeenCalledTimes(1));
    if (phase === "apply") await waitFor(() => expect(old.applyPaint).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(mounted.canvas, { ...at(1, 0), buttons: 1 });
    if (retirement === "unmount") mounted.unmount();
    else {
      rerenderAs(mounted, "Bar", { ...props, editSession: next });
      if (retirement === "ABA") rerenderAs(mounted, "Foo", { ...props, editSession: next });
      fireEvent.mouseUp(mounted.canvas, at(1, 0));
    }
    await act(async () => pending.resolve());
    expect(old.applyPaint).toHaveBeenCalledTimes(phase === "begin" ? 0 : 1);
    expect(old.endStroke).toHaveBeenCalledTimes(1); // only the captured old session finishes, never the new map's
    expect(next.beginStroke).not.toHaveBeenCalled();
    expect(next.applyPaint).not.toHaveBeenCalled();
    expect(next.endStroke).not.toHaveBeenCalled();
  });

  it.each(["map", "ABA", "unmount"])("%s retires a held end: nothing reaches the next visit, a late end failure is silent", async (retirement) => {
    const end = held();
    const old = session({ endStroke: vi.fn(() => end.promise) });
    const next = session();
    const props = { activeTool: { kind: "pencil" as const, stamp: STAMP } };
    const mounted = mount({ ...props, editSession: old });
    fireEvent.mouseDown(mounted.canvas, at(0, 0));
    fireEvent.mouseUp(mounted.canvas, at(0, 0));
    await waitFor(() => expect(old.endStroke).toHaveBeenCalledTimes(1));
    if (retirement === "unmount") mounted.unmount();
    else {
      rerenderAs(mounted, "Bar", { ...props, editSession: next });
      if (retirement === "ABA") rerenderAs(mounted, "Foo", { ...props, editSession: next });
    }
    await act(async () => end.reject(new Error("late end")));
    await act(async () => {});
    expect(old.endStroke).toHaveBeenCalledTimes(1);
    expect(next.beginStroke).not.toHaveBeenCalled();
    expect(next.applyPaint).not.toHaveBeenCalled();
    expect(next.endStroke).not.toHaveBeenCalled();
  });

  it("a retired held end is not followed by new work on the next visit's session", async () => {
    const end = held();
    const old = session({ endStroke: vi.fn(() => end.promise) });
    const next = session();
    const props = { activeTool: { kind: "pencil" as const, stamp: STAMP } };
    const mounted = mount({ ...props, editSession: old });
    fireEvent.mouseDown(mounted.canvas, at(0, 0));
    fireEvent.mouseUp(mounted.canvas, at(0, 0));
    await waitFor(() => expect(old.endStroke).toHaveBeenCalledTimes(1));
    rerenderAs(mounted, "Bar", { ...props, editSession: next });
    fireEvent.mouseDown(mounted.canvas, at(1, 0));
    await act(async () => {});
    expect(next.beginStroke).not.toHaveBeenCalled(); // waits behind the old visit's held end
    await act(async () => end.resolve());
    await waitFor(() => expect(next.beginStroke).toHaveBeenCalledTimes(1));
  });

  it("begin failure: queued moves do not paint after it, and end still follows", async () => {
    const begin = held();
    const s = session({ beginStroke: vi.fn(() => begin.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    await waitFor(() => expect(s.beginStroke).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(1, 0), buttons: 1 });
    fireEvent.mouseUp(canvas, at(1, 0));
    await act(async () => begin.reject(new Error("held begin failed")));
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).toHaveBeenCalledTimes(1);
  });

  it("apply failure: a later queued apply still runs and end waits for it", async () => {
    const first = held();
    const second = held();
    const s = session({ applyPaint: vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(0, 0));
    await waitFor(() => expect(s.applyPaint).toHaveBeenCalledTimes(1));
    fireEvent.mouseMove(canvas, { ...at(1, 0), buttons: 1 });
    fireEvent.mouseUp(canvas, at(1, 0));
    await act(async () => first.reject(new Error("held apply failed")));
    expect(s.applyPaint).toHaveBeenCalledTimes(2);
    expect(s.endStroke).not.toHaveBeenCalled();
    await act(async () => second.resolve());
    expect(s.endStroke).toHaveBeenCalledTimes(1);
  });

  it("an off-map mousedown followed by a held move creates no apply or end without begin", async () => {
    const s = session();
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, { clientX: 60, clientY: 60, button: 0 });
    fireEvent.mouseMove(canvas, { ...at(0, 0), buttons: 1 });
    fireEvent.mouseUp(canvas, at(0, 0));
    await act(async () => {});
    expect(s.beginStroke).not.toHaveBeenCalled();
    expect(s.applyPaint).not.toHaveBeenCalled();
    expect(s.endStroke).not.toHaveBeenCalled();
  });
});
