import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { GbcMapCanvas, zoomAboutPivot, GBC_COMPOSITE_ORIGIN, type GbcMapCanvasProps, type GbcView } from "../../src/gbc/GbcMapCanvas.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

// Plan 7 Task 5b: GbcMapCanvas's controlled `view`/`onViewChange` and `chromeless` (the twins of MapCanvas's E1/E4
// props). Fixture and canvas stubs as GbcMapCanvas.test.tsx: a 2x1 map, 1-block ring -> composite 128x96, origin 32.

const DATA: GbcMapPayload = {
  family: "gbc",
  map: {
    name: "NewBarkTown", constName: "NEW_BARK_TOWN", group: 1, number: 1, width: 2, height: 1,
    blkPath: "maps/NewBarkTown.blk", tileset: "TILESET_JOHTO", environment: "ENVIRONMENT_TOWN",
    landmark: "LANDMARK_NONE", music: "MUSIC_NONE", phoneFlag: "0", palette: "PAL_MAP_TOWN",
    fishGroup: "0", border: 9, connectionFlags: "0", connections: [],
  },
  layout: { blkPath: "maps/NewBarkTown.blk", width: 2, height: 1 },
  blocks: [{ metatileId: 0 }, { metatileId: 1 }],
  metatileCount: 2,
  tileset: { constName: "TILESET_JOHTO", name: "TilesetJohto" },
  collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 50, bl: 41, br: 99 }],
  collisionInfo: {
    "0": { name: "COLL_FLOOR", category: "land", talk: false },
    "7": { name: "COLL_WALL", category: "wall", talk: false },
    "50": { name: "COLL_BUOY", category: "wall", talk: false },
    "41": { name: "COLL_WHIRLPOOL", category: "water", talk: true },
    // 99 deliberately has NO entry -- a real value with no matching COLL_*
    // name, exercising the hex fallback (mutation check X12).
  },
  events: {
    warps: [{ x: 3, y: 1, mapConst: "ELMS_HOUSE", destWarp: 1, lineIndex: 0 }],
    coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [],
  },
  defects: [],
  incomplete: [], paddingWidth: 3,
};

const PIXEL_WIDTH = 128; // (2+2)*32
const PIXEL_HEIGHT = 96; // (1+2)*32
const ORIGIN = 32;

interface FakeCtx {
  imageSmoothingEnabled: boolean;
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
}

const ctxByCanvas = new Map<HTMLCanvasElement, FakeCtx>();

function makeFakeCtx(): FakeCtx {
  return {
    imageSmoothingEnabled: true,
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    clearRect: vi.fn(),
  };
}

// A controllable stand-in for the real ResizeObserver (spec review finding
// 6: the original version of this file copied MapCanvas.test.tsx's own
// FakeResizeObserver WITHOUT the fire() hook or the regression test that
// uses it, so the Task 21 "toggling an overlay blanks the canvas" postmortem
// had no GBC-side regression test at all -- see the "viewport dropped from
// the blit deps" test below, ported from MapCanvas.test.tsx:317-360).
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire() {
    this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);

  originalGetContext = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error -- test stub, narrower than the real overload set
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== "2d") return null;
    let ctx = ctxByCanvas.get(this);
    if (!ctx) {
      ctx = makeFakeCtx();
      ctxByCanvas.set(this, ctx);
    }
    return ctx;
  };

  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: PIXEL_WIDTH, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: PIXEL_HEIGHT, configurable: true });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  ctxByCanvas.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderCanvas(extraProps: Partial<GbcMapCanvasProps> = {}) {
  const utils = render(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="day" {...extraProps} />);
  const canvas = utils.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  const img = utils.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
  return { ...utils, canvas, img };
}

async function mountReady(extraProps: Partial<GbcMapCanvasProps> = {}) {
  const utils = renderCanvas(extraProps);
  fireEvent.load(utils.img);
  await waitFor(() => expect(ctxByCanvas.get(utils.canvas)?.drawImage).toHaveBeenCalled());
  const stageCtx = ctxByCanvas.get(utils.canvas)!;
  const lastDraw = () => stageCtx.drawImage.mock.calls.at(-1)!;
  return { ...utils, stageCtx, lastDraw };
}


describe("GBC_COMPOSITE_ORIGIN", () => {
  it("is the border ring in px: one 32 px block", () => {
    expect(GBC_COMPOSITE_ORIGIN).toBe(32);
  });
});

describe("GbcMapCanvas: controlled view (Plan 7 Task 5b)", () => {
  const VIEW: GbcView = { zoom: 2, pan: { x: 7, y: -3 } };

  it("a view prop drives the draw (pan, size x2) with no internal fit, and an image load reports nothing", async () => {
    const onViewChange = vi.fn();
    const { lastDraw } = await mountReady({ view: VIEW, onViewChange });
    expect(lastDraw().slice(5, 9)).toEqual([7, -3, PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("a zoom button reports zoomAboutPivot(view, 4, centre) once and does not redraw until the parent applies it", async () => {
    const onViewChange = vi.fn();
    const { canvas, lastDraw, stageCtx, rerender } = await mountReady({ view: VIEW, onViewChange });
    const expected = zoomAboutPivot(VIEW, 4, canvas.width / 2, canvas.height / 2);
    const drawsBefore = stageCtx.drawImage.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith(expected);
    expect(stageCtx.drawImage.mock.calls.length).toBe(drawsBefore);
    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="day" view={expected} onViewChange={onViewChange} />);
    await waitFor(() => expect(lastDraw().slice(5, 9)).toEqual([expected.pan.x, expected.pan.y, PIXEL_WIDTH * 4, PIXEL_HEIGHT * 4]));
  });

  it("a wheel reports zoomAboutPivot about the cursor", async () => {
    const onViewChange = vi.fn();
    const { canvas } = await mountReady({ view: VIEW, onViewChange });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });
    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith(zoomAboutPivot(VIEW, 4, 48, 16));
  });

  it("a pan drag reports the dragged pan and keeps the zoom", async () => {
    const onViewChange = vi.fn();
    const { canvas } = await mountReady({ view: VIEW, onViewChange });
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 25, clientY: 4, button: 0 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenLastCalledWith({ zoom: 2, pan: { x: 22, y: -9 } }); // 7+15, -3-6
  });

  it("a gesture after the parent applied a new view derives from THAT view (not the mount-time one)", async () => {
    const onViewChange = vi.fn();
    const { rerender } = await mountReady({ view: VIEW, onViewChange });
    const jumped: GbcView = { zoom: 2, pan: { x: -5, y: 9 } };
    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="day" view={jumped} onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    expect(onViewChange).toHaveBeenLastCalledWith(zoomAboutPivot(jumped, 4, PIXEL_WIDTH / 2, PIXEL_HEIGHT / 2));
  });

  it("the uncontrolled default still fits on load and owns its view", async () => {
    const { lastDraw } = await mountReady();
    expect(lastDraw().slice(5, 9)).toEqual([0, 0, PIXEL_WIDTH, PIXEL_HEIGHT]);
    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]));
  });
});

describe("GbcMapCanvas: chromeless (Plan 7 Task 5b)", () => {
  it.each([false, true])("draws a cached image already loaded at mount and reentry without a load event or gesture (StrictMode=%s)", async (strict) => {
    // Browser cache may have completed the image before passive effects run. No fireEvent.load here:
    // readiness must come from the mounted image, not a future event that may never arrive.
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(PIXEL_WIDTH);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(PIXEL_HEIGHT);
    const onViewChange = vi.fn();
    const view: GbcView = { zoom: 2, pan: { x: 7, y: -3 } };
    const element = <GbcMapCanvas mapName="NewBarkTown" data={DATA} time="day" chromeless view={view} onViewChange={onViewChange} />;
    let previousStage: HTMLCanvasElement | null = null;
    for (let visit = 0; visit < 2; visit++) {
      const mounted = render(strict ? <StrictMode>{element}</StrictMode> : element);
      const stage = mounted.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
      const img = mounted.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
      expect(img.complete).toBe(true);
      expect(img.naturalWidth).toBe(PIXEL_WIDTH);
      expect(stage).not.toBe(previousStage);
      await waitFor(() => expect(ctxByCanvas.get(stage)?.drawImage.mock.calls.length ?? 0).toBeGreaterThan(0));
      const draw = ctxByCanvas.get(stage)!.drawImage.mock.calls.at(-1)!;
      const base = draw[0] as HTMLCanvasElement;
      expect(base).not.toBe(stage);
      expect(ctxByCanvas.get(base)!.drawImage).toHaveBeenCalledWith(img, 0, 0);
      expect(draw.slice(5, 9)).toEqual([7, -3, PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]);
      expect(stage.width).toBe(PIXEL_WIDTH);
      expect(stage.height).toBe(PIXEL_HEIGHT);
      expect(onViewChange).not.toHaveBeenCalled();
      previousStage = stage;
      mounted.unmount();
    }
  });

  it("does not composite an incomplete or failed image merely because it mounted", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    const { canvas } = renderCanvas({ chromeless: true, view: { zoom: 1, pan: { x: 0, y: 0 } } });
    expect(ctxByCanvas.get(canvas)?.drawImage.mock.calls.length ?? 0).toBe(0);
  });

  it.each([false, true])("rebuilds for a new image URL only when that image is ready (already cached=%s)", async (cached) => {
    let ready = true;
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(() => ready);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockImplementation(() => ready ? PIXEL_WIDTH : 0);
    const view: GbcView = { zoom: 2, pan: { x: 7, y: -3 } };
    const { canvas, img, rerender } = renderCanvas({ chromeless: true, view });
    await waitFor(() => expect(ctxByCanvas.get(canvas)?.drawImage.mock.calls.length ?? 0).toBeGreaterThan(0));
    const stageCtx = ctxByCanvas.get(canvas)!;
    const base = stageCtx.drawImage.mock.calls.at(-1)![0] as HTMLCanvasElement;
    const baseCtx = ctxByCanvas.get(base)!;
    baseCtx.drawImage.mockClear();
    stageCtx.drawImage.mockClear();
    ready = cached;
    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="nite" chromeless view={view} />);
    expect(img.getAttribute("src")).toContain("time=nite");
    if (!cached) {
      expect(baseCtx.drawImage).not.toHaveBeenCalled();
      ready = true;
      fireEvent.load(img); // Only the cold URL needs a later browser load event.
    }
    await waitFor(() => expect(baseCtx.drawImage).toHaveBeenCalledWith(img, 0, 0));
    await waitFor(() => expect(stageCtx.drawImage).toHaveBeenCalled());
    expect(stageCtx.drawImage.mock.calls.at(-1)!.slice(5, 9)).toEqual([7, -3, PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]);
  });

  it("hides the toolbar, legend and status strip, adds the root modifier, and still draws at the controlled view", async () => {
    const { container, lastDraw } = await mountReady({ chromeless: true, view: { zoom: 2, pan: { x: 7, y: -3 } }, onViewChange: vi.fn() });
    expect(container.querySelector(".map-canvas__toolbar")).toBeNull();
    expect(container.querySelector(".map-canvas__status")).toBeNull();
    expect(container.querySelector(".map-canvas__legend")).toBeNull();
    expect(container.querySelector("section.map-canvas")!.classList.contains("map-canvas--chromeless")).toBe(true);
    expect(container.querySelector("canvas.map-canvas__stage")).not.toBeNull();
    expect(lastDraw().slice(5, 9)).toEqual([7, -3, PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]);
  });

  it("without chromeless the toolbar and status strip render and there is no modifier", async () => {
    const { container } = await mountReady();
    expect(container.querySelector(".map-canvas__toolbar")).not.toBeNull();
    expect(container.querySelector(".map-canvas__status")).not.toBeNull();
    expect(container.querySelector("section.map-canvas")!.classList.contains("map-canvas--chromeless")).toBe(false);
  });
});
