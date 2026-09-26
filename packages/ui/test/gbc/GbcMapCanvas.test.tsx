import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { GbcMapCanvas, clientToStep, parseColorToken, type GbcMapCanvasProps } from "../../src/gbc/GbcMapCanvas.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

// ---------------------------------------------------------------------------
// Fixture: 2 blocks wide, 1 block tall, 1-block border ring (border=1 is
// hardcoded in GbcMapCanvas). pixelWidth = (2+2)*32 = 128, pixelHeight =
// (1+2)*32 = 96, origin = (32, 32). Block 0 (metatile 0) is all-land; block 1
// (metatile 1) is all-wall -- a real "building" cell for the hover test.
// Step (3,1) -- inside block 1 -- carries a warp, so hovering there proves
// both the collision quadrant text and the event suffix.
// ---------------------------------------------------------------------------
const DATA: GbcMapPayload = {
  family: "gbc",
  map: {
    name: "NewBarkTown", constName: "NEW_BARK_TOWN", group: 1, number: 1, width: 2, height: 1,
    blkPath: "maps/NewBarkTown.blk", tileset: "TILESET_JOHTO", environment: "ENVIRONMENT_TOWN",
    landmark: "LANDMARK_NONE", music: "MUSIC_NONE", phoneFlag: "0", palette: "PAL_MAP_TOWN",
    fishGroup: "0", border: 9, connectionFlags: "0", connections: [],
  },
  layout: { blkPath: "maps/NewBarkTown.blk", width: 2, height: 1, writable: true },
  blocks: [{ metatileId: 0 }, { metatileId: 1 }],
  metatileCount: 2,
  tileset: { constName: "TILESET_JOHTO", name: "TilesetJohto" },
  collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
  collisionInfo: {
    "0": { name: "COLL_FLOOR", category: "land", talk: false },
    "7": { name: "COLL_WALL", category: "wall", talk: false },
  },
  events: {
    warps: [{ x: 3, y: 1, mapConst: "ELMS_HOUSE", destWarp: 1, lineIndex: 0 }],
    coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [],
  },
  defects: [],
  paddingWidth: 3,
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

describe("clientToStep (pure)", () => {
  it("maps client coordinates to a 16px step, at zoom 1 and pan 0", () => {
    // (ORIGIN+24, ORIGIN+4) -> compositeX=24 -> step 1; compositeY=4 -> step 0.
    expect(clientToStep(ORIGIN + 24, ORIGIN + 4, { left: 0, top: 0 }, { x: 0, y: 0 }, 1, ORIGIN, ORIGIN)).toEqual({ sx: 1, sy: 0 });
  });

  it("accounts for pan and zoom", () => {
    // At zoom 2, pan (10, 10): client (50, 30) -> local (40, 20) -> composite (20, 10)
    // -> minus origin (32,32) is negative -> floor gives a negative step.
    expect(clientToStep(50, 30, { left: 0, top: 0 }, { x: 10, y: 10 }, 2, 32, 32)).toEqual({ sx: -1, sy: -2 });
  });
});

describe("parseColorToken", () => {
  it("parses an rgba() literal, alpha scaled to 0-255", () => {
    expect(parseColorToken("rgba(220, 40, 40, 0.55)")).toEqual({ r: 220, g: 40, b: 40, a: 140 });
  });

  it("parses a 6-digit hex literal with the fixed overlay alpha", () => {
    expect(parseColorToken("#06b6d4")).toEqual({ r: 6, g: 182, b: 212, a: 140 });
  });

  it("falls back to fully transparent for an unparsable value", () => {
    expect(parseColorToken("not-a-color")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});

describe("GbcMapCanvas", () => {
  it("the image URL is exactly /api/render/NewBarkTown.png?border=1&time=day, then …time=nite after the prop changes", () => {
    const { img, rerender } = renderCanvas({ time: "day" });
    expect(img.getAttribute("src")).toBe("/api/render/NewBarkTown.png?border=1&time=day");

    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="nite" />);
    expect(img.getAttribute("src")).toBe("/api/render/NewBarkTown.png?border=1&time=nite");
  });

  it("mutation check: dropping time from the URL is a visible regression", () => {
    const { img, rerender } = renderCanvas({ time: "day" });
    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="nite" />);
    expect(img.getAttribute("src")).not.toBe("/api/render/NewBarkTown.png?border=1");
  });

  it("resets imgLoaded (and re-fires the composite) when only time changes", async () => {
    const { rerender, stageCtx } = await mountReady({ time: "day" });
    const before = stageCtx.drawImage.mock.calls.length;

    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="nite" />);
    const img = document.querySelector("img.map-canvas__source-image") as HTMLImageElement;
    fireEvent.load(img);
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.length).toBeGreaterThan(before));
  });

  it("draws nearest-neighbour (never smoothed)", async () => {
    const { stageCtx } = await mountReady();
    expect(stageCtx.imageSmoothingEnabled).toBe(false);
  });

  it("draws at 1x, 2x and 4x with the destination scaled accordingly", async () => {
    const { lastDraw } = await mountReady();
    expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 1, PIXEL_HEIGHT * 1]);

    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]));

    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 4, PIXEL_HEIGHT * 4]));
  });

  it("wheel zooms about the cursor with a native, passive:false listener", async () => {
    const { canvas, lastDraw } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });
    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]));
  });

  it("drag pans by the mouse delta", async () => {
    const { canvas, lastDraw } = await mountReady();
    expect(lastDraw().slice(5, 7)).toEqual([0, 0]);

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 25, clientY: 4, button: 0 });
    await waitFor(() => expect(lastDraw().slice(5, 7)).toEqual([15, -6]));
    fireEvent.mouseUp(canvas);

    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });
    expect(lastDraw().slice(5, 7)).toEqual([15, -6]);
  });

  it("Fit resets zoom and pan after zoom/pan", async () => {
    const { canvas, lastDraw } = await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 4, PIXEL_HEIGHT * 4]));
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 1, PIXEL_HEIGHT * 1]));
  });

  it("does not re-fit when only time changes (zoom/pan survive)", async () => {
    const { canvas, rerender, lastDraw } = await mountReady({ time: "day" });
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 4, PIXEL_HEIGHT * 4]));
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(canvas);
    const zoomedPan = lastDraw().slice(5, 7);

    rerender(<GbcMapCanvas mapName="NewBarkTown" data={DATA} time="nite" />);
    const img = document.querySelector("img.map-canvas__source-image") as HTMLImageElement;
    fireEvent.load(img);
    await waitFor(() => expect(ctxByCanvas.get(canvas)?.drawImage).toHaveBeenCalled());

    // Mutation check #5: a re-fit-on-time-change bug would reset this to
    // [PIXEL_WIDTH, PIXEL_HEIGHT] at zoom 1 -- it must still be the zoomed 4x size.
    expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 4, PIXEL_HEIGHT * 4]);
    expect(lastDraw().slice(5, 7)).toEqual(zoomedPan);
  });

  it("every overlay toggle starts off, and Collision reveals a Wall AND a Water legend item", async () => {
    await mountReady();
    for (const name of ["Grid", "Collision", "Events"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    expect(screen.getByText("Wall", { selector: ".map-canvas__legend-item" })).toBeTruthy();
    expect(screen.getByText("Water", { selector: ".map-canvas__legend-item" })).toBeTruthy();
  });

  it("hovering a wall block shows the id and all 4 quadrants, with the hovered one marked", async () => {
    const { canvas } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });

    // Block 1 (all-wall, metatile 1) spans composite x [ORIGIN+32, ORIGIN+64).
    // (ORIGIN+40, ORIGIN+4) is inside its TL quadrant: step (2, 0).
    fireEvent.mouseMove(canvas, { clientX: ORIGIN + 40, clientY: ORIGIN + 4 });

    const status = await screen.findByText(/step \(2, 0\)/);
    expect(status.textContent).toContain("id 0x1");
    expect(status.textContent).toContain("TL WALL wall");
    expect(status.textContent).toContain("TR WALL wall");
    expect(status.textContent).toContain("BL WALL wall");
    expect(status.textContent).toContain("BR WALL wall");
    // The hovered quadrant (tl) is wrapped in <strong>.
    const strong = status.querySelector("strong");
    expect(strong?.textContent).toBe("TL WALL wall");

    fireEvent.mouseMove(canvas, { clientX: 1, clientY: 1 });
    expect(await screen.findByText(/hover the map/i)).toBeTruthy();
  });

  it("hovering the warp step shows the event in the status strip", async () => {
    const { canvas } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });

    // Step (3,1) -> composite pixel (ORIGIN + 3*16, ORIGIN + 1*16) = (80, 48).
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 48 });

    const status = await screen.findByText(/step \(3, 1\)/);
    expect(status.textContent).toContain("warp #0 → ELMS_HOUSE");
  });

  it("always shows the tileset/metatile-count/dims status, with no hover needed", async () => {
    await mountReady();
    expect(screen.getByText(/tileset TILESET_JOHTO · 2 metatiles · 2×1/)).toBeTruthy();
  });

  it("shows 'not writable' when the layout isn't", async () => {
    await mountReady({ data: { ...DATA, layout: { ...DATA.layout, writable: false } } });
    expect(screen.getByText(/not writable/)).toBeTruthy();
  });

  it("calls hoveredMetatile with the hovered id, and null on leave", async () => {
    const hoveredMetatile = vi.fn();
    const { canvas } = await mountReady({ hoveredMetatile });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });

    fireEvent.mouseMove(canvas, { clientX: ORIGIN + 40, clientY: ORIGIN + 4 });
    await waitFor(() => expect(hoveredMetatile).toHaveBeenCalledWith(1));

    fireEvent.mouseLeave(canvas);
    expect(hoveredMetatile).toHaveBeenLastCalledWith(null);
  });

  it("renders as border note: metatile id 0 shows the map's own border id", async () => {
    const zeroData: GbcMapPayload = { ...DATA, blocks: [{ metatileId: 0 }, { metatileId: 0 }] };
    const { canvas } = await mountReady({ data: zeroData });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });

    fireEvent.mouseMove(canvas, { clientX: ORIGIN + 4, clientY: ORIGIN + 4 });
    const status = await screen.findByText(/id 0x0/);
    // Mutation check #6: dropping rendersAsBorder would omit this note entirely.
    expect(status.textContent).toContain("renders as border 0x9"); // DATA.map.border = 9
  });
});
