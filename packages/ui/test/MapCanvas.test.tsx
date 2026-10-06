import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { MapCanvas, type MapCanvasProps } from "../src/components/MapCanvas.js";
import { zoomAboutPivot, type MapView } from "../src/components/mapView.js";
import type { MapLayoutData } from "../src/hooks/useMapLayout.js";
import type { UseEditSessionResult } from "../src/hooks/useEditSession.js";

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
  primaryCount: 512,
  secondaryCount: 144,
};

const PIXEL_SIZE = 64; // (2 + 2*1) * 16
const ORIGIN = 16; // 1 * 16

// ---------------------------------------------------------------------------
// Task 14: shared fixtures for every editSession mock and for the event-
// selection/drag tests below. Introduced here rather than duplicated again --
// this file already had 8 near-identical inline editSession object literals
// across Tasks 11-12's own tests (one per test, copy-pasted) before this
// task; consolidated into one factory so useEditSession.ts's own shape only
// needs updating in one place per future task, not eight.
// ---------------------------------------------------------------------------

/** A fully-populated UseEditSessionResult mock, every method a plain
 *  resolved-promise vi.fn() by default -- matches this file's own established
 *  per-test override style (a test that cares about beginStroke's timing,
 *  e.g. the rect-race repro, passes its own `beginStroke` override). */
function makeEditSession(overrides: Partial<UseEditSessionResult> = {}): UseEditSessionResult {
  return {
    blocks: [], border: [], map: undefined, isDirty: false, canUndo: false, canRedo: false,
    beginStroke: vi.fn().mockResolvedValue(undefined),
    applyPaint: vi.fn().mockResolvedValue(undefined),
    endStroke: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
    markClean: vi.fn(),
    moveEvent: vi.fn().mockResolvedValue(undefined),
    addEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    applyExternalMapUpdate: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Extends DATA (above) with one object_event at block (1,1) -- inside the
 *  fixture's own 2x2 layout, so PIXEL_SIZE/ORIGIN above still describe it
 *  exactly. Only objectEvents is populated; warp/coord/bg stay empty, which
 *  is enough to exercise findEventAt's own object-first scan. */
function makeMapLayoutDataWithEvents(): MapLayoutData {
  return {
    ...DATA,
    map: {
      ...DATA.map,
      objectEvents: [
        { graphicsId: "OBJ_EVENT_GFX_BOY", x: 1, y: 1, elevation: 3, movementType: "MOVEMENT_TYPE_NONE", movementRangeX: 1, movementRangeY: 1, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "NULL", flag: "0" },
      ],
    },
  };
}

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
  // Follow-up: the base <img src> must cache-bust after a real paint, or
  // the composite effect keeps drawing the pristine pre-edit PNG forever
  // (see MapCanvas.tsx's own doc comments on `paintVersion`/`imageUrl`).
  // jsdom cannot exercise the actual reload race (that needs a real
  // browser -- see this task's own live-verify) -- these are scoped to
  // what a unit test CAN prove: the URL string itself, and that the
  // version bump/reset logic driving it behaves correctly in isolation.
  // ---------------------------------------------------------------------

  it("omits the v= cache-bust param for a read-only viewer with no editSession", () => {
    const { img } = renderMapCanvas(); // no editSession
    expect(img.src).toContain("/api/render/Foo.png?border=1");
    expect(img.src).not.toMatch(/[?&]v=/);
  });

  // Spec-review fix (issues 1+2): the version bump is now debounced and the
  // first post-mount `blocks` change is presumed to be useEditSession's own
  // reseed tick (`initialBlocks` re-syncing once useMapLayout's fetch
  // resolves for the current map -- see that hook's own doc comment) and is
  // swallowed with no bump at all, not just "the first real paint". This
  // test's shape mirrors that real timeline instead of bumping on every
  // single blocks change immediately.
  it("includes a v= cache-bust param once editSession is present; the presumed reseed tick is swallowed, and a real paint bumps exactly once after debouncing, even across rapid changes", async () => {
    const session = makeEditSession({ blocks: DATA.blocks });
    const { img, rerender } = renderMapCanvas({ editSession: session });
    const versionOf = () => new URL(img.src).searchParams.get("v");
    expect(versionOf()).toBe("0"); // present from the first render, not just after a paint

    // The FIRST blocks reference change after mount is presumed to be
    // useEditSession's own reseed tick, not a real user edit -- absorbed
    // with no bump and no debounce timer scheduled at all.
    const session2 = { ...session, blocks: [...session.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session2} />);
    // Code-review fix: reading versionOf() immediately here is NOT
    // discriminating on its own -- under debouncing, "0" is what you'd see
    // whether skipNextBumpRef actually swallowed this tick OR merely
    // scheduled a bump that hasn't fired yet (both look like "0" right
    // after the rerender). Waiting out the full debounce window here is
    // what actually proves the tick was swallowed, not just delayed --
    // reviewer confirmed this line reads "1" instead of "0" with
    // skipNextBumpRef's guard removed.
    await new Promise((r) => setTimeout(r, 300));
    expect(versionOf()).toBe("0");

    // A REAL paint (the second blocks change) schedules a bump, but not
    // immediately -- right after this rerender the version has not moved.
    const session3 = { ...session2, blocks: [...session2.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session3} />);
    expect(versionOf()).toBe("0");

    // Real wait past PAINT_VERSION_DEBOUNCE_MS -- matches this file's own
    // established convention (WorldCanvas.test.tsx's fade-timer test,
    // SpeciesSpotlight.test.tsx's debounce tests) of a real setTimeout wait
    // rather than vi.useFakeTimers(). Code-review correction: unlike those,
    // this timer IS scheduled inside the test body (by the rerender just
    // above, not by a mount-time effect that ran before fake timers could
    // be enabled), so fake timers would in fact work here -- real timers
    // are used only to match the file's convention, not because they're
    // required.
    await new Promise((r) => setTimeout(r, 300));
    const afterFirstPaint = versionOf();
    expect(afterFirstPaint).toBe("1");

    // Two rapid further changes (a drag stroke's own begin/apply/end, each
    // producing a fresh array) must coalesce into exactly ONE further bump,
    // not two -- proves the debounce timer is genuinely reset per change,
    // not just delaying each bump independently.
    const session4 = { ...session3, blocks: [...session3.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session4} />);
    const session5 = { ...session4, blocks: [...session4.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session5} />);
    await new Promise((r) => setTimeout(r, 300));
    const afterSecondPaint = versionOf();
    expect(afterSecondPaint).toBe("2");
    // Monotonically distinguishable, not just "some value" -- two
    // DIFFERENT settled paints must produce two DIFFERENT versions.
    expect(afterSecondPaint).not.toBe(afterFirstPaint);
  });

  it("switching to a different map updates imageUrl to the new map name", () => {
    const { img, rerender } = renderMapCanvas();
    expect(img.src).toContain("/api/render/Foo.png");

    rerender(<MapCanvas mapName="Bar" data={DATA} />);
    expect(img.src).toContain("/api/render/Bar.png");
    expect(img.src).not.toContain("/api/render/Foo.png");
  });

  // ---------------------------------------------------------------------
  // Spec-review fix (issue 4): both non-negotiable invariants this whole
  // mechanism exists for had zero automated coverage -- only the
  // implementer's own manual live-verify. jsdom cannot reproduce a real
  // image-load TIMING RACE, but it CAN prove the effect WIRING that both
  // invariants actually live in, using mountReady's own fireEvent.load
  // simulation. These two tests are written to fail if the guard they name
  // is ever accidentally removed -- confirmed by temporarily deleting each
  // guard and re-running (see the implementer report's fix-round notes).
  // ---------------------------------------------------------------------

  it("issue 4a: pan/zoom survives a same-map paint reload -- fails if fittedForMapRef's once-per-map guard is ever removed", async () => {
    const session = makeEditSession({ blocks: DATA.blocks });
    const { canvas, img, rerender } = await mountReady({ editSession: session });

    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "2×" }).getAttribute("aria-pressed")).toBe("true"));

    const urlBefore = img.src;

    // First post-mount blocks change: presumed reseed tick, absorbed with
    // no bump (see the v= cache-bust test above) -- included so the SECOND
    // change below is the one that actually schedules a reload, matching
    // the real app's own timeline (the natural reseed always lands before
    // a user could possibly have painted yet).
    const session2 = { ...session, blocks: [...session.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session2} />);

    // The real paint.
    const session3 = { ...session2, blocks: [...session2.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session3} />);

    // Real wait past the debounce window (see PAINT_VERSION_DEBOUNCE_MS).
    await new Promise((r) => setTimeout(r, 300));
    expect(img.src).not.toBe(urlBefore); // confirms a real reload was actually scheduled, not a no-op

    // The browser finishes loading the freshly-painted image.
    fireEvent.load(img);
    await waitFor(() => expect(ctxByCanvas.get(canvas)!.drawImage.mock.calls.length).toBeGreaterThan(0));

    // The single most likely thing to silently regress (per this task's
    // own brief): a naive "just bump imgLoaded on reload" implementation
    // re-fires the fit() effect on every reload and snaps zoom back to 1x.
    // It must not -- this assertion fails the instant fittedForMapRef's
    // `fittedForMapRef.current !== mapName` guard is removed or weakened.
    expect(screen.getByRole("button", { name: "2×" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("issue 4b: the composite effect waits for the real reload before redrawing -- fails if the imageUrl-keyed imgLoaded reset is ever removed", async () => {
    const session = makeEditSession({ blocks: DATA.blocks });
    const { img, rerender, stageCtx } = await mountReady({ editSession: session });

    const urlBefore = img.src;

    // Presumed reseed tick, absorbed -- see the tests above.
    const session2 = { ...session, blocks: [...session.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session2} />);

    // The real paint -- schedules a debounced version bump.
    const session3 = { ...session2, blocks: [...session2.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session3} />);

    await new Promise((r) => setTimeout(r, 300));
    expect(img.src).not.toBe(urlBefore); // the URL genuinely changed...

    // ...but the <img> element has not fired its OWN load event yet (no
    // `fireEvent.load` below this line yet) -- same as a real network
    // round trip still in flight. Capture the draw count right here: this
    // sanity-checks nothing unrelated snuck in a draw, though the REAL
    // teeth are in the next assertion below.
    const drawsBeforeLoad = stageCtx.drawImage.mock.calls.length;

    // THIS is the discriminating step. A broken version of the
    // imageUrl-keyed imgLoaded reset (removed, or merged back into the old
    // [mapName]-only effect) leaves imgLoaded stuck `true` the whole time
    // -- so this `load` event's own `setImgLoaded(true)` is a no-op
    // (setting state to its current value), React never re-renders from
    // it, the composite effect never re-fires, and drawImage's count would
    // stay frozen at `drawsBeforeLoad` forever. With the fix, imgLoaded was
    // reset to `false` when the URL changed, so this `load` event is a
    // genuine false->true transition that reliably re-fires the composite
    // (and therefore blit) effect.
    fireEvent.load(img);
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.length).toBeGreaterThan(drawsBeforeLoad));
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
    const editSession = makeEditSession();
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
    const editSession = makeEditSession({ beginStroke: vi.fn(() => beginPromise) });
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
    // vi.mocked(...): makeEditSession()'s own return type is the plain
    // UseEditSessionResult interface (Task 14 -- so a mock built from it
    // structurally satisfies MapCanvas's editSession prop without a second,
    // looser type also needing upkeep), which erases each vi.fn()'s own
    // concrete Mock type down to its interface signature. The underlying
    // runtime object is still a real mock either way; this just re-asserts
    // that to the type checker rather than reaching for `any`.
    const applyOrder = vi.mocked(editSession.applyPaint).mock.invocationCallOrder[0]!;
    const endOrder = vi.mocked(editSession.endStroke).mock.invocationCallOrder[0]!;
    expect(applyOrder).toBeLessThan(endOrder);
  });

  // Important code-review fix: without mirroring onMouseUp's cleanup here,
  // a drag that leaves the canvas mid-gesture (so React's own onMouseUp
  // never fires at all) left the server-side session's stroke open
  // indefinitely -- the next stroke's begin() does not override an
  // already-open one (paintRoutes.test.ts's own stray-double-begin test),
  // so two unrelated edits would get squashed into one undo step.
  it("mouse leaving the canvas mid-stroke ends it too, mirroring mouse-up -- a drag that exits the canvas must not leave the stroke open forever", async () => {
    const editSession = makeEditSession();
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
    const editSession = makeEditSession();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "rect", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } } });
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
    fireEvent.mouseLeave(canvas);
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
    expect(editSession.applyPaint).not.toHaveBeenCalled(); // abandoned, not guessed at from the exit point
  });

  it("panning still works even with an editSession present, as long as no tool is selected (activeTool null)", () => {
    const editSession = makeEditSession();
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
    const editSession = makeEditSession();
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
    const editSession = makeEditSession();
    const { rerender, queryByTestId } = renderMapCanvas({ editSession, activeTool: { kind: "collision", value: { collision: 0, elevation: 0 } } });
    expect(queryByTestId("collision-overlay")).toBeTruthy();

    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={editSession} activeTool={{ kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 5 }] } }} />);
    expect(queryByTestId("collision-overlay")).toBeNull(); // no manual toggle on, no forcing tool active either
  });

  // Code-review fix: StampCell.metatileId became optional for the collision
  // tool's sake, which means nothing at the TYPE level stops a future
  // caller from routing a collision-only stamp through "bucket" too. A bare
  // non-null assertion on cell.metatileId there would make that a silent
  // lie at runtime; this must be a real guard that no-ops instead.
  it("bucket tool with a stamp cell that has no metatileId (a shape only the collision tool should ever produce) safely no-ops rather than crashing or sending a bogus replacement", async () => {
    const editSession = makeEditSession();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "bucket", stamp: { width: 1, height: 1, cells: [{ collision: 1, elevation: 0 }] } } });
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled(); // stroke still begins...
    expect(editSession.applyPaint).not.toHaveBeenCalled(); // ...but nothing sensible to flood-fill with, so no-op
  });

  // ---------------------------------------------------------------------
  // Task 14: on-canvas event selection and drag-to-move. None of these
  // three tests need img-load (mountReady) -- the hit-test/pan math runs
  // straight off `data.map`/pan/zoom/origin, all available before the
  // source image has ever loaded, so plain renderMapCanvas is enough (the
  // same reason the Task 11 pan/paint tests just above never call
  // mountReady either).
  // ---------------------------------------------------------------------

  it("in edit mode with events present, clicking on an event marker selects it and calls onSelectEvent", () => {
    const data = makeMapLayoutDataWithEvents(); // one object_event at block (1,1)
    const onSelectEvent = vi.fn();
    const { canvas } = renderMapCanvas({ data, editSession: makeEditSession(), activeTool: null, onSelectEvent });
    // Block (1,1)'s composite-space square is [ORIGIN+16, ORIGIN+32) x
    // [ORIGIN+16, ORIGIN+32); ORIGIN+24 = 40 sits inside it on both axes.
    fireEvent.mouseDown(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 24, button: 0 });
    fireEvent.mouseUp(canvas);
    expect(onSelectEvent).toHaveBeenCalledWith({ kind: "object", index: 0 });
  });

  it("clicking empty canvas (no marker under the cursor) calls onSelectEvent with null, deselecting", () => {
    const data = makeMapLayoutDataWithEvents();
    const onSelectEvent = vi.fn();
    const { canvas } = renderMapCanvas({ data, editSession: makeEditSession(), activeTool: null, onSelectEvent });
    fireEvent.mouseDown(canvas, { clientX: 50 * 16, clientY: 50 * 16, button: 0 }); // far outside the fixture's only event
    fireEvent.mouseUp(canvas);
    expect(onSelectEvent).toHaveBeenCalledWith(null);
  });

  it("dragging a selected event marker to a new cell calls onMoveEvent with the new x/y once, on mouseup (not on every mousemove frame)", () => {
    const data = makeMapLayoutDataWithEvents();
    const onMoveEvent = vi.fn();
    const { canvas } = renderMapCanvas({
      data, editSession: makeEditSession(), activeTool: null,
      // onSelectEvent must be present too -- it's what gates the whole
      // select/drag branch in onMouseDown (see MapCanvas.tsx's own doc
      // comment on that prop); App.tsx always wires both together in
      // practice, this test mirrors that rather than exercising a
      // combination the real app never produces.
      onSelectEvent: vi.fn(),
      selectedEventRef: { kind: "object", index: 0 }, onMoveEvent,
    });
    // Mousedown on the marker at block (1,1) starts the drag (the hit-test
    // re-derives {kind,index} itself; selectedEventRef only drives the
    // visual ring, see MapCanvas.tsx's own doc comment on that prop).
    fireEvent.mouseDown(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 24, button: 0 });
    // Drag toward block (0,0) -- composite-space (24,24) is inside its
    // square, [ORIGIN, ORIGIN+16) on both axes.
    fireEvent.mouseMove(canvas, { clientX: 24, clientY: 24 });
    expect(onMoveEvent).not.toHaveBeenCalled(); // preview only, never mid-drag
    // A real mouseup carries the cursor's actual, current position -- same
    // pattern the rect-tool race test above uses (fireEvent.mouseUp(canvas,
    // { clientX, clientY, button: 0 })) rather than an event with no
    // coordinates at all.
    fireEvent.mouseUp(canvas, { clientX: 24, clientY: 24, button: 0 });
    expect(onMoveEvent).toHaveBeenCalledWith({ kind: "object", index: 0, x: 0, y: 0 });
  });

  // ---------------------------------------------------------------------
  // Follow-up 3: dropper (click-to-pick, no stroke lifecycle) and shift
  // (drag-to-shift, rect-shaped lifecycle).
  // ---------------------------------------------------------------------

  it("dropper: clicking a cell calls onDropperPick with that cell's real metatileId/collision/elevation, and never touches the paint-stroke lifecycle", () => {
    const editSession = makeEditSession({ blocks: DATA.blocks });
    const onDropperPick = vi.fn();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "dropper" }, onDropperPick });

    // Block (1,0) -- fixture DATA's second cell, metatileId 0x11, collision
    // 1, elevation 3 (see DATA.blocks above). Composite-space (40, 20) sits
    // inside its square [ORIGIN+16, ORIGIN+32) x [ORIGIN, ORIGIN+16).
    fireEvent.mouseDown(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 4, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 4, button: 0 });

    expect(onDropperPick).toHaveBeenCalledWith({
      width: 1,
      height: 1,
      cells: [{ metatileId: 0x11, collision: 1, elevation: 3 }],
    });
    expect(editSession.beginStroke).not.toHaveBeenCalled();
    expect(editSession.applyPaint).not.toHaveBeenCalled();
    expect(editSession.endStroke).not.toHaveBeenCalled();
  });

  it("dropper: clicking off the map calls neither onDropperPick nor any paint method", () => {
    const editSession = makeEditSession({ blocks: DATA.blocks });
    const onDropperPick = vi.fn();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "dropper" }, onDropperPick });

    fireEvent.mouseDown(canvas, { clientX: 1000, clientY: 1000, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 1000, clientY: 1000, button: 0 });

    expect(onDropperPick).not.toHaveBeenCalled();
    expect(editSession.beginStroke).not.toHaveBeenCalled();
  });

  it("shift: a drag from one cell to another applies {tool:'shift', dx, dy} computed from the two cells, and beginStroke/endStroke fire around it (rect's own lifecycle)", async () => {
    const editSession = makeEditSession();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "shift" } });

    // Mousedown inside block (0,0) (composite (20,20)), mouseup inside
    // block (1,1) (composite (ORIGIN+24, ORIGIN+24) = (40,40)) -- a
    // positive-direction shift, dx=+1, dy=+1.
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled();

    fireEvent.mouseUp(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 24, button: 0 });
    await waitFor(() => expect(editSession.applyPaint).toHaveBeenCalledWith({ tool: "shift", dx: 1, dy: 1 }));
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
  });

  it("shift: a drag in the negative direction computes negative dx/dy", async () => {
    const editSession = makeEditSession();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "shift" } });

    // Mousedown inside block (1,1) (composite (40,40)), mouseup inside
    // block (0,0) (composite (20,20)) -- dx=-1, dy=-1.
    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: ORIGIN + 24, clientY: ORIGIN + 24, button: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled();

    fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 });
    await waitFor(() => expect(editSession.applyPaint).toHaveBeenCalledWith({ tool: "shift", dx: -1, dy: -1 }));
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
  });

  // Code-quality review fix: a zero-length drag (mousedown+mouseup at the
  // SAME cell -- a plain click) is a real, harmless no-op per this task's
  // own spec (shiftGrid(0,0) maps every block to itself, and the server's
  // own /paint/end diff-check means no undo entry gets pushed) -- but that
  // is a claim about the SERVER's behaviour, not a reason to special-case
  // it client-side. This pins that applyPaint IS still called with
  // dx:0/dy:0 (not silently skipped in MapCanvas itself), matching the two
  // tests above rather than asserting a new, different code path.
  it("shift: a zero-length drag (plain click, no movement) still applies {tool:'shift', dx:0, dy:0} -- not skipped client-side", async () => {
    const editSession = makeEditSession();
    const { canvas } = renderMapCanvas({ editSession, activeTool: { kind: "shift" } });

    await act(async () => {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 }); // block (0,0)
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editSession.beginStroke).toHaveBeenCalled();

    fireEvent.mouseUp(canvas, { clientX: 20, clientY: 20, button: 0 }); // same block (0,0)
    await waitFor(() => expect(editSession.applyPaint).toHaveBeenCalledWith({ tool: "shift", dx: 0, dy: 0 }));
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
  });
});

// ---------------------------------------------------------------------------
// Plan 6c B4: the encounter border in the map view (GBA)
// ---------------------------------------------------------------------------
describe("MapCanvas: Encounters overlay (Plan 6c B4)", () => {
  // Espeon's 37.5 is not derivable from its slot count; the GBA wire shape of /api/encounters/:map.
  const ENC_BODY = {
    mapName: "Foo",
    mapId: "MAP_FOO",
    methods: [
      { method: "land_mons", chances: [{ species: "SPECIES_ESPEON", percent: 37.5, minLevel: 2, maxLevel: 4, slots: [0, 1] }, { species: "SPECIES_RATTATA", percent: 12.5, minLevel: 3, maxLevel: 3, slots: [2] }] },
    ],
  };
  const GBC_BODY = { family: "gbc", sources: [] };

  function stubEncounters(body: unknown = ENC_BODY) {
    const f = vi.fn((_url: string) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    vi.stubGlobal("fetch", f);
    return f;
  }

  const withConnections = (dirs: Array<"up" | "down" | "left" | "right" | "dive" | "emerge">): MapLayoutData => ({
    ...DATA,
    map: { ...DATA.map, connections: dirs.map((direction) => ({ map: "Bar", offset: 0, direction })) },
  });

  const setViewport = (px: number) => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: px, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: px, configurable: true });
  };

  const encBtn = () => screen.getByRole("button", { name: "Encounters" });
  const stripOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".encounter-border__strip");
  const box = (el: HTMLElement) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height });

  it("the Encounters toggle is the last button of the Overlays group and starts off", async () => {
    stubEncounters();
    await mountReady();
    const group = screen.getByRole("group", { name: "Overlays" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Grid", "Collision", "Elevation", "Events", "Encounters"]);
    expect(encBtn().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(encBtn());
    expect(encBtn().getAttribute("aria-pressed")).toBe("true");
  });

  it("fetches /api/encounters/:map only after the click (none before, one after), and not again on re-toggle", async () => {
    const f = stubEncounters();
    const { container } = await mountReady();
    expect(f).not.toHaveBeenCalled();
    expect(stripOf(container)).toBeNull();

    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toBe("/api/encounters/Foo");

    fireEvent.click(encBtn());
    expect(stripOf(container)).toBeNull();
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("renders the border inside the viewport with no second toggle of its own, and the legend row says how to use it", async () => {
    stubEncounters();
    const { container } = await mountReady();
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(container.querySelector(".map-canvas__viewport .encounter-border")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Encounters" })).toHaveLength(1);
    expect(container.querySelector(".encounter-border__toggle")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("Encounters: hover or focus a sprite", { selector: ".map-canvas__legend-item" })).toBeTruthy();
  });

  it("a failed fetch shows the error as an alert in the legend row, not a silent empty border", async () => {
    stubEncounters(GBC_BODY); // a GBC-shaped payload reaching a GBA canvas
    const { container } = await mountReady();
    fireEvent.click(encBtn());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/\/api\/encounters\/Foo returned an unexpected shape/);
    expect(alert.className).toContain("map-canvas__legend-item");
    expect(stripOf(container)).toBeNull();
  });

  it("a map with no wild encounters says so in the legend row instead of promising sprites", async () => {
    stubEncounters({ mapName: "Foo", mapId: "MAP_FOO", methods: [] });
    const { container } = await mountReady();
    fireEvent.click(encBtn());
    await screen.findByText("Encounters: none on this map", { selector: ".map-canvas__legend-item" });
    expect(screen.queryByText("Encounters: hover or focus a sprite")).toBeNull();
    expect(stripOf(container)).toBeNull();
  });

  it("resets to off when the map changes", async () => {
    stubEncounters();
    const { rerender } = await mountReady();
    fireEvent.click(encBtn());
    expect(encBtn().getAttribute("aria-pressed")).toBe("true");
    rerender(<MapCanvas mapName="Bar" data={DATA} />);
    await waitFor(() => expect(encBtn().getAttribute("aria-pressed")).toBe("false"));
  });

  it("a map switch is off in the very first render: no fetch for the new map and its toggle reads off", async () => {
    const f = stubEncounters();
    const { rerender } = await mountReady();
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(f).toHaveBeenCalledTimes(1);
    rerender(<MapCanvas mapName="Bar" data={DATA} />);
    expect(encBtn().getAttribute("aria-pressed")).toBe("false"); // synchronously, no reset effect needed
    await Promise.resolve();
    expect(f).toHaveBeenCalledTimes(1);
  });

  // GBA direction -> compass: up=north, down=south, left=west, right=east. Left blocked = west, top = north.
  it("up + down connections (north, south) leave the left side free: the strip is on the left", async () => {
    stubEncounters();
    const { container } = await mountReady({ data: withConnections(["up", "down"]) });
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(container.querySelector(".encounter-border__strip--left")).not.toBeNull();
  });

  it("left + up connections (west, north) block left and top: the strip is on the right", async () => {
    stubEncounters();
    const { container } = await mountReady({ data: withConnections(["left", "up"]) });
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(container.querySelector(".encounter-border__strip--right")).not.toBeNull();
    expect(container.querySelector(".encounter-border__strip--left")).toBeNull();
  });

  it("dive/emerge connections are not planar: they block nothing", async () => {
    stubEncounters();
    const { container } = await mountReady({ data: withConnections(["dive", "emerge"]) });
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(container.querySelector(".encounter-border__strip--left")).not.toBeNull();
  });

  // The fixture image is 64x64 native px (layout 2x2 + a 1-block border ring, 16 px blocks) and the GBA band
  // is 4 metatiles = 64 native px. After Fit with the toggle on, the content is image + one band on the side:
  //  - viewport 400, left side (up+down connections): extraW = 64.
  //      zoom 2: (64+64)*2 = 256 <= 400; zoom 4: 128*4 = 512 > 400  -> z = 2.
  //      content 256 x 128; centred: x0 = round((400-256)/2) = 72, y0 = round((400-128)/2) = 136.
  //      left side: the image is pushed right by band*z = 64*2 = 128 -> pan = (72+128, 136) = (200, 136).
  //      The image is drawn at (200,136) 128x128. EncounterBorder gets zoom 2*16 = 32 px/metatile, so
  //      bandPx = 4*32 = 128 and the left strip = (200-128, 136, 128, 128) = (72, 136, 128, 128).
  //      (A fit that ignores the band gives pan (136,136) and a strip at left 8.)
  //  - viewport 200, top side (left+right connections: west, east blocked): extraH = 64.
  //      zoom 1: 64 x (64+64) fits; zoom 2: 256 > 200 -> z = 1. Content 64 x 128;
  //      x0 = round((200-64)/2) = 68, y0 = round((200-128)/2) = 36; top: pan.y = 36 + 64 = 100 -> pan (68, 100).
  //      bandPx = 4*16 = 64; the top strip = (68, 100-64, 64, 64) = (68, 36, 64, 64).
  it.each([
    { name: "left, viewport 400", dirs: ["up", "down"] as const, vp: 400, side: "left", draw: [200, 136, 128, 128], strip: { left: "72px", top: "136px", width: "128px", height: "128px" } },
    { name: "top, viewport 200", dirs: ["left", "right"] as const, vp: 200, side: "top", draw: [68, 100, 64, 64], strip: { left: "68px", top: "36px", width: "64px", height: "64px" } },
  ])("Fit with Encounters on leaves room for the band: $name", async ({ dirs, vp, side, draw, strip }) => {
    stubEncounters();
    setViewport(vp);
    const { container, lastDraw } = await mountReady({ data: withConnections([...dirs]) });
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    await waitFor(() => expect(lastDraw().slice(5, 9)).toEqual(draw));
    const el = container.querySelector<HTMLElement>(`.encounter-border__strip--${side}`)!;
    expect(box(el)).toEqual(strip);
  });

  it("toggling Encounters on does not re-fit: the user's view is kept until Fit", async () => {
    stubEncounters();
    setViewport(400);
    const { lastDraw } = await mountReady({ data: withConnections(["up", "down"]) });
    const before = lastDraw().slice(5, 9); // zoom 4 (256 <= 400), centred (72,72)
    expect(before).toEqual([72, 72, 256, 256]);
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(lastDraw().slice(5, 9)).toEqual(before);
  });

  it("toggling Encounters on does not recomposite the overlay pixels (the border is DOM, not canvas)", async () => {
    stubEncounters();
    const { stageCtx } = await mountReady();
    const baseCtx = [...ctxByCanvas.values()].find((c) => c !== stageCtx)!;
    expect(baseCtx.putImageData).not.toHaveBeenCalled();
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(baseCtx.putImageData).not.toHaveBeenCalled();
  });

  it("with Grid already on, toggling Encounters does not recomposite either (no new putImageData)", async () => {
    stubEncounters();
    const { stageCtx } = await mountReady();
    const baseCtx = [...ctxByCanvas.values()].find((c) => c !== stageCtx)!;
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    await waitFor(() => expect(baseCtx.putImageData).toHaveBeenCalledTimes(1));
    baseCtx.putImageData.mockClear();
    fireEvent.click(encBtn());
    await screen.findByRole("button", { name: "Espeon" });
    expect(baseCtx.putImageData).not.toHaveBeenCalled();
  });
});

describe("MapCanvas under <StrictMode> (Plan 6c E1, follow-up D1)", () => {
  it("fit -> 2x -> 4x lands on the exact single-application pan, not the doubled pan a nested setState produces", async () => {
    const utils = render(
      <StrictMode>
        <MapCanvas mapName="Foo" data={DATA} />
      </StrictMode>,
    );
    const canvas = utils.container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    const img = utils.container.querySelector("img.map-canvas__source-image") as HTMLImageElement;
    fireEvent.load(img);
    await waitFor(() => expect(ctxByCanvas.get(canvas)?.drawImage).toHaveBeenCalled());
    const stageCtx = ctxByCanvas.get(canvas)!;
    const lastDraw = () => stageCtx.drawImage.mock.calls.at(-1)!;

    // Fit: viewport === pixel size exactly, so 1x, pan (0,0).
    expect(lastDraw().slice(5, 9)).toEqual([0, 0, PIXEL_SIZE, PIXEL_SIZE]);

    // pivot = canvas centre = (32, 32).
    const pivot = [canvas.width / 2, canvas.height / 2] as const;
    expect(pivot).toEqual([32, 32]);

    // 2x from pan0 (0,0): cx = (32-0)/1 = 32; pan = round(32 - 32*2) = -32 -- applied ONCE.
    fireEvent.click(utils.getByRole("button", { name: "2×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 2, PIXEL_SIZE * 2]));
    expect(lastDraw().slice(5, 7)).toEqual([-32, -32]);
    // Applied twice (the StrictMode-doubled nested setPan): cx = (32 - -32)/1 = 64, pan = 32 - 128 = -96.
    expect(lastDraw().slice(5, 7)).not.toEqual([-96, -96]);

    // 4x from (zoom 2, pan -32): cx = (32 - -32)/2 = 32; pan = round(32 - 32*4) = -96 -- applied ONCE.
    fireEvent.click(utils.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 4, PIXEL_SIZE * 4]));
    expect(lastDraw().slice(5, 7)).toEqual([-96, -96]);
    // The old nested code reached -480 here (its 2x was already the doubled -96, and 4x doubled again); doubling
    // from the correct -32 base would give -224. Neither may appear.
    expect(lastDraw().slice(5, 7)).not.toEqual([-224, -224]);
    expect(lastDraw().slice(5, 7)).not.toEqual([-480, -480]);
  });
});

describe("MapCanvas: controlled view (Plan 6c E1)", () => {
  const VIEW: MapView = { zoom: 2, pan: { x: 7, y: -3 } };

  it("renders props.view: the first draw is at its pan, size x2", async () => {
    const { lastDraw } = await mountReady({ view: VIEW, onViewChange: vi.fn() });
    expect(lastDraw().slice(5, 9)).toEqual([7, -3, PIXEL_SIZE * 2, PIXEL_SIZE * 2]);
  });

  it("a zoom button reports zoomAboutPivot(view, 4, centre) once and does not redraw until the parent passes the new view", async () => {
    const onViewChange = vi.fn();
    const { canvas, lastDraw, rerender } = await mountReady({ view: VIEW, onViewChange });
    const expected = zoomAboutPivot(VIEW, 4, canvas.width / 2, canvas.height / 2);
    expect(expected).toEqual({ zoom: 4, pan: { x: -18, y: -38 } }); // cx=(32-7)/2, cy=(32+3)/2
    const drawsBefore = ctxByCanvas.get(canvas)!.drawImage.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith(expected);
    expect(ctxByCanvas.get(canvas)!.drawImage.mock.calls.length).toBe(drawsBefore);
    expect(lastDraw().slice(5, 9)).toEqual([7, -3, PIXEL_SIZE * 2, PIXEL_SIZE * 2]);
    expect(screen.getByRole("button", { name: "2×" }).getAttribute("aria-pressed")).toBe("true");

    rerender(<MapCanvas mapName="Foo" data={DATA} view={expected} onViewChange={onViewChange} />);
    await waitFor(() => expect(lastDraw().slice(5, 9)).toEqual([-18, -38, PIXEL_SIZE * 4, PIXEL_SIZE * 4]));
  });

  it("a pan drag reports the dragged pan", async () => {
    const onViewChange = vi.fn();
    const { canvas } = await mountReady({ view: VIEW, onViewChange });
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 25, clientY: 4, button: 0 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenLastCalledWith({ zoom: 2, pan: { x: 22, y: -9 } }); // 7+15, -3-6
  });

  it("an image load never reports a view (no auto-fit): the parent owns placement", async () => {
    const onViewChange = vi.fn();
    const { lastDraw } = await mountReady({ view: VIEW, onViewChange });
    expect(onViewChange).not.toHaveBeenCalled();
    expect(lastDraw().slice(5, 9)).toEqual([7, -3, PIXEL_SIZE * 2, PIXEL_SIZE * 2]);
  });

  it("a gesture after the parent applied a new view derives from THAT view, not the mount-time one", async () => {
    const onViewChange = vi.fn();
    const { canvas, lastDraw, rerender } = await mountReady({ view: VIEW, onViewChange });
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    const at4 = onViewChange.mock.calls[0]![0] as MapView;
    rerender(<MapCanvas mapName="Foo" data={DATA} view={at4} onViewChange={onViewChange} />);
    await waitFor(() => expect(lastDraw().slice(5, 9)).toEqual([-18, -38, PIXEL_SIZE * 4, PIXEL_SIZE * 4]));

    // 4x (-18,-38) -> 2x about (32,32): cx=(32+18)/4=12.5 -> 7, cy=(32+38)/4=17.5 -> -3, i.e. back to VIEW.
    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    expect(onViewChange).toHaveBeenCalledTimes(2);
    expect(onViewChange).toHaveBeenLastCalledWith({ zoom: 2, pan: { x: 7, y: -3 } });
    expect(canvas.width / 2).toBe(32);

    // Zooming back through the same pivot lands on the same point, so also have the parent jump to an unrelated
    // view (same zoom as VIEW, different pan) and zoom again: from (-5,9)@2, 4x about (32,32) is
    // cx=(32+5)/2=18.5 -> 32-74=-42, cy=(32-9)/2=11.5 -> 32-46=-14. A base frozen at VIEW would give (-18,-38).
    const jumped: MapView = { zoom: 2, pan: { x: -5, y: 9 } };
    rerender(<MapCanvas mapName="Foo" data={DATA} view={jumped} onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    expect(onViewChange).toHaveBeenCalledTimes(3);
    expect(onViewChange).toHaveBeenLastCalledWith({ zoom: 4, pan: { x: -42, y: -14 } });
  });

  it("wheel reports through onViewChange, and after a rerender with a new view and a new callback only the new callback fires", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { canvas, rerender } = await mountReady({ view: VIEW, onViewChange: first });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_SIZE, bottom: PIXEL_SIZE, width: PIXEL_SIZE, height: PIXEL_SIZE, x: 0, y: 0, toJSON() {} });

    // zoom 2 -> 4 about (48,16): cx=(48-7)/2=20.5 -> 48-82=-34, cy=(16+3)/2=9.5 -> 16-38=-22.
    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ zoom: 4, pan: { x: -34, y: -22 } });
    expect(first).toHaveBeenCalledWith(zoomAboutPivot(VIEW, 4, 48, 16));

    // Same zoom, new pan and a NEW callback: the native listener must pick up the fresh callback and view.
    const next: MapView = { zoom: 2, pan: { x: 10, y: 10 } };
    rerender(<MapCanvas mapName="Foo" data={DATA} view={next} onViewChange={second} />);
    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(zoomAboutPivot(next, 4, 48, 16)); // cx=19, cy=3 -> (-28, 4)
    expect(zoomAboutPivot(next, 4, 48, 16).pan).toEqual({ x: -28, y: 4 });
  });

  it("the Fit button reports the fitted view", async () => {
    const onViewChange = vi.fn();
    await mountReady({ view: VIEW, onViewChange });
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith({ zoom: 1, pan: { x: 0, y: 0 } });
  });
});

describe("MapCanvas: multi-step gestures, uncontrolled (Plan 6c E1)", () => {
  it("two mousemoves in one drag land on the start pan plus the TOTAL delta (the base is the drag start, not the live pan)", async () => {
    const { canvas, lastDraw } = await mountReady();
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 25, clientY: 4, button: 0 });
    await waitFor(() => expect(lastDraw().slice(5, 7)).toEqual([15, -6]));
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 0, button: 0 });
    // start (0,0) + (30-10, 0-10) = (20,-10); an accumulating base would give (35,-16).
    await waitFor(() => expect(lastDraw().slice(5, 7)).toEqual([20, -10]));
    fireEvent.mouseUp(canvas);
  });

  it("two wheel ticks go 1x -> 2x -> 4x with exact pans (the listener sees the new zoom)", async () => {
    const { canvas, lastDraw } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_SIZE, bottom: PIXEL_SIZE, width: PIXEL_SIZE, height: PIXEL_SIZE, x: 0, y: 0, toJSON() {} });

    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 2, PIXEL_SIZE * 2]));
    expect(lastDraw().slice(5, 7)).toEqual([-48, -16]); // 48-48*2, 16-16*2

    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    await waitFor(() => expect(lastDraw().slice(-2)).toEqual([PIXEL_SIZE * 4, PIXEL_SIZE * 4]));
    // cx=(48+48)/2=48 -> 48-192=-144; cy=(16+16)/2=16 -> 16-64=-48.
    expect(lastDraw().slice(5, 7)).toEqual([-144, -48]);
  });
});

describe("MapCanvas: chromeless (Plan 6c E4)", () => {
  const VIEW: MapView = { zoom: 2, pan: { x: 7, y: -3 } };

  it("hides the toolbar and the status strip, adds the root modifier, and still draws at the controlled view", async () => {
    const { container, lastDraw } = await mountReady({ chromeless: true, view: VIEW, onViewChange: vi.fn() });
    expect(container.querySelector(".map-canvas__toolbar")).toBeNull();
    expect(container.querySelector(".map-canvas__status")).toBeNull();
    expect(screen.queryByRole("button", { name: "2×" })).toBeNull();
    expect(container.querySelector("section.map-canvas")!.classList.contains("map-canvas--chromeless")).toBe(true);
    expect(container.querySelector(".map-canvas__viewport canvas.map-canvas__stage")).not.toBeNull();
    expect(lastDraw().slice(5, 9)).toEqual([7, -3, PIXEL_SIZE * 2, PIXEL_SIZE * 2]);
  });

  it("without chromeless the toolbar, the status strip and no modifier are rendered", async () => {
    const { container } = await mountReady({ view: VIEW, onViewChange: vi.fn() });
    expect(container.querySelector(".map-canvas__toolbar")).not.toBeNull();
    expect(container.querySelector(".map-canvas__status")).not.toBeNull();
    expect(container.querySelector("section.map-canvas")!.classList.contains("map-canvas--chromeless")).toBe(false);
  });

  it("never shows the overlay legend row, so the viewport box stays the whole root box (the collision tool forces an overlay)", async () => {
    const editSession = makeEditSession();
    const { container } = await mountReady({
      chromeless: true, view: VIEW, onViewChange: vi.fn(), editSession, activeTool: { kind: "collision", value: { collision: 1, elevation: 0 } },
    });
    expect(container.querySelector(".map-canvas__legend")).toBeNull();
  });

  it("a wheel tick still reports through onViewChange", async () => {
    const onViewChange = vi.fn();
    const { canvas } = await mountReady({ chromeless: true, view: VIEW, onViewChange });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: PIXEL_SIZE, bottom: PIXEL_SIZE, width: PIXEL_SIZE, height: PIXEL_SIZE, x: 0, y: 0, toJSON() {} });
    fireEvent.wheel(canvas, { clientX: 48, clientY: 16, deltaY: -100 });
    expect(onViewChange).toHaveBeenCalledWith(zoomAboutPivot(VIEW, 4, 48, 16));
  });

  // The same race the non-chromeless rect test pins: painting must still go only through pendingPaintRef /
  // endActiveStroke / paintAt / beginStroke, so a release before begin() resolves cannot drop the paint or reorder end.
  it("a rect stroke released before begin() resolves still paints, apply before end", async () => {
    let resolveBegin!: () => void;
    const beginPromise = new Promise<void>((resolve) => { resolveBegin = resolve; });
    const editSession = makeEditSession({ beginStroke: vi.fn(() => beginPromise) });
    const { canvas } = await mountReady({
      chromeless: true, view: { zoom: 1, pan: { x: 0, y: 0 } }, onViewChange: vi.fn(), editSession,
      activeTool: { kind: "rect", stamp: { width: 1, height: 1, cells: [{ metatileId: 7 }] } },
    });
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 32, clientY: 32, button: 0 });
    expect(editSession.applyPaint).not.toHaveBeenCalled();
    expect(editSession.endStroke).not.toHaveBeenCalled();
    resolveBegin();
    await waitFor(() => expect(editSession.applyPaint).toHaveBeenCalledWith(expect.objectContaining({ tool: "rect" })));
    await waitFor(() => expect(editSession.endStroke).toHaveBeenCalled());
    expect(vi.mocked(editSession.applyPaint).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(editSession.endStroke).mock.invocationCallOrder[0]!);
  });
});
