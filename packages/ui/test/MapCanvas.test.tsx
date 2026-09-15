import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { MapCanvas, type MapCanvasProps } from "../src/components/MapCanvas.js";
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

// A controllable stand-in for the real ResizeObserver, which jsdom does not
// implement at all (MapCanvas guards with `typeof ResizeObserver !==
// "undefined"` and simply skips live resize tracking without it). Stubbing
// this global lets a test fire the exact callback the component registers,
// with a chosen new size, instead of only ever exercising the one-shot
// measurement `fit()` takes at mount.
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
  vi.unstubAllGlobals();
});

/** Renders MapCanvas against the fixture DATA above, plus whatever extra
 *  props (editSession/activeTool -- Task 11) a test wants layered on. Kept
 *  synchronous and side-effect-free (no image load, no waiting for the
 *  composite/blit effects) -- mountReady below builds on it for tests that
 *  DO need a fully-rendered map; tests that only care about mouse-handler
 *  wiring (pan vs. paint) use this directly. */
function renderMapCanvas(extraProps: Partial<MapCanvasProps> = {}) {
  const utils = render(<MapCanvas mapName="Foo" data={DATA} {...extraProps} />);
  const canvas = utils.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  const img = utils.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
  return { ...utils, canvas, img };
}

/** Mounts, loads the source image, and waits for the first composite+blit to
 *  land (proven by the stage canvas's `drawImage` having been called). */
async function mountReady(extraProps: Partial<MapCanvasProps> = {}) {
  const utils = renderMapCanvas(extraProps);
  fireEvent.load(utils.img);

  await waitFor(() => expect(ctxByCanvas.get(utils.canvas)?.drawImage).toHaveBeenCalled());

  const stageCtx = ctxByCanvas.get(utils.canvas)!;
  const lastDraw = () => stageCtx.drawImage.mock.calls.at(-1)!;
  return { ...utils, stageCtx, lastDraw };
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

  it("regression: a container resize after a toggle turns the legend on does not leave the canvas blank", async () => {
    // Root cause of a real bug: turning an overlay on makes the legend row
    // appear, which is a sibling of the viewport inside the same flex
    // column -- so it shrinks `.map-canvas__viewport`'s box the instant the
    // toggle lands. That fires the ResizeObserver watching the viewport,
    // which updates `viewport` state, which changes the stage canvas's
    // width/height JSX attributes -- and setting a canvas's width or height
    // attribute clears its bitmap to fully transparent, per the HTML spec,
    // regardless of anything React or this component does. The blit effect
    // that would repaint it MUST depend on `viewport`, or nothing redraws
    // it and the map stays blank until some unrelated state change happens
    // to touch zoom/pan/compositeVersion. This is exactly that resize,
    // fired in isolation with no other state change, so only the
    // `viewport` dependency can be what rescues it.
    const { canvas, stageCtx } = await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "Collision" }));
    await waitFor(() => expect(screen.getByText("Collision", { selector: ".map-canvas__legend-item" })).toBeTruthy());

    const drawCallsBeforeResize = stageCtx.drawImage.mock.calls.length;
    expect(drawCallsBeforeResize).toBeGreaterThan(0);

    // Simulate the legend row shrinking the viewport: a smaller size on the
    // observed container, then fire the exact callback MapCanvas registered
    // -- not a synthetic DOM "resize" event, which nothing here listens for.
    const viewport = document.querySelector(".map-canvas__viewport") as HTMLElement;
    Object.defineProperty(viewport, "clientWidth", { value: PIXEL_SIZE - 8, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: PIXEL_SIZE - 8, configurable: true });
    expect(FakeResizeObserver.instances.length).toBeGreaterThan(0);
    FakeResizeObserver.instances[0]!.fire();

    // The canvas's own width/height attributes must have followed the
    // smaller viewport (proving the resize was actually observed)...
    await waitFor(() => expect(canvas.width).toBe(PIXEL_SIZE - 8));
    // ...and the stage must have been redrawn afterward, not left however
    // the attribute change cleared it. A broken version of this effect
    // (missing `viewport` in its dependency array) calls drawImage exactly
    // as many times here as before the resize -- this is the assertion
    // that tells the two apart.
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.length).toBeGreaterThan(drawCallsBeforeResize));
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

  // ---------------------------------------------------------------------
  // Task 11: painting wired into the existing pan/hover handlers via an
  // OPTIONAL editSession/activeTool prop pair.
  // ---------------------------------------------------------------------

  it("with no editSession prop, mouse-down still pans exactly as before -- zero behavior change for read-only consumers", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { canvas } = renderMapCanvas();
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with an editSession and a pencil tool active, mouse-down begins a stroke and paints the hovered block instead of panning", async () => {
    const editSession = {
      blocks: [], border: [], isDirty: false,
      beginStroke: vi.fn().mockResolvedValue(undefined),
      applyPaint: vi.fn().mockResolvedValue(undefined),
      endStroke: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(), redo: vi.fn(),
    };
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } } });
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 }); // inside block (0,0) at 1x zoom, 16px/tile, before any pan/fit has run
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled();
    expect(editSession.applyPaint).toHaveBeenCalledWith(expect.objectContaining({ tool: "pencil" }));
    // endStroke is deliberately NOT synchronous with mouseup -- it awaits
    // whatever paint is still in flight first (pendingPaintRef in the real
    // component; a live-browser-only bug this project's own review caught:
    // without the wait, a plain click's own /paint/end request can reach
    // the server BEFORE its /paint/apply, silently dropping the paint from
    // the undo stack). waitFor, not a fixed tick count, for the same
    // "don't assume a magic number of microtasks" reasoning as mousedown's
    // own flush above.
    fireEvent.mouseUp(canvas);
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
  });

  // Critical code-review fix: rect had its OWN, worse variant of the
  // pencil race above -- rectStartRef.current is only set inside
  // beginStroke().then(...), so a fast down-then-up could reach onMouseUp
  // before that callback ran; the pre-fix code read rectStartRef.current
  // synchronously, found it null, and fell into the generic "else: just
  // endStroke()" branch -- applyPaint for the rect never fired AT ALL (not
  // merely left out of undo, silently dropped with no error). A
  // controlled, manually-resolved beginStroke promise reproduces the race
  // deterministically, rather than hoping real timing cooperates.
  it("a rect stroke released before begin() resolves still paints the rect, not silently dropped -- reproduces the review-caught race", async () => {
    let resolveBegin!: () => void;
    const beginPromise = new Promise<void>((resolve) => { resolveBegin = resolve; });
    const editSession = {
      blocks: [], border: [], isDirty: false,
      beginStroke: vi.fn(() => beginPromise),
      applyPaint: vi.fn().mockResolvedValue(undefined),
      endStroke: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(), redo: vi.fn(),
    };
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "rect", stamp: { width: 1, height: 1, cells: [{ metatileId: 7 }] } } });

    // Fast down-then-up, deliberately BEFORE begin() ever resolves.
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 32, clientY: 32, button: 0 });
    // Nothing can have fired yet -- both handlers are still waiting on
    // pendingPaintRef, which is still the unresolved beginStroke() promise.
    expect(editSession.applyPaint).not.toHaveBeenCalled();
    expect(editSession.endStroke).not.toHaveBeenCalled();

    resolveBegin();
    await waitFor(() => expect(editSession.applyPaint).toHaveBeenCalledWith(expect.objectContaining({ tool: "rect" })));
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
    // Order matters, not just "both got called eventually" -- apply must
    // still land before end, exactly like the pencil race fix above.
    const applyOrder = editSession.applyPaint.mock.invocationCallOrder[0]!;
    const endOrder = editSession.endStroke.mock.invocationCallOrder[0]!;
    expect(applyOrder).toBeLessThan(endOrder);
  });

  // Important code-review fix: without mirroring onMouseUp's cleanup here,
  // a drag that leaves the canvas mid-gesture (so React's own onMouseUp
  // never fires at all) left the server-side session's stroke open
  // indefinitely -- the next stroke's begin() does not override an
  // already-open one (paintRoutes.test.ts's own stray-double-begin test),
  // so two unrelated edits would get squashed into one undo step.
  it("mouse leaving the canvas mid-stroke ends it too, mirroring mouse-up -- a drag that exits the canvas must not leave the stroke open forever", async () => {
    const editSession = {
      blocks: [], border: [], isDirty: false,
      beginStroke: vi.fn().mockResolvedValue(undefined),
      applyPaint: vi.fn().mockResolvedValue(undefined),
      endStroke: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(), redo: vi.fn(),
    };
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } } });
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled();

    fireEvent.mouseLeave(canvas); // no mouseup -- the drag left the canvas instead
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
  });

  it("mouse leaving before a rect's begin() resolves abandons the rect unpainted, but still ends the stroke rather than leaving it open", async () => {
    const editSession = {
      blocks: [], border: [], isDirty: false,
      beginStroke: vi.fn().mockResolvedValue(undefined),
      applyPaint: vi.fn().mockResolvedValue(undefined),
      endStroke: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(), redo: vi.fn(),
    };
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "rect", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } } });
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
    fireEvent.mouseLeave(canvas);
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
    expect(editSession.applyPaint).not.toHaveBeenCalled(); // abandoned, not guessed at from the exit point
  });

  it("panning still works even with an editSession present, as long as no tool is selected (activeTool null)", () => {
    const editSession = { blocks: [], border: [], isDirty: false, beginStroke: vi.fn(), applyPaint: vi.fn(), endStroke: vi.fn(), undo: vi.fn(), redo: vi.fn() };
    const { canvas } = renderMapCanvas({ editSession, activeTool: null });
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });
    fireEvent.mouseUp(canvas);
    expect(editSession.beginStroke).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Task 12: collision/elevation painting. The "collision" tool goes
  // through the SAME beginStroke().then(() => paintAt(...)) chain pencil
  // uses (Task 11's own race-safe pipeline -- pendingPaintRef, endActiveStroke)
  // rather than a new parallel code path, so it needs the same async-flush
  // treatment the pencil test above needed.
  // ---------------------------------------------------------------------

  it("with the collision tool active, mouse-down paints collision+elevation only, and forces the collision overlay visible", async () => {
    const editSession = {
      blocks: [], border: [], isDirty: false,
      beginStroke: vi.fn().mockResolvedValue(undefined),
      applyPaint: vi.fn().mockResolvedValue(undefined),
      endStroke: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(), redo: vi.fn(),
    };
    const { canvas, getByTestId } = renderMapCanvas({ editSession, activeTool: { kind: "collision", value: { collision: 1, elevation: 0 } } });
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 }); // inside block (0,0) at 1x zoom, before any pan/fit has run
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled();
    expect(editSession.applyPaint).toHaveBeenCalledWith(expect.objectContaining({
      tool: "pencil",
      stamp: { width: 1, height: 1, cells: [{ collision: 1, elevation: 0 }] },
    }));

    // Forced on even though nothing toggled "Collision" -- the manual
    // toggle button itself still reads its own state, unaffected.
    expect(getByTestId("collision-overlay").getAttribute("data-visible")).toBe("true");
    expect(screen.getByRole("button", { name: "Collision" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("switching away from the collision tool lets the manual Collision toggle govern the overlay again", () => {
    const editSession = { blocks: [], border: [], isDirty: false, beginStroke: vi.fn(), applyPaint: vi.fn(), endStroke: vi.fn(), undo: vi.fn(), redo: vi.fn() };
    const { rerender, queryByTestId } = renderMapCanvas({ editSession, activeTool: { kind: "collision", value: { collision: 0, elevation: 0 } } });
    expect(queryByTestId("collision-overlay")).toBeTruthy();

    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={editSession} activeTool={{ kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } }} />);
    expect(queryByTestId("collision-overlay")).toBeNull(); // no manual toggle on, no forcing tool active either
  });
});
