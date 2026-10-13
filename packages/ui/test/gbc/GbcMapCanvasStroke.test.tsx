import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import { GbcMapCanvas, type GbcMapCanvasProps } from "../../src/gbc/GbcMapCanvas.js";
import type { UseGbcEditSessionResult } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";

// Shared stroke chain (Plan 8 Task 1): lost mouseup (F3/M4) and a throwing error handler (M3) on the GBC canvas.
// Fixture mirrors GbcMapCanvasEdit.test.tsx: 3x2 blocks, border 1; client (40,40) -> block (0,0), (72,72) -> (1,1).
const NO_EVENTS: GbcMapEvents = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const BLOCKS = [0, 1, 2, 3, 4, 5].map((metatileId) => ({ metatileId }));
const DATA: GbcMapPayload = {
  family: "gbc",
  map: {
    name: "M", constName: "M", group: 1, number: 1, width: 3, height: 2, blkPath: "maps/M.blk", tileset: "T",
    environment: "E", landmark: "L", music: "X", phoneFlag: "0", palette: "P", fishGroup: "0", border: 1, connectionFlags: "0", connections: [],
  },
  layout: { blkPath: "maps/M.blk", width: 3, height: 2, writable: true },
  blocks: BLOCKS,
  metatileCount: 6,
  tileset: { constName: "T", name: "T" },
  collision: Array.from({ length: 6 }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 })),
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: NO_EVENTS,
  defects: [],
  paddingWidth: 3,
};
const STAMP = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
let log: string[];

function held() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function session(over: Partial<UseGbcEditSessionResult> = {}): UseGbcEditSessionResult {
  const note = (n: string) => vi.fn((..._a: unknown[]) => { log.push(n); return Promise.resolve(); });
  return {
    blocks: BLOCKS, events: NO_EVENTS, isDirty: false, canUndo: false, canRedo: false,
    beginStroke: note("begin"), applyPaint: vi.fn((b: { targets?: { x: number }[] }) => { log.push(`apply ${b.targets?.[0]?.x}`); return Promise.resolve(); }) as UseGbcEditSessionResult["applyPaint"],
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
});

function mount(props: Partial<GbcMapCanvasProps> = {}) {
  const u = render(<GbcMapCanvas mapName="M" data={DATA} time="day" {...props} />);
  const canvas = u.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  return { ...u, canvas };
}
const at = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0 });

describe("GbcMapCanvas shared stroke chain (Plan 8 Task 1)", () => {
  it("a lost mouseup: a second mousedown ends the open stroke before the new begin (two undo steps)", async () => {
    const end = held();
    const s = session({ endStroke: vi.fn(() => { log.push("end"); return end.promise; }) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP } });
    fireEvent.mouseDown(canvas, at(40, 40));
    await waitFor(() => expect(log).toEqual(["begin", "apply 0"]));
    fireEvent.mouseDown(canvas, at(72, 40)); // no mouseup in between
    await act(async () => {});
    expect(log).toEqual(["begin", "apply 0", "end"]);
    await act(async () => end.resolve());
    await waitFor(() => expect(log).toEqual(["begin", "apply 0", "end", "begin", "apply 1"]));
  });

  it("a throwing onEditError does not stop the next stroke (M3)", async () => {
    const onEditError = vi.fn(() => { throw new Error("ui broke"); });
    const s = session({ beginStroke: vi.fn().mockImplementationOnce(() => { log.push("begin"); return Promise.reject(new Error("boom")); }).mockImplementation(() => { log.push("begin"); return Promise.resolve(); }) });
    const { canvas } = mount({ editSession: s, activeTool: { kind: "pencil", stamp: STAMP }, onEditError });
    fireEvent.mouseDown(canvas, at(40, 40));
    fireEvent.mouseUp(canvas, at(40, 40));
    await waitFor(() => expect(onEditError).toHaveBeenCalledWith("boom"));
    fireEvent.mouseDown(canvas, at(72, 40));
    fireEvent.mouseUp(canvas, at(72, 40));
    await waitFor(() => expect(log).toEqual(["begin", "end", "begin", "apply 1", "end"]));
  });
});
