import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { GbcMapCanvas, clientToStep, parseColorToken, formatQuadrant, zoomAboutPivot, type GbcMapCanvasProps, type GbcView } from "../../src/gbc/GbcMapCanvas.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcQuadrantInfo } from "@pokemap/core/src/gbc/render/overlays.js";

// ---------------------------------------------------------------------------
// Fixture: 2 blocks wide, 1 block tall, 1-block border ring (border=1 is
// hardcoded in GbcMapCanvas). pixelWidth = (2+2)*32 = 128, pixelHeight =
// (1+2)*32 = 96, origin = (32, 32). Block 0 (metatile 0) is all-land; block 1
// (metatile 1) is all-wall -- a real "building" cell for the hover test.
// Step (3,1) -- inside block 1 -- carries a warp, so hovering there proves
// both the collision quadrant text and the event suffix.
// ---------------------------------------------------------------------------
// Block 1's 4 quadrants each carry a DISTINCT collision value (spec review
// finding 5: the original fixture used all-wall for every quadrant, so a
// quadrant mixup -- the wrong one marked <strong>, or one quadrant's text
// appearing under another's label -- was invisible to any test): tl=WALL
// (name already says "wall", so its category is dropped), tr=BUOY (a wall
// value whose name does NOT say "wall", so the category is kept and
// bracketed), bl=WHIRLPOOL (water, +talk), br=an UNNAMED value (99, no
// collisionInfo entry -> null name -> hex fallback, land by default). Step
// (3,1) (br's own step) also carries the warp, so hovering it exercises the
// quadrant formatting AND the event suffix together.
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

  it("accounts for pan and zoom (spec review finding 10: chosen so ignoring pan gives a DIFFERENT answer)", () => {
    // At zoom 2, pan (40, 40): client (136, 136) -> local (136,136) ->
    // composite ((136-40)/2, (136-40)/2) = (48, 48) -> minus origin (32,32)
    // -> step (1, 1). Ignoring pan entirely would instead give composite
    // (136/2, 136/2) = (68, 68) -> step (2, 2) -- a genuinely different
    // result, so this test fails if `clientToStep` ever drops `pan` (the
    // original version of this test used pan (10,10)/client(50,30), which
    // happened to give (-1,-2) whether or not pan was applied, and so
    // could never have caught that mutation).
    expect(clientToStep(136, 136, { left: 0, top: 0 }, { x: 40, y: 40 }, 2, 32, 32)).toEqual({ sx: 1, sy: 1 });
  });
});

describe("zoomAboutPivot (pure)", () => {
  it("keeps the composite-space point under the pivot fixed when zooming in", () => {
    // Fit at zoom 1, pan (0,0): pivot (100, 50) is composite point (100, 50).
    // Zooming to 2x must put dest = pivot - composite*2 so (100,50) still
    // maps to the same screen pivot: 100 - 100*2 = -100, 50 - 50*2 = -50.
    const view: GbcView = { zoom: 1, pan: { x: 0, y: 0 } };
    expect(zoomAboutPivot(view, 2, 100, 50)).toEqual({ zoom: 2, pan: { x: -100, y: -50 } });
  });

  it("returns the SAME view object (reference equality) when the zoom doesn't change", () => {
    const view: GbcView = { zoom: 2, pan: { x: 5, y: 5 } };
    expect(zoomAboutPivot(view, 2, 999, 999)).toBe(view);
  });

  it("applies the transform exactly ONCE starting from a non-zero pan (the StrictMode-sensitive case)", () => {
    // Starting already zoomed/panned (as if the player had zoomed once
    // before): zoom 2, pan (-14, -6), pivot (370, 345.5) (a real
    // centerPivot() value at viewport 740x691, and the exact numbers the
    // spec review's own live probe captured live). A single pure call must
    // give the single-application answer; the pre-fix bug (a nested setPan
    // inside a setZoom updater, double-invoked by StrictMode) produced
    // (-398, -355) here by applying the whole transform twice.
    const view: GbcView = { zoom: 2, pan: { x: -14, y: -6 } };
    const next = zoomAboutPivot(view, 4, 370, 345.5);
    expect(next.zoom).toBe(4);
    const cx = (370 - -14) / 2;
    const cy = (345.5 - -6) / 2;
    expect(next.pan).toEqual({ x: Math.round(370 - cx * 4), y: Math.round(345.5 - cy * 4) });
    // Explicitly not the doubled-application result the real bug produced.
    expect(next.pan).not.toEqual({ x: -398, y: -355 });
  });
});

describe("formatQuadrant (pure)", () => {
  const q = (over: Partial<GbcQuadrantInfo>): GbcQuadrantInfo => ({ value: 0, name: null, category: "land", talk: false, ...over });

  it("drops the category when the name already says it, case-insensitively", () => {
    expect(formatQuadrant("TL", q({ name: "COLL_WALL", category: "wall" }))).toBe("TL WALL");
  });

  it("keeps the category, bracketed, when the name does NOT already say it", () => {
    expect(formatQuadrant("TL", q({ name: "COLL_BUOY", category: "wall" }))).toBe("TL BUOY (wall)");
  });

  it("never shows a category for land, even though the name never matches 'land'", () => {
    expect(formatQuadrant("TL", q({ name: "COLL_FLOOR", category: "land" }))).toBe("TL FLOOR");
  });

  it("shows water's category (distinct from wall's)", () => {
    expect(formatQuadrant("TL", q({ name: "COLL_WATER", category: "water" }))).toBe("TL WATER");
    expect(formatQuadrant("TL", q({ name: "COLL_ICE", category: "water" }))).toBe("TL ICE (water)");
  });

  it("appends +talk inside the parens alongside a kept category", () => {
    expect(formatQuadrant("TL", q({ name: "COLL_WHIRLPOOL", category: "water", talk: true }))).toBe("TL WHIRLPOOL (water, talk)");
  });

  it("appends talk even when the category itself is dropped", () => {
    expect(formatQuadrant("TL", q({ name: "COLL_WALL", category: "wall", talk: true }))).toBe("TL WALL (talk)");
  });

  it("falls back to the hex value when name is null (mutation check X12)", () => {
    expect(formatQuadrant("BR", q({ value: 200, name: null, category: "wall" }))).toBe("BR 0xc8 (wall)");
  });
});

describe("parseColorToken", () => {
  it("parses an rgba() literal, alpha scaled to 0-255", () => {
    expect(parseColorToken("rgba(220, 40, 40, 0.55)")).toEqual({ r: 220, g: 40, b: 40, a: 140 });
  });

  it("parses a plain rgb() literal (no alpha) with the fixed overlay alpha", () => {
    expect(parseColorToken("rgb(220, 40, 40)")).toEqual({ r: 220, g: 40, b: 40, a: 140 });
  });

  it("parses a 6-digit hex literal with the fixed overlay alpha", () => {
    expect(parseColorToken("#06b6d4")).toEqual({ r: 6, g: 182, b: 212, a: 140 });
  });

  it("parses a 3-digit hex shorthand, each digit doubled (spec review finding 12)", () => {
    expect(parseColorToken("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 140 });
  });

  it("parses an 8-digit hex literal, using its own trailing alpha byte as-is (spec review finding 12)", () => {
    expect(parseColorToken("#06b6d480")).toEqual({ r: 6, g: 182, b: 212, a: 0x80 });
  });

  it("falls back to an unmistakable placeholder colour (not silent transparency) for an unparsable value (spec review finding 12)", () => {
    // A broken/renamed CSS variable must never silently paint nothing --
    // opaque magenta, the same "impossible to miss" convention core's own
    // renderGbcMap uses for an out-of-range metatile.
    expect(parseColorToken("not-a-color")).toEqual({ r: 255, g: 0, b: 255, a: 140 });
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

  it("hovering each of the 4 distinct quadrants shows the right text under the right label, with the right one marked (spec review finding 5, mutation checks X8/X9/X12)", async () => {
    const { canvas } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_WIDTH, bottom: PIXEL_HEIGHT, width: PIXEL_WIDTH, height: PIXEL_HEIGHT, x: 0, y: 0, toJSON() {} });

    // Block 1 spans steps sx [2,4) x sy [0,2). +8 offsets land safely mid-cell.
    const hoverStep = async (sx: number, sy: number) => {
      fireEvent.mouseMove(canvas, { clientX: ORIGIN + sx * 16 + 8, clientY: ORIGIN + sy * 16 + 8 });
      return screen.findByText(new RegExp(`step \\(${sx}, ${sy}\\)`));
    };

    // TL (2,0): WALL, name already says "wall" -> category dropped.
    let status = await hoverStep(2, 0);
    expect(status.textContent).toContain("id 0x1");
    expect(status.textContent).toContain("TL WALL");
    expect(status.textContent).toContain("TR BUOY (wall)");
    expect(status.textContent).toContain("BL WHIRLPOOL (water, talk)");
    expect(status.textContent).toContain("BR 0x63"); // hex(99)
    expect(status.querySelector("strong")?.textContent).toBe("TL WALL");

    // TR (3,0): BUOY, name does NOT say "wall" -> category kept, bracketed.
    status = await hoverStep(3, 0);
    expect(status.querySelector("strong")?.textContent).toBe("TR BUOY (wall)");

    // BL (2,1): WHIRLPOOL, water + talk.
    status = await hoverStep(2, 1);
    expect(status.querySelector("strong")?.textContent).toBe("BL WHIRLPOOL (water, talk)");
    expect(status.textContent).not.toContain("warp"); // no event at this step

    // BR (3,1): unnamed value 99 -> hex fallback, AND this step also carries the warp.
    status = await hoverStep(3, 1);
    expect(status.querySelector("strong")?.textContent).toBe("BR 0x63");
    expect(status.textContent).toContain("warp #0 → ELMS_HOUSE");

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

  it("regression: a container resize after a toggle turns the legend on does not leave the canvas blank (spec review finding 6, ported from MapCanvas.test.tsx:317-360)", async () => {
    // Root cause (Task 21's own postmortem): turning an overlay on makes
    // the legend row appear, a sibling of the viewport in the same flex
    // column, which shrinks .map-canvas__viewport's box the instant the
    // toggle lands. That fires the ResizeObserver watching the viewport,
    // which updates `viewport` state, which changes the stage canvas's
    // width/height JSX attributes -- and setting a canvas's width/height
    // attribute clears its bitmap to fully transparent, per the HTML spec,
    // regardless of anything React does. The blit effect that repaints it
    // MUST depend on `viewport`, or nothing redraws it.
    const { canvas, stageCtx } = await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    await waitFor(() => expect(screen.getByText("Wall", { selector: ".map-canvas__legend-item" })).toBeTruthy());

    const drawCallsBeforeResize = stageCtx.drawImage.mock.calls.length;
    expect(drawCallsBeforeResize).toBeGreaterThan(0);

    const viewport = document.querySelector(".map-canvas__viewport") as HTMLElement;
    Object.defineProperty(viewport, "clientWidth", { value: PIXEL_WIDTH - 8, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: PIXEL_HEIGHT - 8, configurable: true });
    expect(FakeResizeObserver.instances.length).toBeGreaterThan(0);
    FakeResizeObserver.instances[0]!.fire();

    await waitFor(() => expect(canvas.width).toBe(PIXEL_WIDTH - 8));
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.length).toBeGreaterThan(drawCallsBeforeResize));
  });

  it("the wheel listener is registered with { passive: false } (spec review finding 11, mutation check X15)", async () => {
    const { canvas } = await mountReady();
    const addSpy = vi.spyOn(canvas, "addEventListener");
    // Re-render to re-run the effect that attaches the listener isn't
    // necessary -- the listener is already attached on mount, but the spy
    // was installed after mount, so trigger a fresh attach by toggling zoom
    // (the effect's own dependency), then assert on the attach call.
    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(addSpy).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false }));
    addSpy.mockRestore();
  });

  it("every toggle change redraws the base fresh from the pristine <img>, never compositing onto a stale overlay (spec review finding 11, mutation check X20)", async () => {
    // A mutation that only redraws the pristine image when NO overlay is on
    // (`if (!anyOverlay) { clearRect+drawImage }`) looks correct for the
    // simple "toggle one overlay off" case -- `!anyOverlay` happens to be
    // true right when it's turned off. It only breaks once a SECOND overlay
    // is added while the first stays on (anyOverlay stays true across that
    // change), so this test specifically checks the redraw-from-<img> call
    // count increases on THAT transition too, not only on toggle-off.
    const { stageCtx, img } = await mountReady();
    const baseCtx = [...ctxByCanvas.values()].find((c) => c !== stageCtx)!;
    const fromImgCallCount = () => baseCtx.drawImage.mock.calls.filter((call: unknown[]) => call[0] === img).length;

    const afterMount = fromImgCallCount();
    expect(afterMount).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    await waitFor(() => expect(fromImgCallCount()).toBeGreaterThan(afterMount));
    const afterGrid = fromImgCallCount();

    // Grid stays on; Collision also turns on -- anyOverlay is TRUE both
    // before and after this change, which is exactly the case the naive
    // `if (!anyOverlay)` guard gets wrong.
    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    await waitFor(() => expect(fromImgCallCount()).toBeGreaterThan(afterGrid));
  });
});

describe("GbcMapCanvas under <StrictMode> (spec review finding 1)", () => {
  it("1x -> 2x -> 4x lands on the exact single-application pan, not the doubled pan a nested setState would produce", async () => {
    const utils = render(
      <StrictMode>
        <GbcMapCanvas mapName="NewBarkTown" data={DATA} time="day" />
      </StrictMode>,
    );
    const canvas = utils.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    const img = utils.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
    fireEvent.load(img);
    await waitFor(() => expect(ctxByCanvas.get(canvas)?.drawImage).toHaveBeenCalled());
    const stageCtx = ctxByCanvas.get(canvas)!;
    const lastDraw = () => stageCtx.drawImage.mock.calls.at(-1)!;

    // Fit at 1x, pan (0,0) (viewport === pixel size exactly).
    expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH, PIXEL_HEIGHT]);
    expect(lastDraw().slice(5, 7)).toEqual([0, 0]);

    const pivot = [canvas.width / 2, canvas.height / 2] as const;
    fireEvent.click(utils.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 2, PIXEL_HEIGHT * 2]));
    // Single-application answer, computed the same way zoomAboutPivot's own
    // pure test does: cx = (pivot-0)/1, pan' = round(pivot - cx*2) = -pivot.
    expect(lastDraw().slice(5, 7)).toEqual([-pivot[0], -pivot[1]]);
    // The pre-fix, StrictMode-doubled bug applied this transform twice --
    // explicitly rule that out too.
    expect(lastDraw().slice(5, 7)).not.toEqual([pivot[0] - 4 * pivot[0], pivot[1] - 4 * pivot[1]]);

    fireEvent.click(utils.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_WIDTH * 4, PIXEL_HEIGHT * 4]));
    // From (zoom 2, pan -pivot) to 4x, about the SAME pivot: cx = (pivot -
    // -pivot)/2 = pivot, pan' = round(pivot - pivot*4) = -3*pivot -- and
    // critically, the destination must still land ON the canvas (not the
    // fully-off-canvas blank the doubled bug produced).
    expect(lastDraw().slice(5, 7)).toEqual([-3 * pivot[0], -3 * pivot[1]]);
  });
});
