import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { GbcMapCanvas } from "../../src/gbc/GbcMapCanvas.js";
import type { UseGbcEditSessionResult } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import { useStrokeChainRegistry } from "../../src/shared/useStrokeChain.js";

const { fitCalls } = vi.hoisted(() => ({ fitCalls: vi.fn() }));
vi.mock("../../src/canvas/useStage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/canvas/useStage.js")>();
  const { useCallback } = await import("react");
  return { ...actual, useStage: (...args: Parameters<typeof actual.useStage>) => {
    const stage = actual.useStage(...args);
    const fit = useCallback(() => { fitCalls(); stage.fit(); }, [stage.fit]);
    return { ...stage, fit };
  } };
});

const NO_EVENTS: GbcMapEvents = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };

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

const contexts = new Map<HTMLCanvasElement, ReturnType<typeof makeContext>>();
function makeContext() {
  return { imageSmoothingEnabled: false, drawImage: vi.fn(), clearRect: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height })),
    putImageData: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() };
}
beforeEach(() => {
  fitCalls.mockClear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(160);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(128);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
  // Narrow 2d-only stub; each canvas retains its own draw history.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, makeContext());
    return contexts.get(this)! as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => { cleanup(); contexts.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Bounded flushing lets premature registry settlement become observable without a timer or waitFor probe.
async function flushMicrotasks() {
  await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
}

describe("GbcMapCanvas on MapSurface", () => {
  it("keeps the panned view and never refits when the new time image loads", async () => {
    const { container, rerender } = render(<GbcMapCanvas mapName="M" data={DATA} time="day" />);
    const canvas = container.querySelector("canvas")!;
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    await flushMicrotasks();
    expect(fitCalls).toHaveBeenCalledTimes(1);
    const ctx = contexts.get(canvas)!;
    const fitted = ctx.drawImage.mock.calls.at(-1)!;
    fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 37, clientY: 1 });
    fireEvent.mouseUp(canvas, { button: 0, clientX: 37, clientY: 1 });
    const panned = ctx.drawImage.mock.calls.at(-1)!.slice(5, 9);
    expect(panned).toEqual([fitted[5] + 27, fitted[6] - 9, fitted[7], fitted[8]]);
    ctx.drawImage.mockClear();
    rerender(<GbcMapCanvas mapName="M" data={DATA} time="nite" />);
    expect(img.getAttribute("src")).toContain("time=nite");
    fireEvent.load(img);
    await flushMicrotasks();
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.drawImage.mock.calls.at(-1)!.slice(5, 9)).toEqual(panned);
    expect(fitCalls).toHaveBeenCalledTimes(1);
  });

  it("registers the real stroke chain so shell settlement waits for deferred apply and end", async () => {
    let resolveApply!: () => void;
    const apply = new Promise<void>((resolve) => { resolveApply = resolve; });
    let resolveEnd!: () => void;
    const end = new Promise<void>((resolve) => { resolveEnd = resolve; });
    const done = vi.fn(() => Promise.resolve());
    const session: UseGbcEditSessionResult = {
      blocks: BLOCKS, events: NO_EVENTS, isDirty: false, canUndo: false, canRedo: false,
      beginStroke: vi.fn(() => Promise.resolve()), applyPaint: vi.fn(() => apply), endStroke: vi.fn(() => end),
      undo: done, redo: done, discard: done, markClean: vi.fn(), moveEvent: done, addEvent: done,
      deleteEvent: vi.fn(() => Promise.resolve({ warpRenumberWarnings: [] })),
    };
    let strokeSettled!: () => Promise<void>;
    function Host() {
      const registry = useStrokeChainRegistry();
      strokeSettled = registry.strokeSettled;
      return <GbcMapCanvas mapName="M" data={DATA} time="day" editSession={session}
        activeTool={{ kind: "pencil", stamp: STAMP }} onStrokeChain={registry.onStrokeChain} />;
    }
    const { container } = render(<Host />);
    const canvas = container.querySelector("canvas")!;
    fireEvent.mouseDown(canvas, { button: 0, clientX: 72, clientY: 72 });
    fireEvent.mouseUp(canvas, { button: 0, clientX: 72, clientY: 72 });
    let settled = false;
    const settlement = strokeSettled().then(() => { settled = true; });
    try {
      await flushMicrotasks();
      expect(session.beginStroke).toHaveBeenCalledTimes(1);
      expect(session.applyPaint).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
      expect(session.endStroke).not.toHaveBeenCalled();
      resolveApply();
      await flushMicrotasks();
      expect(session.endStroke).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
      resolveEnd();
      await act(async () => { await settlement; });
      expect(settled).toBe(true);
    } finally {
      resolveApply();
      resolveEnd();
      await act(async () => { await settlement; });
    }
    expect(settled).toBe(true);
    expect(session.endStroke).toHaveBeenCalledTimes(1);
  });
});
