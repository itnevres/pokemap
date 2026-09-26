import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  GbcWorldCanvas,
  zoomWorldAboutPivot,
  initialFitBounds,
  fitAllBounds,
  conflictTooltipText,
  shouldUseLod,
  jumpFit,
  GBC_LOD_ZOOM_THRESHOLD,
  type GbcWorldView,
  type GbcWorldCanvasProps,
} from "../../src/gbc/GbcWorldCanvas.js";
import { computeFit } from "../../src/components/WorldCanvas.js";
import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";

// ---------------------------------------------------------------------------
// Pure helpers -- no rendering involved.
// ---------------------------------------------------------------------------

describe("zoomWorldAboutPivot (pure)", () => {
  it("keeps the world-space point under the pivot fixed when zooming in", () => {
    const view: GbcWorldView = { zoom: 10, pan: { x: 0, y: 0 } };
    // pivot (100,100) at zoom 10, pan 0 is world point (10,10). Zooming by
    // 1.2x to 12: dest = pivot - world*12 = 100 - 10*12 = -20.
    expect(zoomWorldAboutPivot(view, 1.2, 100, 100)).toEqual({ zoom: 12, pan: { x: -20, y: -20 } });
  });

  it("zooms out (factor < 1) the same way", () => {
    const view: GbcWorldView = { zoom: 10, pan: { x: 0, y: 0 } };
    const next = zoomWorldAboutPivot(view, 1 / 1.2, 100, 100);
    expect(next.zoom).toBeCloseTo(10 / 1.2, 10);
  });

  it("clamps to the given bounds (default GBC_ZOOM_BOUNDS: 1/64..32)", () => {
    const view: GbcWorldView = { zoom: 30, pan: { x: 0, y: 0 } };
    expect(zoomWorldAboutPivot(view, 2, 0, 0).zoom).toBe(32);
    const tiny: GbcWorldView = { zoom: 1 / 64, pan: { x: 0, y: 0 } };
    expect(zoomWorldAboutPivot(tiny, 0.5, 0, 0).zoom).toBe(1 / 64);
  });

  it("returns the SAME view object (reference equality) when the clamped zoom doesn't change", () => {
    const view: GbcWorldView = { zoom: 32, pan: { x: 5, y: 5 } };
    expect(zoomWorldAboutPivot(view, 2, 999, 999)).toBe(view); // already at max
  });

  it("applies the transform exactly ONCE from a non-zero pan (the StrictMode-sensitive case)", () => {
    // Mirrors GbcMapCanvas.test.tsx's own zoomAboutPivot regression case:
    // a nested setState-inside-a-setState-updater bug would apply this
    // transform twice, landing far from the single-application answer.
    const view: GbcWorldView = { zoom: 5, pan: { x: -14, y: -6 } };
    const next = zoomWorldAboutPivot(view, 2, 370, 345.5);
    expect(next.zoom).toBe(10);
    const cx = (370 - -14) / 5;
    const cy = (345.5 - -6) / 5;
    expect(next.pan).toEqual({ x: 370 - cx * 10, y: 345.5 - cy * 10 });
  });
});

describe("initialFitBounds (pure)", () => {
  it("unions only the multi-map components' bounds, excluding a far-away 1-map interior", () => {
    const world = {
      components: [
        { index: 0, maps: ["MapA", "MapB"], bounds: { x: 0, y: 0, width: 20, height: 10 } },
        { index: 1, maps: ["Interior"], bounds: { x: 1000, y: 1000, width: 5, height: 5 } },
      ],
    };
    expect(initialFitBounds(world)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  it("unions bounds across MULTIPLE multi-map components", () => {
    const world = {
      components: [
        { index: 0, maps: ["A1", "A2"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
        { index: 1, maps: ["B1", "B2"], bounds: { x: 100, y: 50, width: 20, height: 20 } },
        { index: 2, maps: ["Solo"], bounds: { x: -50, y: -50, width: 3, height: 3 } },
      ],
    };
    expect(initialFitBounds(world)).toEqual({ x: 0, y: 0, width: 120, height: 70 });
  });

  it("returns null when every component is a 1-map singleton", () => {
    const world = { components: [{ index: 0, maps: ["Solo"], bounds: { x: 0, y: 0, width: 5, height: 5 } }] };
    expect(initialFitBounds(world)).toBeNull();
  });

  it("returns null for an empty world", () => {
    expect(initialFitBounds({ components: [] })).toBeNull();
  });
});

describe("fitAllBounds (pure)", () => {
  it("unions every placement, including 1-map interiors", () => {
    const placements = {
      MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0 },
      Interior: { map: "Interior", x: 1000, y: 1000, width: 5, height: 5, component: 1 },
    };
    expect(fitAllBounds(placements)).toEqual({ x: 0, y: 0, width: 1005, height: 1005 });
  });

  it("skips a zero-size (orphan) placement", () => {
    const placements = {
      MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0 },
      Orphan: { map: "Orphan", x: 500, y: 500, width: 0, height: 0, component: -1 },
    };
    expect(fitAllBounds(placements)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("returns null for an empty placements map", () => {
    expect(fitAllBounds({})).toBeNull();
  });
});

describe("conflictTooltipText (pure)", () => {
  it("matches the CLI's noteLines wording exactly, for the real Route17 fixture (re-measured against the live corpus)", () => {
    const conflict = { map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } };
    expect(conflictTooltipText(conflict)).toBe("Route17 placed via Route16; Route18 disagrees by (0,1)");
  });

  it("the real Route18 fixture (re-measured against the live corpus)", () => {
    const conflict = { map: "Route18", viaA: { from: "Route17", x: 40, y: 87 }, viaB: { from: "FuchsiaCity", x: 40, y: 88 } };
    expect(conflictTooltipText(conflict)).toBe("Route18 placed via FuchsiaCity; Route17 disagrees by (0,-1)");
  });

  it("dx/dy is viaA - viaB, not the reverse (mutation check #3)", () => {
    const conflict = { map: "M", viaA: { from: "A", x: 10, y: 20 }, viaB: { from: "B", x: 5, y: 25 } };
    expect(conflictTooltipText(conflict)).toBe("M placed via B; A disagrees by (5,-5)");
  });
});

describe("shouldUseLod (pure)", () => {
  it("is 8 (32 native px/block * 0.25), not GBA's 4", () => {
    expect(GBC_LOD_ZOOM_THRESHOLD).toBe(8);
  });

  it("true strictly below the threshold, false at and above it", () => {
    expect(shouldUseLod(7.99)).toBe(true);
    expect(shouldUseLod(8)).toBe(false);
    expect(shouldUseLod(8.01)).toBe(false);
  });

  it("discriminates against an LOD threshold of 4 (mutation check #5): true between 4 and 8, where a threshold of 4 would wrongly say false", () => {
    expect(shouldUseLod(6)).toBe(true);
  });
});

describe("jumpFit (pure)", () => {
  it("fills about 60% of the viewport (not the full 100% computeFit alone would give)", () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    const viewport = { w: 100, h: 100 };
    const full = computeFit(bounds, viewport, { min: 1 / 64, max: 32 });
    expect(full.zoom).toBe(10); // fits entirely at zoom 10
    const jump = jumpFit(bounds, viewport);
    expect(jump.zoom).toBeCloseTo(6, 10); // 60% of 10
    // Still centred at the smaller zoom.
    expect(jump.pan).toEqual({ x: (100 - 10 * 6) / 2, y: (100 - 10 * 6) / 2 });
  });

  it("respects a custom fraction and zoomBounds", () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    const viewport = { w: 100, h: 100 };
    const jump = jumpFit(bounds, viewport, { min: 1 / 64, max: 32 }, 0.5);
    expect(jump.zoom).toBeCloseTo(5, 10);
  });
});

// ---------------------------------------------------------------------------
// Component tests.
// ---------------------------------------------------------------------------

class FakeImage {
  static instances: FakeImage[] = [];
  private _src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
  }
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
  }
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
  fire() {
    this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

interface FakeCtx {
  imageSmoothingEnabled: boolean;
  drawImage: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillStyle: string;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
}
const ctxByCanvas = new Map<HTMLCanvasElement, FakeCtx>();
function makeFakeCtx(): FakeCtx {
  return {
    imageSmoothingEnabled: true,
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: "",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  };
}

const VIEWPORT_SIZE = 200;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

// One 2-map landmass (MapA/MapB) plus a far-away 1-map interior -- exactly
// the shape the spec's own initialFitBounds fixture calls for. No
// conflicts here; the conflict badge/tooltip tests use their own fixture
// below (real Route16/17/18-shaped names, per the spec's exact-string test).
const WORLD: GbcWorldPayload = {
  family: "gbc",
  blockPx: 32,
  placements: {
    MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0 },
    MapB: { map: "MapB", x: 10, y: 0, width: 10, height: 10, component: 0 },
    Interior: { map: "Interior", x: 1000, y: 1000, width: 5, height: 5, component: 1 },
  },
  components: [
    { index: 0, maps: ["MapA", "MapB"], bounds: { x: 0, y: 0, width: 20, height: 10 } },
    { index: 1, maps: ["Interior"], bounds: { x: 1000, y: 1000, width: 5, height: 5 } },
  ],
  conflicts: [],
};

const CONFLICT_WORLD: GbcWorldPayload = {
  family: "gbc",
  blockPx: 32,
  placements: {
    Route17: { map: "Route17", x: 0, y: 0, width: 30, height: 40, component: 0 },
  },
  components: [{ index: 0, maps: ["Route17", "Route16", "Route18"], bounds: { x: 0, y: 0, width: 30, height: 40 } }],
  conflicts: [{ map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 } }],
};

function mockFetchWorld(world: unknown) {
  return vi.fn((url: string) => {
    if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

beforeEach(() => {
  FakeImage.instances = [];
  FakeResizeObserver.instances = [];
  vi.stubGlobal("Image", FakeImage);
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

  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: VIEWPORT_SIZE, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: VIEWPORT_SIZE, configurable: true });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  ctxByCanvas.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderWorld(props: Partial<GbcWorldCanvasProps> = {}, world: unknown = WORLD) {
  vi.stubGlobal("fetch", mockFetchWorld(world));
  const utils = render(<GbcWorldCanvas time="day" {...props} />);
  const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
  return { ...utils, canvas };
}

/** Waits for the world to have loaded AND the initial fit to have run --
 *  the status strip's own component count is a reliable readiness signal
 *  (it never changes after the fetch resolves, unlike zoom%, which starts
 *  at the pre-fit default and would make a naive "wait for any zoom%"
 *  check resolve too early -- see GbcApp.test.tsx's own comment on this
 *  exact trap). */
async function mountReady(props: Partial<GbcWorldCanvasProps> = {}, world: GbcWorldPayload = WORLD) {
  const utils = renderWorld(props, world);
  await waitFor(() => expect(screen.getByText(new RegExp(`${world.components.length} components`))).toBeTruthy());
  const stageCtx = ctxByCanvas.get(utils.canvas)!;
  await waitFor(() => expect(stageCtx.drawImage.mock.calls.length + stageCtx.clearRect.mock.calls.length).toBeGreaterThan(0));
  return { ...utils, stageCtx };
}

describe("GbcWorldCanvas", () => {
  it("shows a loading placeholder before /api/world resolves", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {})); // never resolves
    vi.stubGlobal("fetch", fetchMock);
    render(<GbcWorldCanvas time="day" />);
    expect(screen.getByText("Loading world…")).toBeTruthy();
  });

  it("shows a visible error when /api/world fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)));
    render(<GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByText(/Could not load the world/)).toBeTruthy());
  });

  it("status strip shows components/maps/zoom%, matching the real corpus's own shape ('326 components · 391 maps · zoom N%')", async () => {
    await mountReady();
    // 2 components (the 2-map landmass + the 1-map interior), 3 placements.
    expect(screen.getByText(/2 components · 3 maps · zoom \d+%/)).toBeTruthy();
  });

  it("initial fit covers the multi-map components only -- the interior stays far outside the viewport and is never loaded", async () => {
    await mountReady();
    // computeFit({x:0,y:0,width:20,height:10}, {200,200}, {1/64,32}): zoom =
    // min(32, min(200/20, 200/10)) = min(32, 10) = 10.
    expect(screen.getByText(/zoom 31%/)).toBeTruthy(); // round(10/32*100) = 31

    // Only MapA and MapB (both inside the fit bounds) get an Image -- the
    // far-away Interior (x=1000) is culled out and never fetched.
    const srcs = FakeImage.instances.map((i) => i.src).sort();
    expect(srcs).toEqual(["/api/render/MapA.png?time=day", "/api/render/MapB.png?time=day"]);
  });

  it("Fit all fits every placement, including the far-away interior", async () => {
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "Fit all" }));

    const expectedZoom = computeFit({ x: 0, y: 0, width: 1005, height: 1005 }, { w: VIEWPORT_SIZE, h: VIEWPORT_SIZE }, { min: 1 / 64, max: 32 }).zoom;
    const expectedPercent = Math.round((expectedZoom / 32) * 100);
    await waitFor(() => expect(screen.getByText(new RegExp(`zoom ${expectedPercent}%`))).toBeTruthy());

    // At this much wider fit, the interior is now visible too.
    await waitFor(() => expect(FakeImage.instances.some((i) => i.src.startsWith("/api/render/Interior.png"))).toBe(true));
  });

  it("time change: URLs are rebuilt with the new time, and the whole image cache is dropped (mutation check #2)", async () => {
    const { rerender } = await mountReady();
    const dayUrls = FakeImage.instances.map((i) => i.src).sort();
    expect(dayUrls).toEqual(["/api/render/MapA.png?time=day", "/api/render/MapB.png?time=day"]);

    // Load both day images so the cache is populated with real (loaded)
    // entries -- proving the switch below drops REAL cache entries, not
    // just unresolved placeholders.
    for (const img of FakeImage.instances) img.onload?.();

    FakeImage.instances = [];
    rerender(<GbcWorldCanvas time="nite" />);

    // New Image objects are constructed for BOTH still-visible placements,
    // with the new time in the URL -- if the cache had NOT been dropped
    // (mutation check #2), `imageCacheRef.current.has(p.map)` would still
    // be true for MapA/MapB and neither would be refetched at all.
    await waitFor(() => expect(FakeImage.instances.length).toBe(2));
    const niteUrls = FakeImage.instances.map((i) => i.src).sort();
    expect(niteUrls).toEqual(["/api/render/MapA.png?time=nite", "/api/render/MapB.png?time=nite"]);
  });

  it("culling: only placements intersecting the viewport get Image objects (Interior, far outside, gets none until Fit all)", async () => {
    await mountReady();
    expect(FakeImage.instances.length).toBe(2);
    expect(FakeImage.instances.some((i) => i.src.includes("Interior"))).toBe(false);
  });

  // -------------------------------------------------------------------
  // Conflict badges + tooltip.
  // -------------------------------------------------------------------
  describe("conflict badge", () => {
    it("draws a diamond at Conflict.map's top-right corner in --danger, and shows the exact CLI-wording tooltip on hover", async () => {
      const { canvas, stageCtx } = await mountReady({}, CONFLICT_WORLD);
      // computeFit({0,0,30,40}, {200,200}, {1/64,32}): zoom = min(32, min(200/30,200/40)) = 5.
      // pan = {-0*5+(200-150)/2, -0*5+(200-200)/2} = {25, 0}.
      await waitFor(() => expect(screen.getByText(/1 components · 1 maps · zoom 16%/)).toBeTruthy()); // round(5/32*100)=16

      // The diamond is drawn via ctx.beginPath/moveTo/lineTo x3/closePath/fill
      // (WorldCanvas.tsx's own drawDiamond) -- fill is called at least once.
      expect(stageCtx.fill).toHaveBeenCalled();

      // Badge centre: cx = 0*5+25+30*5-10 = 165, cy = 0*5+0+10 = 10.
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
      fireEvent.mouseMove(canvas, { clientX: 165, clientY: 10 });

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip.textContent).toBe("Route17 placed via Route16; Route18 disagrees by (0,1)");

      fireEvent.mouseMove(canvas, { clientX: 165, clientY: 100 }); // far from the badge
      await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    });
  });

  // -------------------------------------------------------------------
  // Hover (map), click (select), double-click (open).
  // -------------------------------------------------------------------
  it("hovering a placement shows its name, component #i (N maps), and its own size in blocks", async () => {
    const { canvas } = await mountReady();
    // Fit: zoom 10, pan {0,50}. MapA (0,0,10,10) -> screen rect [0,100]x[50,150].
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 100 });

    const status = await screen.findByText(/MapA/);
    expect(status.textContent).toBe("MapA · component #0 (2 maps) · 10×10 blocks");

    fireEvent.mouseLeave(canvas);
    expect(await screen.findByText(/Hover the world/i)).toBeTruthy();
  });

  it("click selects (onSelectMap) and draws a --overlay-selection outline; a plain click on empty space clears it", async () => {
    const onSelectMap = vi.fn();
    const { canvas } = await mountReady({ onSelectMap });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    fireEvent.click(canvas, { clientX: 50, clientY: 100 }); // inside MapA
    expect(onSelectMap).toHaveBeenCalledWith("MapA");
    await waitFor(() => expect(document.querySelector(".world-canvas__selection-outline")).toBeTruthy());

    fireEvent.click(canvas, { clientX: 5, clientY: 5 }); // empty space (well outside both placements)
    await waitFor(() => expect(document.querySelector(".world-canvas__selection-outline")).toBeNull());
  });

  it("a click that ends a real drag does not also select (browsers fire click after a same-element drag)", async () => {
    const onSelectMap = vi.fn();
    const { canvas } = await mountReady({ onSelectMap });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 40 }); // real movement while dragging
    fireEvent.mouseUp(canvas);
    fireEvent.click(canvas, { clientX: 40, clientY: 40 }); // the browser's own trailing click

    expect(onSelectMap).not.toHaveBeenCalled();
  });

  it("double-click calls onOpenMap for the hit placement", async () => {
    const onOpenMap = vi.fn();
    const { canvas } = await mountReady({ onOpenMap });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 }); // inside MapB
    expect(onOpenMap).toHaveBeenCalledWith("MapB");
  });

  it("double-click on empty space calls neither callback", async () => {
    const onOpenMap = vi.fn();
    const onSelectMap = vi.fn();
    const { canvas } = await mountReady({ onOpenMap, onSelectMap });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    fireEvent.doubleClick(canvas, { clientX: 5, clientY: 5 });
    expect(onOpenMap).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Map-list jump.
  // -------------------------------------------------------------------
  it("jump: centres jumpToMap at ~60% of the viewport and flashes an outline that fades after 2s", async () => {
    const { rerender } = await mountReady();

    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={1} />);
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());

    // computeFit({10,0,10,10}, {200,200}, bounds).zoom = min(32,20) = 20;
    // jumpFit's own 60% -> zoom 12. zoom% = round(12/32*100) = 38.
    expect(screen.getByText(/zoom 38%/)).toBeTruthy();

    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(), { timeout: 3000 });
  }, 10000);

  it("jumping to a DIFFERENT map on a later token re-jumps (not stuck on the first jumpToMap)", async () => {
    const { rerender } = await mountReady();
    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={1} />);
    await waitFor(() => expect(screen.getByText(/zoom 38%/)).toBeTruthy());

    rerender(<GbcWorldCanvas time="day" jumpToMap="MapA" jumpToken={2} />);
    // computeFit({0,0,10,10},{200,200}).zoom=20, jumpFit 60% -> 12 -> same 38%,
    // but pan differs (MapA at x=0, not MapB's x=10) -- proves the SECOND
    // token actually re-ran the jump effect, not just held the first result.
    await waitFor(() => {
      const outline = document.querySelector(".world-canvas__jump-highlight") as HTMLElement | null;
      expect(outline?.style.left).toBe("40px"); // MapA: -0*12+(200-120)/2 = 40
    });
  });

  // -------------------------------------------------------------------
  // Postmortem mechanics: StrictMode, wheel passive:false, viewport-in-blit-deps.
  // -------------------------------------------------------------------
  it("under <StrictMode>, a wheel zoom lands on the single-application pan (not a StrictMode-doubled one)", async () => {
    vi.stubGlobal("fetch", mockFetchWorld(WORLD));
    const utils = render(
      <StrictMode>
        <GbcWorldCanvas time="day" />
      </StrictMode>,
    );
    await waitFor(() => expect(utils.getByText(/2 components/)).toBeTruthy());
    const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    await waitFor(() => expect(screen.getByText(/zoom 31%/)).toBeTruthy()); // fit: zoom 10

    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 }); // zoom in: 10 * 1.2 = 12
    // round(12/32*100) = 38 -- if StrictMode had double-applied the update
    // (the class of bug GbcMapCanvas's own fix round found), the result
    // would either double the pan at the SAME 12 zoom (still 38%, but off
    // screen) or, if the whole updater ran twice compounding the factor,
    // land at 10*1.2*1.2=14.4 -> 45%. Either way this pins the single,
    // correct 38%.
    await waitFor(() => expect(screen.getByText(/zoom 38%/)).toBeTruthy());
  });

  it("the wheel listener is registered with { passive: false }", async () => {
    const { canvas } = await mountReady();
    const addSpy = vi.spyOn(canvas, "addEventListener");
    fireEvent.wheel(canvas, { clientX: 0, clientY: 0, deltaY: -1 });
    expect(addSpy).not.toHaveBeenCalled(); // already attached on mount, not re-attached per wheel
    // Re-mount to observe the actual attach call.
    addSpy.mockRestore();
    const spy2 = vi.fn();
    const originalAdd = HTMLCanvasElement.prototype.addEventListener;
    HTMLCanvasElement.prototype.addEventListener = function (this: HTMLCanvasElement, ...args: Parameters<typeof originalAdd>) {
      spy2(...args);
      return originalAdd.apply(this, args);
    };
    try {
      await mountReady();
      expect(spy2).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    } finally {
      HTMLCanvasElement.prototype.addEventListener = originalAdd;
    }
  });

  it("regression: a viewport resize redraws the canvas (viewport stays in the blit effect's own deps -- the Task 21 postmortem)", async () => {
    const { stageCtx } = await mountReady();
    const drawCallsBefore = stageCtx.drawImage.mock.calls.length + stageCtx.clearRect.mock.calls.length;

    const viewportEl = document.querySelector(".world-canvas__viewport") as HTMLElement;
    Object.defineProperty(viewportEl, "clientWidth", { value: VIEWPORT_SIZE - 20, configurable: true });
    Object.defineProperty(viewportEl, "clientHeight", { value: VIEWPORT_SIZE - 20, configurable: true });
    expect(FakeResizeObserver.instances.length).toBeGreaterThan(0);
    FakeResizeObserver.instances[0]!.fire();

    const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    await waitFor(() => expect(canvas.width).toBe(VIEWPORT_SIZE - 20));
    await waitFor(() => expect(stageCtx.clearRect.mock.calls.length).toBeGreaterThan(0));
    expect(stageCtx.drawImage.mock.calls.length + stageCtx.clearRect.mock.calls.length).toBeGreaterThan(drawCallsBefore);
  });
});
