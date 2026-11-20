import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { GbcMapCanvas } from "../../src/gbc/GbcMapCanvas.js";
import type { UseGbcEditSessionResult } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import { useStrokeChainRegistry } from "../../src/shared/useStrokeChain.js";
import { noteTilesetVersion, resetTilesetVersion } from "../../src/shared/tilesetVersion.js";

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

// Task 10b: the render URL carries the hub's tileset version so an already-open map cannot keep a stale image.
describe("GBC map surface tileset version (Task 10b)", () => {
  afterEach(() => { resetTilesetVersion(); });

  it("keeps today's URL at version 0 and appends tv= after time on the same mounted canvas", () => {
    const { container } = render(<GbcMapCanvas mapName="M" data={DATA} time="day" />);
    const src = () => container.querySelector("img")!.getAttribute("src");

    // Version 0 keeps the border ring and the time of day, exactly as before.
    expect(src()).toBe("/api/render/M.png?border=1&time=day");

    act(() => noteTilesetVersion(5));

    // Same mounted canvas: both existing parameters survive and tv is appended last.
    expect(src()).toBe("/api/render/M.png?border=1&time=day&tv=5");
  });
});

describe("map context menu (Task 14a)", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
  });
  const view = { zoom: 1 as const, pan: { x: 0, y: 0 } };
  function stage(container: HTMLElement) {
    const canvas = container.querySelector("canvas.map-canvas__stage")! as HTMLCanvasElement;
    const { width: w, height: h } = canvas;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON() {} });
    return canvas;
  }
  function openQuadrant(canvas: HTMLCanvasElement) {
    // Origin=(32,32), zoom=1, pan=0: source=(88,56), block=floor((source-32)/32)=(1,0).
    // The bottom-right event-quadrant centre is (32+1*32+24,32+0*32+24).
    // Event cellPx=16 would yield (floor(56/16),floor(24/16))=(3,1), which is NOT the block.
    return fireEvent.contextMenu(canvas, { clientX: 88, clientY: 56, button: 2 });
  }

  it("an event-quadrant click maps to its block", () => {
    const onEditBlock = vi.fn();
    const host = render(<GbcMapCanvas mapName="M" data={DATA} time="day" view={view} onViewChange={vi.fn()} onEditBlock={onEditBlock} />);
    expect(openQuadrant(stage(host.container))).toBe(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit block" }));
    expect(onEditBlock).toHaveBeenCalledTimes(1);
    expect(onEditBlock).toHaveBeenCalledWith({ x: 1, y: 0 });
  });

  it("over an event overlay still edits its block without selecting the event", async () => {
    const object = { x: 3, y: 1, sprite: "SPRITE_TEACHER", moveData: "M", radiusX: 0, radiusY: 0,
      hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0,
      script: "S", eventFlag: "-1", lineIndex: 0 };
    const data = { ...DATA, events: { ...NO_EVENTS, objects: [object] } };
    const onEditBlock = vi.fn(), onSelectEvent = vi.fn();
    const host = render(<GbcMapCanvas mapName="M" data={data} time="day" view={view} onViewChange={vi.fn()}
      onEditBlock={onEditBlock} onSelectEvent={onSelectEvent} />);
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    fireEvent.load(host.container.querySelector("img")!);
    await flushMicrotasks();
    expect(openQuadrant(stage(host.container))).toBe(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit block" }));
    expect(onEditBlock).toHaveBeenCalledTimes(1);
    expect(onEditBlock).toHaveBeenCalledWith({ x: 1, y: 0 });
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it("zoom 4 after a pan maps to the block paint cell", () => {
    const onEditBlock = vi.fn(), onViewChange = vi.fn();
    const host = render(<GbcMapCanvas mapName="M" data={DATA} time="day"
      view={{ zoom: 4, pan: { x: -20, y: -11 } }} onViewChange={onViewChange} onEditBlock={onEditBlock} />);
    // p=(300,181): source=((300+20)/4,(181+11)/4)=(80,48), the centre of block (1,0).
    // Origin=32, cellPx=32 => (floor(48/32),floor(16/32))=(1,0).
    // With zoom 1 and the same pan, source=(320,192) => (floor(288/32),floor(160/32))=(9,5), different/outside.
    expect(fireEvent.contextMenu(stage(host.container), { clientX: 300, clientY: 181, button: 2 })).toBe(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit block" }));
    expect(onEditBlock).toHaveBeenCalledTimes(1);
    expect(onEditBlock).toHaveBeenCalledWith({ x: 1, y: 0 });
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it.each(["pencil", "select", "sign", "placing"] as const)("the right %s gesture never paints, selects, places or pans", async (mode) => {
    const done = vi.fn(() => Promise.resolve());
    const session: UseGbcEditSessionResult = {
      blocks: BLOCKS, events: NO_EVENTS, isDirty: false, canUndo: false, canRedo: false,
      beginStroke: vi.fn(() => Promise.resolve()), applyPaint: vi.fn(() => Promise.resolve()), endStroke: done,
      undo: done, redo: done, discard: done, markClean: vi.fn(), moveEvent: done, addEvent: done,
      deleteEvent: vi.fn(() => Promise.resolve({ warpRenumberWarnings: [] })),
    };
    const onSelectEvent = vi.fn(), onViewChange = vi.fn(), onSignPick = vi.fn(), onEventPick = vi.fn();
    const host = render(<GbcMapCanvas mapName="M" data={DATA} time="day" view={view} editSession={session}
      activeTool={mode === "pencil" ? { kind: "pencil", stamp: STAMP } : mode === "sign" ? { kind: "sign" } : null}
      placing={mode === "placing" ? "object" : null} onEventPick={onEventPick}
      onEditBlock={vi.fn()} onSelectEvent={onSelectEvent} onViewChange={onViewChange} onSignPick={onSignPick} />);
    const canvas = stage(host.container);
    // Origin=32, zoom=1, pan=0: p=(48,48) -> source=(48,48) -> floor((source-32)/32)=(0,0), centre.
    fireEvent.pointerDown(canvas, { clientX: 48, clientY: 48, button: 2 });
    fireEvent.mouseDown(canvas, { clientX: 48, clientY: 48, button: 2, buttons: 2 });
    // p=(80,48) -> source=(80,48) -> floor((source-32)/32)=(1,0), the next block's centre.
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 48, buttons: 2 });
    fireEvent.mouseUp(canvas, { clientX: 80, clientY: 48, button: 2 });
    expect(fireEvent.contextMenu(canvas, { clientX: 80, clientY: 48, button: 2 })).toBe(false);
    await flushMicrotasks();
    expect(session.beginStroke).not.toHaveBeenCalled();
    expect(session.applyPaint).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(onSelectEvent).not.toHaveBeenCalled();
    expect(onSignPick).not.toHaveBeenCalled();
    expect(onEventPick).not.toHaveBeenCalled();
    expect(onViewChange).not.toHaveBeenCalled();
    if (mode === "placing") expect(screen.queryByRole("menu")).toBeNull();
  });
});
