import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MapCanvas } from "../src/components/MapCanvas.js";
import type { MapLayoutData } from "../src/hooks/useMapLayout.js";

// ---------------------------------------------------------------------------
// Fixture: a tiny synthetic 2x2 layout with a 1-block border, so pixel math
// is easy to predict by hand. pixelWidth/Height = (2 + 2*1)*16 = 64;
// originX/Y = 1*16 = 16 (the border ring drawn by ?border=1).
// ---------------------------------------------------------------------------
const DATA: MapLayoutData = {
  map: {
    id: "MAP_FOO",
    name: "Foo",
    layout: "LAYOUT_FOO",
    music: "MUS_DUMMY",
    regionMapSection: "MAPSEC_NONE",
    mapType: "MAP_TYPE_TOWN",
    weather: "WEATHER_NONE",
    connections: [],
    objectEvents: [
      { graphicsId: "OBJ_EVENT_GFX_BOY", x: 0, y: 0, elevation: 3, movementType: "MOVEMENT_TYPE_NONE", movementRangeX: 1, movementRangeY: 1, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "NULL", flag: "0" },
    ],
    warpEvents: [],
    coordEvents: [],
    bgEvents: [],
  },
  layout: {
    id: "LAYOUT_FOO",
    name: "Foo_Layout",
    width: 2,
    height: 2,
    borderWidth: 1,
    borderHeight: 1,
    primaryTileset: "gTileset_General",
    secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/Foo/border.bin",
    blockdataFilepath: "data/layouts/Foo/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0x05 },
    { metatileId: 0x11, collision: 1, elevation: 3, behavior: 0x05 },
    { metatileId: 0x12, collision: 0, elevation: 0, behavior: 0x05 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0x09 },
  ],
};

const PIXEL_SIZE = 64; // (2 + 2*1) * 16
const ORIGIN = 16; // 1 * 16

// ---------------------------------------------------------------------------
// jsdom has no real canvas backend. Rather than assert on baked pixels (which
// would just be re-testing packages/core's overlay math, already covered
// there), this mock records the calls MapCanvas makes -- imageSmoothingEnabled,
// drawImage's destination rect, whether putImageData ran -- and hands real
// (correctly sized) Uint8ClampedArray buffers to getImageData so the actual
// core overlay functions execute against real memory instead of throwing.
// ---------------------------------------------------------------------------
interface FakeCtx {
  imageSmoothingEnabled: boolean;
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
}

// A plain Map, not WeakMap: the "recomposites only when a toggle is on" test
// below needs to enumerate all canvases created (stage + offscreen base) to
// find the one that isn't the stage, which a WeakMap cannot iterate.
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

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
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

  // jsdom reports 0 for every element's clientWidth/clientHeight (no real
  // layout engine). Fixing the viewport to exactly the fixture's pixel size
  // makes `fit()` deterministic: zoom 1 fits (64<=64), zoom 2 does not
  // (128>64), so the initial fit is always 1x, centred at (0,0).
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: PIXEL_SIZE, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: PIXEL_SIZE, configurable: true });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  ctxByCanvas.clear();
});

/** Mounts, loads the source image, and waits for the first composite+blit to
 *  land (proven by the stage canvas's `drawImage` having been called). */
async function mountReady() {
  const utils = render(<MapCanvas mapName="Foo" data={DATA} />);
  const img = utils.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
  fireEvent.load(img);

  const canvas = utils.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  await waitFor(() => expect(ctxByCanvas.get(canvas)?.drawImage).toHaveBeenCalled());

  const stageCtx = ctxByCanvas.get(canvas)!;
  const lastDraw = () => stageCtx.drawImage.mock.calls.at(-1)!;
  return { ...utils, img, canvas, stageCtx, lastDraw };
}

describe("MapCanvas", () => {
  it("draws nearest-neighbour (never smoothed) at every integer zoom level", async () => {
    const { stageCtx } = await mountReady();
    // The component sets this false on every blit, not just once at mount --
    // a component that set it during setup and never touched it again would
    // still pass a check that only ran before any interaction.
    expect(stageCtx.imageSmoothingEnabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(stageCtx.imageSmoothingEnabled).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(stageCtx.imageSmoothingEnabled).toBe(false));
  });

  it("draws at 1x, 2x and 4x with the destination scaled accordingly", async () => {
    const { lastDraw } = await mountReady();
    // drawImage(base, sx, sy, sw, sh, dx, dy, dw, dh) -- dw/dh are the last
    // two arguments and must equal the source size times the current zoom.
    expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 1, PIXEL_SIZE * 1]);

    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 2, PIXEL_SIZE * 2]));

    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 4, PIXEL_SIZE * 4]));
  });

  it("wheel zooms about the cursor, keeping the point under it fixed", async () => {
    const { canvas, lastDraw } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_SIZE, bottom: PIXEL_SIZE, width: PIXEL_SIZE, height: PIXEL_SIZE, x: 0, y: 0, toJSON() {} });

    // At 1x with pan (0,0), the composite-space point under cursor (48, 16)
    // is itself (48, 16). Zooming to 2x about that same screen point must
    // move the destination origin so (48,16) in composite space still lands
    // under (48,16) on screen: dx = 48 - 48*2 = -48, dy = 16 - 16*2 = -16.
    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 2, PIXEL_SIZE * 2]));
    expect(lastDraw().slice(5, 7)).toEqual([-48, -16]);

    // A crude "always centre" implementation would instead put dx/dy at
    // -(PIXEL_SIZE*2 - PIXEL_SIZE)/2 = -32 regardless of cursor position --
    // distinct from -48/-16, so this assertion tells the two apart.
    expect(lastDraw().slice(5, 7)).not.toEqual([-32, -32]);
  });

  it("drag pans by the mouse delta", async () => {
    const { canvas, lastDraw } = await mountReady();
    expect(lastDraw().slice(5, 7)).toEqual([0, 0]); // fit at 1x centres exactly, no offset

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 25, clientY: 4, button: 0 });
    await waitFor(() => expect(lastDraw().slice(5, 7)).toEqual([15, -6]));
    fireEvent.mouseUp(canvas);

    // Further movement after mouseup must not keep panning.
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });
    expect(lastDraw().slice(5, 7)).toEqual([15, -6]);
  });

  it("fit resets zoom and pan after the user has zoomed and panned", async () => {
    const { canvas, lastDraw } = await mountReady();

    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 4, PIXEL_SIZE * 4]));
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 1, PIXEL_SIZE * 1]));
    expect(lastDraw().slice(5, 7)).toEqual([0, 0]);
    expect(screen.getByRole("button", { name: "1×" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("every overlay toggle starts off, and turning one on reveals its legend", async () => {
    await mountReady();
    for (const name of ["Grid", "Collision", "Elevation", "Events"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
    expect(screen.queryByText(/legend/i, { exact: false })).toBeNull();
    expect(screen.queryByText("Collision", { selector: ".map-canvas__legend-item" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    expect(screen.getByRole("button", { name: "Collision" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Collision", { selector: ".map-canvas__legend-item" })).toBeTruthy();
    // Only the enabled overlay's legend shows, not the others.
    expect(screen.queryByText("Grid", { selector: ".map-canvas__legend-item" })).toBeNull();
  });

  it("recomposites (paints overlay pixels) only when at least one toggle is on", async () => {
    const { canvas, stageCtx } = await mountReady();
    const baseCtx = [...ctxByCanvas.values()].find((c) => c !== stageCtx)!;
    expect(baseCtx.putImageData).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    await waitFor(() => expect(baseCtx.putImageData).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Grid" })); // back off
    await waitFor(() => expect(canvas).toBeTruthy());
    expect(baseCtx.putImageData).toHaveBeenCalledTimes(1); // no repaint when nothing is on
  });

  it("hovering a block shows its metatile id (hex), collision, elevation and behaviour", async () => {
    const { canvas } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_SIZE, bottom: PIXEL_SIZE, width: PIXEL_SIZE, height: PIXEL_SIZE, x: 0, y: 0, toJSON() {} });

    // Block (1,0) -- second cell, index 1 -- sits at composite pixels
    // [ORIGIN+16, ORIGIN+32) x [ORIGIN, ORIGIN+16); (40, 20) is inside it.
    fireEvent.mouseMove(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 4 });

    const status = await screen.findByText(/collision 1/);
    expect(status.textContent).toMatch(/0x11/); // metatileId, hex
    expect(status.textContent).toMatch(/elevation 3/);
    expect(status.textContent).toMatch(/behavior 0x5/);

    // Moving off the map entirely clears it back to the empty prompt.
    fireEvent.mouseMove(canvas, { clientX: 1, clientY: 1 });
    expect(await screen.findByText(/hover the map/i)).toBeTruthy();
  });

  it("always shows layout_version and the resolved split, with no hover needed", async () => {
    await mountReady();
    expect(screen.getByText("emerald")).toBeTruthy();
    expect(screen.getByText(/metatiles 512/)).toBeTruthy();
    expect(screen.getByText(/tiles 512/)).toBeTruthy();
    expect(screen.getByText(/pals 6/)).toBeTruthy();
  });
});
