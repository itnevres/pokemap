import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import {
  GbcWorldCanvas,
  zoomWorldAboutPivot,
  initialFitBounds,
  fitAllBounds,
  conflictTooltipText,
  shouldUseLod,
  jumpFit,
  methodTint,
  GBC_LOD_ZOOM_THRESHOLD,
  type GbcWorldView,
  type GbcWorldCanvasProps,
} from "../../src/gbc/GbcWorldCanvas.js";
import { computeFit } from "../../src/components/WorldCanvas.js";
import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { BORDER_BAND } from "../../src/encounters/borderSide.js";

// ---------------------------------------------------------------------------
// Pure helpers -- no rendering involved.
// ---------------------------------------------------------------------------

describe("zoomWorldAboutPivot (pure)", () => {
  it("keeps the world-space point under the pivot fixed when zooming in", () => {
    const view: GbcWorldView = { zoom: 10, pan: { x: 0, y: 0 }, fitted: true };
    // pivot (100,100) at zoom 10, pan 0 is world point (10,10). Zooming by
    // 1.2x to 12: dest = pivot - world*12 = 100 - 10*12 = -20.
    expect(zoomWorldAboutPivot(view, 1.2, 100, 100)).toEqual({ zoom: 12, pan: { x: -20, y: -20 }, fitted: true });
  });

  it("zooms out (factor < 1) the same way", () => {
    const view: GbcWorldView = { zoom: 10, pan: { x: 0, y: 0 }, fitted: true };
    const next = zoomWorldAboutPivot(view, 1 / 1.2, 100, 100);
    expect(next.zoom).toBeCloseTo(10 / 1.2, 10);
  });

  it("clamps to the given bounds (default GBC_ZOOM_BOUNDS: 1/64..32)", () => {
    const view: GbcWorldView = { zoom: 30, pan: { x: 0, y: 0 }, fitted: true };
    expect(zoomWorldAboutPivot(view, 2, 0, 0).zoom).toBe(32);
    const tiny: GbcWorldView = { zoom: 1 / 64, pan: { x: 0, y: 0 }, fitted: true };
    expect(zoomWorldAboutPivot(tiny, 0.5, 0, 0).zoom).toBe(1 / 64);
  });

  it("returns the SAME view object (reference equality) when the clamped zoom doesn't change", () => {
    const view: GbcWorldView = { zoom: 32, pan: { x: 5, y: 5 }, fitted: true };
    expect(zoomWorldAboutPivot(view, 2, 999, 999)).toBe(view); // already at max
  });

  it("applies the transform exactly ONCE from a non-zero pan (the StrictMode-sensitive case)", () => {
    // Mirrors GbcMapCanvas.test.tsx's own zoomAboutPivot regression case:
    // a nested setState-inside-a-setState-updater bug would apply this
    // transform twice, landing far from the single-application answer.
    const view: GbcWorldView = { zoom: 5, pan: { x: -14, y: -6 }, fitted: true };
    const next = zoomWorldAboutPivot(view, 2, 370, 345.5);
    expect(next.zoom).toBe(10);
    const cx = (370 - -14) / 5;
    const cy = (345.5 - -6) / 5;
    expect(next.pan).toEqual({ x: 370 - cx * 10, y: 345.5 - cy * 10 });
  });

  it("carries `fitted` over unchanged (fix round, F5) -- a zoom never itself flips it, either way", () => {
    const notYetFitted: GbcWorldView = { zoom: 10, pan: { x: 0, y: 0 }, fitted: false };
    expect(zoomWorldAboutPivot(notYetFitted, 1.2, 0, 0).fitted).toBe(false);
    const fitted: GbcWorldView = { zoom: 10, pan: { x: 0, y: 0 }, fitted: true };
    expect(zoomWorldAboutPivot(fitted, 1.2, 0, 0).fitted).toBe(true);
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
      MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
      Interior: { map: "Interior", x: 1000, y: 1000, width: 5, height: 5, component: 1, mapType: "TOWN", manual: false },
    };
    expect(fitAllBounds(placements)).toEqual({ x: 0, y: 0, width: 1005, height: 1005 });
  });

  it("skips a zero-size (orphan) placement", () => {
    const placements = {
      MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
      Orphan: { map: "Orphan", x: 500, y: 500, width: 0, height: 0, component: -1, mapType: "INDOOR", manual: false },
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

  it("scales BEFORE clamping to zoomBounds.max, not after (fix round, F2): a real, non-square map still fills ~60% even when its full fit exceeds the cap", () => {
    // OlivineCity-sized (20x18 blocks) in the live app's own real viewport
    // (1000x668). Unclamped fit = min(1000/20, 668/18) = min(50, 37.111) =
    // 37.111, which exceeds GBC_ZOOM_BOUNDS.max (32) -- exactly the spec
    // review's own F2 case, re-measured here as a pinned unit test rather
    // than only a live check.
    const j = jumpFit({ x: 0, y: 0, width: 20, height: 18 }, { w: 1000, h: 668 });
    expect(j.zoom).toBeCloseTo(37.111111 * 0.6, 3); // 22.267, well under the 32 cap
    const fill = Math.max((20 * j.zoom) / 1000, (18 * j.zoom) / 668);
    expect(fill).toBeCloseTo(0.6, 6);
  });

  it("clamping before scaling (the F2 bug) would instead land at a 0.52 fill for the same map (regression pin)", () => {
    // The exact buggy formula this fix replaces: computeFit's own zoom
    // (clamped to 32 first), THEN scaled by 0.6. Kept as an explicit,
    // separate assertion of what the WRONG answer looks like, so a revert
    // back to that formula is caught even if the "fills ~0.6" test above
    // were loosened later.
    const bounds = { x: 0, y: 0, width: 20, height: 18 };
    const viewport = { w: 1000, h: 668 };
    const buggyZoom = Math.min(32, Math.max(1 / 64, computeFit(bounds, viewport, { min: 1 / 64, max: 32 }).zoom)) * 0.6;
    expect(buggyZoom).toBeCloseTo(19.2, 5);
    const j = jumpFit(bounds, viewport);
    expect(j.zoom).not.toBeCloseTo(buggyZoom, 1);
  });
});

describe("methodTint (pure)", () => {
  it("undefined sources (not yet fetched) -> null", () => {
    expect(methodTint(undefined)).toBeNull();
  });

  it("empty sources (no encounters at all) -> null", () => {
    expect(methodTint([])).toBeNull();
  });

  it("grass alone is never tinted", () => {
    expect(methodTint([{ method: "grass", time: "day", chances: [] }])).toBeNull();
  });

  it("water alone", () => {
    expect(methodTint([{ method: "water", chances: [] }])).toBe("var(--encounter-water)");
  });

  it("fish alone", () => {
    expect(methodTint([{ method: "fish", chances: [] }])).toBe("var(--encounter-fishing)");
  });

  it("headbutt alone", () => {
    expect(methodTint([{ method: "headbutt", chances: [] }])).toBe("var(--encounter-headbutt)");
  });

  it("rock alone", () => {
    expect(methodTint([{ method: "rock", chances: [] }])).toBe("var(--encounter-rock-smash)");
  });

  // Mutation check #3: swapping fish and water in the precedence order must
  // be caught -- with all four non-grass methods present, water must win.
  it("water beats fish/headbutt/rock (mutation check #3)", () => {
    const sources = [
      { method: "rock" as const, chances: [] },
      { method: "headbutt" as const, chances: [] },
      { method: "fish" as const, chances: [] },
      { method: "water" as const, chances: [] },
    ];
    expect(methodTint(sources)).toBe("var(--encounter-water)");
  });

  it("fish beats headbutt/rock when water is absent", () => {
    const sources = [
      { method: "rock" as const, chances: [] },
      { method: "headbutt" as const, chances: [] },
      { method: "fish" as const, chances: [] },
    ];
    expect(methodTint(sources)).toBe("var(--encounter-fishing)");
  });

  it("headbutt beats rock when water/fish are absent", () => {
    const sources = [
      { method: "rock" as const, chances: [] },
      { method: "headbutt" as const, chances: [] },
    ];
    expect(methodTint(sources)).toBe("var(--encounter-headbutt)");
  });

  it("grass alongside a real method never suppresses that method's own tint", () => {
    const sources = [{ method: "grass" as const, time: "day" as const, chances: [] }, { method: "rock" as const, chances: [] }];
    expect(methodTint(sources)).toBe("var(--encounter-rock-smash)");
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
    MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
    MapB: { map: "MapB", x: 10, y: 0, width: 10, height: 10, component: 0, mapType: "ROUTE", manual: false },
    Interior: { map: "Interior", x: 1000, y: 1000, width: 5, height: 5, component: 1, mapType: "TOWN", manual: false },
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
    Route17: { map: "Route17", x: 0, y: 0, width: 30, height: 40, component: 0, mapType: "ROUTE", manual: false },
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
  // Fix round (F5): wait for the INITIAL FIT to have actually committed, not
  // just for `world` to have resolved. Before the fit, `zoom` is still the
  // pre-fit default (1), which always renders as "zoom 3%"
  // (round(1/32*100)) -- distinct from every real fixture's own post-fit
  // zoom% used in this file. `visible` (and the image-load effect it drives)
  // are now gated on `fitted`, so a caller that reads `FakeImage.instances`
  // right after `mountReady()` resolves needs this fit to have already
  // happened, exactly the ordering the pre-fix bug got wrong.
  await waitFor(() => expect(screen.queryByText(/zoom 3%/)).toBeNull());
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

  it("F4: a day image that finishes loading AFTER a switch to nite is never drawn nor re-cached, and nothing re-requests the old time (fix round, adapted from spec review probe P2; kills mutation X4)", async () => {
    const { rerender, canvas } = await mountReady();
    await waitFor(() => expect(FakeImage.instances.length).toBe(2));
    const dayImages = [...FakeImage.instances];

    FakeImage.instances = [];
    rerender(<GbcWorldCanvas time="nite" />);
    await waitFor(() => expect(FakeImage.instances.length).toBe(2));
    const niteImages = [...FakeImage.instances];

    const stageCtx = ctxByCanvas.get(canvas)!;
    stageCtx.drawImage.mockClear();

    // Late day onload(s), AFTER the switch to nite -- each one still calls
    // setCompositeVersion (bumping it, harmlessly, on an orphaned cache
    // entry no longer reachable via imageCacheRef), which triggers a real
    // redraw. Nothing is drawn from it yet (the NITE entries aren't loaded
    // either), so wait a real tick rather than for any drawImage call.
    for (const img of dayImages) img.onload?.();
    await new Promise((r) => setTimeout(r, 20));
    expect(stageCtx.drawImage.mock.calls.some((c) => dayImages.includes(c[0] as never))).toBe(false);

    for (const img of niteImages) img.onload?.();
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.some((c) => niteImages.includes(c[0] as never))).toBe(true));

    // The day images were NEVER drawn, at any point in this test.
    expect(stageCtx.drawImage.mock.calls.some((c) => dayImages.includes(c[0] as never))).toBe(false);
    // And no re-request happened for the old (day) time.
    expect(FakeImage.instances.length).toBe(2);
  });

  it("culling: only placements intersecting the viewport get Image objects (Interior, far outside, gets none until Fit all)", async () => {
    await mountReady();
    expect(FakeImage.instances.length).toBe(2);
    expect(FakeImage.instances.some((i) => i.src.includes("Interior"))).toBe(false);
  });

  it("F5 regression: nothing loads from the pre-fit zoom-1 view -- a placement inside that window but outside the FITTED one is never requested", async () => {
    // NearInterior (100,150,5,5) is INSIDE the pre-fit mount default's own
    // window (zoom 1, pan {0,0}, 200x200 viewport covers world blocks
    // 0..200 on both axes) but OUTSIDE the real fit's window (zoom 10, pan
    // {0,50}, which covers x 0..20, y -5..15) -- exactly the shape of the
    // spec review's own F5 finding (probe P5): before the fix, `visible`
    // was computed against the stale pre-fit view in the same commit
    // `world` resolved, so this placement got an `Image` it should never
    // have gotten, even though it is correctly excluded from the FITTED
    // view. The far-away `Interior` (x=1000) fixture used elsewhere in this
    // file can't detect this bug at all -- it sits outside BOTH windows.
    const world: GbcWorldPayload = {
      ...WORLD,
      placements: { ...WORLD.placements, NearInterior: { map: "NearInterior", x: 100, y: 150, width: 5, height: 5, component: 2, mapType: "INDOOR", manual: false } },
      components: [...WORLD.components, { index: 2, maps: ["NearInterior"], bounds: { x: 100, y: 150, width: 5, height: 5 } }],
    };
    await mountReady({}, world);
    const srcs = FakeImage.instances.map((i) => i.src).sort();
    expect(srcs).toEqual(["/api/render/MapA.png?time=day", "/api/render/MapB.png?time=day"]);
  });

  it("LOD: the downscaled small buffer is drawn once zoom drops below 8 px/block (fix round F6, kills mutation X5)", async () => {
    const { canvas } = await mountReady(); // fit zoom = 10
    for (const img of FakeImage.instances) img.onload?.(); // load both, creating .small buffers
    const stageCtx = ctxByCanvas.get(canvas)!;
    stageCtx.drawImage.mockClear();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    // Zoom out below the threshold: 10 -> 8.33 (still >=8) -> 6.94 (<8).
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: 100 });
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: 100 });
    await waitFor(() => expect(screen.getByText(/zoom 22%/)).toBeTruthy()); // round(6.94/32*100)

    // A `small` LOD buffer is a plain HTMLCanvasElement, unlike the `img`
    // path's FakeImage instances -- this is what actually distinguishes the
    // two draw paths at the call-site level.
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.some((c) => c[0] instanceof HTMLCanvasElement)).toBe(true));
  });

  it("LOD buffer is sized at 8 px/block (32 native * 0.25), not GBA's 16 (fix round F6, kills mutation X6)", async () => {
    const originalCreateElement = document.createElement.bind(document);
    const created: HTMLCanvasElement[] = [];
    const spy = vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "canvas") created.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);
    try {
      await mountReady(); // MapA/MapB are 10x10 blocks each
      for (const img of FakeImage.instances) img.onload?.();
      // 10 blocks * 32 native px/block * 0.25 LOD_SCALE = 80. GBA's own 16
      // px/tile would instead give 10*16*0.25=40 -- a mutation to that
      // value produces canvases of the WRONG size, never 80.
      const smalls = created.filter((c) => c.width === 80 && c.height === 80);
      expect(smalls.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
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

    it("the badge colour is read from --danger specifically, not --accent (fix round F6, kills mutation X7)", async () => {
      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = ((_el: Element) => ({
        getPropertyValue: (prop: string) => (prop === "--danger" ? "rgb(9,9,9)" : ""),
      })) as typeof window.getComputedStyle;
      try {
        const { stageCtx } = await mountReady({}, CONFLICT_WORLD);
        // jsdom itself has no real custom-property resolution (both --danger
        // and --accent would read as "" there), so this stubs
        // getComputedStyle directly to discriminate exactly which property
        // NAME the draw effect asks for, via what colour ends up drawn.
        await waitFor(() => expect(stageCtx.fillStyle).toBe("rgb(9,9,9)"));
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
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

  it("hover shows width×HEIGHT, not width×width, for a non-square placement (fix round F6; kills mutation X17)", async () => {
    // Every placement in the default WORLD fixture is square (10x10), which
    // can't discriminate a width/width mixup -- Route17 (30x40) can.
    const { canvas } = await mountReady({}, CONFLICT_WORLD);
    // Fit: zoom 5, pan {25,0}. Route17 (0,0,30,40) -> screen rect [25,175]x[0,200].
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });

    const status = await screen.findByText(/Route17/);
    expect(status.textContent).toBe("Route17 · component #0 (3 maps) · 30×40 blocks");
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

  it("dragging the mouse right/down pans the view right/down, not inverted (fix round F6; kills mutation X21)", async () => {
    const { canvas } = await mountReady();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.click(canvas, { clientX: 50, clientY: 100 }); // selects MapA, to read pan off its outline
    const outline = () => document.querySelector(".world-canvas__selection-outline") as HTMLElement;
    await waitFor(() => expect(outline()).toBeTruthy());
    const leftBefore = parseFloat(outline().style.left), topBefore = parseFloat(outline().style.top);

    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 20 }); // drag right+down
    fireEvent.mouseUp(canvas);

    await waitFor(() => {
      expect(parseFloat(outline().style.left) - leftBefore).toBe(30);
      expect(parseFloat(outline().style.top) - topBefore).toBe(20);
    });
  });

  it("dropping a hidden map reveals it locally and persists its manual position", async () => {
    const hiddenWorld: GbcWorldPayload = {
      ...WORLD,
      placements: { ...WORLD.placements, Interior: { ...WORLD.placements.Interior!, mapType: "INDOOR", manual: false } },
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hiddenWorld) } as Response);
      if (url === "/api/world/placement") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const utils = render(<GbcWorldCanvas time="day" />);
    const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    await waitFor(() => expect(screen.getByText(/2 components/)).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/zoom 3%/)).toBeNull());
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.drop(canvas, { clientX: 100, clientY: 100, dataTransfer: { getData: () => "Interior" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/world/placement", expect.objectContaining({ method: "POST", body: expect.stringContaining('"map":"Interior"') })));
    await waitFor(() => expect(FakeImage.instances.some((image) => image.src.includes("Interior"))).toBe(true));
  });

  it("a double-click that ends a real drag does not open the map (fix round F6; kills mutation X15)", async () => {
    const onOpenMap = vi.fn();
    const { canvas } = await mountReady({ onOpenMap });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    // The drag/double-click END POINT (50,100) maps to world (5,5) --
    // squarely inside MapA (0,0,10,10) -- so a double-click landing there
    // WOULD call onOpenMap if the drag guard didn't block it; a point that
    // hits no placement at all can't discriminate the guard's own mutation
    // (X15) from ordinary "nothing was under the cursor" behaviour.
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 60, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 100 }); // real movement while dragging
    fireEvent.mouseUp(canvas);
    fireEvent.doubleClick(canvas, { clientX: 50, clientY: 100 }); // the browser's own trailing dblclick

    expect(onOpenMap).not.toHaveBeenCalled();
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

  it("a viewport resize after a jump does not re-trigger it (the applied-token guard; fix round F6, kills mutation X13)", async () => {
    const { rerender } = await mountReady();
    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={1} />);
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    // Let the highlight fade so a SPURIOUS re-jump is visible as a
    // reappearing highlight, not just the same one still fading.
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(), { timeout: 3000 });

    // Trigger a viewport resize (same jumpToken, same jumpToMap) -- the jump
    // effect's own deps include `viewport`, so this re-runs it.
    const viewportEl = document.querySelector(".world-canvas__viewport") as HTMLElement;
    Object.defineProperty(viewportEl, "clientWidth", { value: VIEWPORT_SIZE - 20, configurable: true });
    Object.defineProperty(viewportEl, "clientHeight", { value: VIEWPORT_SIZE - 20, configurable: true });
    FakeResizeObserver.instances[0]!.fire();

    await new Promise((r) => setTimeout(r, 100));
    expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(); // must NOT re-jump
  }, 10000);

  it("the jump outline is keyed on jumpToken -- re-jumping to the SAME map mounts a fresh DOM node (fix round F6, kills mutation X14)", async () => {
    const { rerender } = await mountReady();
    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={1} />);
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    const first = document.querySelector(".world-canvas__jump-highlight");

    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={2} />); // re-click the SAME map
    await waitFor(() => {
      const second = document.querySelector(".world-canvas__jump-highlight");
      expect(second).toBeTruthy();
      expect(second).not.toBe(first); // a fresh node -- proves key={jumpToken} forced a remount
    });
  });

  it("re-jumping to the SAME map restarts the fade timer, rather than expiring on the first click's own original schedule (F7)", async () => {
    const { rerender } = await mountReady();
    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={1} />);
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());

    await new Promise((r) => setTimeout(r, 1500)); // most of the way through token 1's own 2s timer
    rerender(<GbcWorldCanvas time="day" jumpToMap="MapB" jumpToken={2} />); // re-click the SAME map
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());

    await new Promise((r) => setTimeout(r, 1000)); // ~2500ms since token 1's own click -- its
    // ORIGINAL timer (had it not restarted) would already have cleared the
    // highlight by now.
    expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy();

    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(), { timeout: 2000 });
  }, 10000);

  // -------------------------------------------------------------------
  // Postmortem mechanics: StrictMode, wheel passive:false, viewport-in-blit-deps.
  // -------------------------------------------------------------------
  it("under <StrictMode>, a wheel zoom lands on the EXACT single-application pan, pinned via the selection outline (fix round F3, adapted from spec review probe P1; kills mutation X1)", async () => {
    vi.stubGlobal("fetch", mockFetchWorld(WORLD));
    const utils = render(
      <StrictMode>
        <GbcWorldCanvas time="day" />
      </StrictMode>,
    );
    await waitFor(() => expect(utils.getByText(/2 components/)).toBeTruthy());
    const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    await waitFor(() => expect(screen.getByText(/zoom 31%/)).toBeTruthy()); // fit: zoom 10, pan {0,50}

    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.click(canvas, { clientX: 50, clientY: 100 }); // selects MapA (0,0,10,10)
    const outline = () => document.querySelector(".world-canvas__selection-outline:not(.world-canvas__jump-highlight)") as HTMLElement;
    await waitFor(() => expect(outline()).toBeTruthy());
    // Pre-wheel: MapA at zoom 10, pan {0,50} -> left 0, top 50, width 100.
    expect([outline().style.left, outline().style.top, outline().style.width]).toEqual(["0px", "50px", "100px"]);

    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 }); // zoom in: 10 * 1.2 = 12
    // round(12/32*100) = 38 -- a spec-review-confirmed regression gap: the
    // OLD version of this test asserted only this zoom%, which a nested-
    // updater StrictMode bug (mutation X1) does NOT change (the Task 4 bug
    // class doubles the PAN, not the zoom -- a pure zoom updater run twice
    // still returns the same zoom). X1 survived the old test 225/225 green.
    await waitFor(() => expect(screen.getByText(/zoom 38%/)).toBeTruthy());
    // Pin the EXACT pan via the outline, not just the zoom%: cx=(100-0)/10=
    // 10, cy=(100-50)/10=5; new pan = {100-10*12, 100-5*12} = {-20,40}.
    // MapA on screen: left=0*12-20=-20, top=0*12+40=40, width=10*12=120.
    expect([outline().style.left, outline().style.top, outline().style.width]).toEqual(["-20px", "40px", "120px"]);
  });

  it("Fit all under <StrictMode> lands on the EXACT single-application pan (fix round F3; kills mutation X2)", async () => {
    vi.stubGlobal("fetch", mockFetchWorld(WORLD));
    const utils = render(
      <StrictMode>
        <GbcWorldCanvas time="day" />
      </StrictMode>,
    );
    await waitFor(() => expect(utils.getByText(/2 components/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/zoom 31%/)).toBeTruthy());
    const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });

    // Pan/zoom away from the fit first, so Fit all's own view change is a
    // REAL change a nested-updater bug could double, not a no-op.
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
    await waitFor(() => expect(screen.getByText(/zoom 38%/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Fit all" }));
    const expected = computeFit({ x: 0, y: 0, width: 1005, height: 1005 }, { w: VIEWPORT_SIZE, h: VIEWPORT_SIZE }, { min: 1 / 64, max: 32 });
    const expectedPercent = Math.round((expected.zoom / 32) * 100);
    await waitFor(() => expect(screen.getByText(new RegExp(`zoom ${expectedPercent}%`))).toBeTruthy());

    // Pin the EXACT pan by selecting the far-away Interior (now visible
    // after Fit all) and reading its own selection outline's screen rect --
    // a StrictMode-doubled pan would still show the right zoom% (a pure
    // zoom is unaffected) but Interior's own screen rect would be wrong.
    // Interior is (1000,1000,5,5); click its own world-space CENTRE
    // (1002.5,1002.5), not its corner, since at this zoom (~0.2) its whole
    // screen footprint is under 1px wide and a corner click risks missing
    // it to floating-point rounding.
    const ix = 1000 * expected.zoom + expected.pan.x, iy = 1000 * expected.zoom + expected.pan.y;
    const cx = 1002.5 * expected.zoom + expected.pan.x, cy = 1002.5 * expected.zoom + expected.pan.y;
    fireEvent.click(canvas, { clientX: cx, clientY: cy });
    const outline = () => document.querySelector(".world-canvas__selection-outline:not(.world-canvas__jump-highlight)") as HTMLElement;
    await waitFor(() => expect(outline()).toBeTruthy());
    expect(parseFloat(outline().style.left)).toBeCloseTo(ix, 6);
    expect(parseFloat(outline().style.top)).toBeCloseTo(iy, 6);
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

  // -------------------------------------------------------------------
  // Keyboard path (fix round, quality review Minor #3).
  // -------------------------------------------------------------------
  describe("keyboard", () => {
    it("the canvas is focusable with an accessible name", async () => {
      const { canvas } = await mountReady();
      expect(canvas.tabIndex).toBe(0);
      expect(canvas.getAttribute("aria-label")).toMatch(/World map/i);
    });

    it("+ zooms in about the viewport's own centre, through the same single-state updater a wheel notch uses", async () => {
      const { canvas } = await mountReady(); // fit: zoom 10, pan {0,50}
      canvas.focus();
      fireEvent.keyDown(canvas, { key: "+" });
      // Centre pivot (100,100): cx=(100-0)/10=10, cy=(100-50)/10=5; next
      // zoom 12; pan={100-10*12,100-5*12}={-20,40} -- the EXACT same math a
      // wheel-in notch at the viewport centre would produce.
      await waitFor(() => expect(screen.getByText(/zoom 38%/)).toBeTruthy());
    });

    it("- zooms out about the viewport's own centre", async () => {
      const { canvas } = await mountReady(); // fit: zoom 10, pan {0,50}
      canvas.focus();
      fireEvent.keyDown(canvas, { key: "-" });
      // next zoom = 10 / 1.2 = 8.333 -> round(8.333/32*100) = 26.
      await waitFor(() => expect(screen.getByText(/zoom 26%/)).toBeTruthy());
    });

    it("Enter opens the currently selected map (the same target a double-click would open)", async () => {
      const onOpenMap = vi.fn();
      const { canvas } = await mountReady({ onOpenMap });
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
      fireEvent.click(canvas, { clientX: 50, clientY: 100 }); // selects MapA
      await waitFor(() => expect(document.querySelector(".world-canvas__selection-outline")).toBeTruthy());

      canvas.focus();
      fireEvent.keyDown(canvas, { key: "Enter" });
      expect(onOpenMap).toHaveBeenCalledWith("MapA");
    });

    it("Enter does nothing when nothing is selected", async () => {
      const onOpenMap = vi.fn();
      const { canvas } = await mountReady({ onOpenMap });
      canvas.focus();
      fireEvent.keyDown(canvas, { key: "Enter" });
      expect(onOpenMap).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Plan 6b Task 6: encounter gutter, coverage lenses, species spotlight.
// ---------------------------------------------------------------------------

const EMPTY_COVERAGE = {
  mapsWithEncounters: 0,
  mapsWithoutEncounters: [] as string[],
  sourcesByMethod: {},
  levelByMap: [] as { mapName: string; averageLevel: number }[],
  unusedSpecies: [] as string[],
  fishGroupWithoutWater: [],
  defects: [],
};

interface AllFetchOpts {
  world?: GbcWorldPayload;
  encounters?: Record<string, unknown[]>;
  coverage?: typeof EMPTY_COVERAGE;
  species?: string[];
  where?: Record<string, unknown[]>;
}

function mockFetchAll(opts: AllFetchOpts) {
  const world = opts.world ?? WORLD;
  return vi.fn((url: string) => {
    if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
    const encMatch = /^\/api\/encounters\/(.+)$/.exec(url);
    if (encMatch) {
      const name = decodeURIComponent(encMatch[1]!);
      const sources = opts.encounters?.[name] ?? [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ family: "gbc", mapName: name, sources, defects: [] }),
      } as Response);
    }
    if (url === "/api/coverage") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.coverage ?? EMPTY_COVERAGE) } as Response);
    }
    if (url === "/api/species") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.species ?? []) } as Response);
    }
    const whereMatch = /^\/api\/where\/(.+)$/.exec(url);
    if (whereMatch) {
      const species = decodeURIComponent(whereMatch[1]!);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.where?.[species] ?? []) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

async function mountReadyAll(opts: AllFetchOpts, props: Partial<GbcWorldCanvasProps> = {}) {
  vi.stubGlobal("fetch", mockFetchAll(opts));
  const world = opts.world ?? WORLD;
  const utils = render(<GbcWorldCanvas time="day" {...props} />);
  const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
  await waitFor(() => expect(screen.getByText(new RegExp(`${world.components.length} components`))).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(/zoom 3%/)).toBeNull());
  return { ...utils, canvas };
}

describe("GbcWorldCanvas: encounters/lenses/spotlight (Plan 6b Task 6)", () => {
  it("fetches /api/encounters/:map once for each visible map, does NOT refetch when time changes, and RETAINED data still renders after the switch (F3)", async () => {
    const encMock = vi.fn((_name: string) => {});
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(WORLD) } as Response);
      const m = /^\/api\/encounters\/(.+)$/.exec(url);
      if (m) {
        const name = decodeURIComponent(m[1]!);
        encMock(name);
        // MapA gets a real water source -- if a mutation clears the
        // encounter cache on a time change (F3's own target: R11), this is
        // the tint that would silently disappear after the rerender below,
        // since the fetch effect is keyed on [visible] only and would never
        // re-populate a cleared cache.
        const sources = name === "MapA" ? [{ method: "water", chances: [] }] : [];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ family: "gbc", mapName: name, sources, defects: [] }) } as Response);
      }
      if (url === "/api/coverage") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EMPTY_COVERAGE) } as Response);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender, container } = render(<GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByText(/2 components/)).toBeTruthy());
    // Only MapA and MapB are inside the initial fit (Interior is culled) --
    // mirrors the image cache's own "initial fit covers the multi-map
    // components only" test above.
    await waitFor(() => expect(encMock).toHaveBeenCalledTimes(2));
    expect(encMock.mock.calls.map((c) => c[0]).sort()).toEqual(["MapA", "MapB"]);

    fireEvent.click(screen.getByLabelText(/method lens/i));
    await waitFor(() => expect(document.querySelectorAll(".world-canvas__lens-tint").length).toBe(1));

    rerender(<GbcWorldCanvas time="nite" />);
    await new Promise((r) => setTimeout(r, 20));
    // A time switch must NOT clear/refetch the encounter cache -- it is
    // time-independent (one fetch per map, ever); only the image cache does
    // that.
    expect(encMock).toHaveBeenCalledTimes(2);
    // F3: the retained data must still RENDER after the switch. A count-only
    // assertion right after the rerender can't tell a working cache from a
    // silently-cleared one -- neither `gutterEntries` nor `lensOverlayEntries`
    // recompute on a time-only rerender (their own deps, `visible`/`pan`/
    // `zoom`/`encounterVersion`, are all unchanged by `time` alone), so a
    // stale pre-clear render would look identical either way. A wheel zoom
    // (changing `zoom`, a real dependency of both memos) forces them to
    // re-read the cache -- exactly the "blank... until a pan" mechanism the
    // spec review's own evidence describes.
    const canvas = container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
    expect(document.querySelectorAll(".world-canvas__lens-tint").length).toBe(1);
  });

  it("the Encounters toggle shows a species sprite built from the real fetched sources", async () => {
    const sources = [{ method: "rock", chances: [{ species: "GEODUDE", percent: 45, minLevel: 5, maxLevel: 8 }] }];
    await mountReadyAll({ encounters: { MapA: sources, MapB: [] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Encounters" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Geodude" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Geodude" }).querySelector("img")!.getAttribute("src")).toBe("/api/species/GEODUDE/icon.png");
  });

  // Plan 6c B3: sides are chosen over every placement (memo on `world` only).
  // MapB sits flush against MapA's right edge, so MapB's left is blocked -> top;
  // MapA's left is free.
  it("puts each map's border on the side pickBorderSide gives: MapB (left blocked by MapA) -> top, MapA -> left", async () => {
    const sources = [{ method: "rock", chances: [{ species: "GEODUDE", percent: 45, minLevel: 5, maxLevel: 8 }] }];
    const { container } = await mountReadyAll({ encounters: { MapA: sources, MapB: sources } });
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    await waitFor(() => expect(container.querySelectorAll(".encounter-border__strip").length).toBe(2));
    const sides = [...container.querySelectorAll(".encounter-border__strip")].map((s) => /--(left|top|right|bottom)\b/.exec(s.className)![1]);
    // visible order follows world.placements: MapA, MapB
    expect(sides).toEqual(["left", "top"]);
  });

  // Plan 6c B3: time dims, it no longer filters. Fixture mirrors Route30: a
  // morn/day grass species and a nite-only one.
  // Fit zoom is 10 (31%). Wheel-out is x1/1.2: 8.33 (26%, still >= 8) -> 6.94 (22%, < 8 = badge); one wheel-in
  // returns to 8.33 (sprites). Pins the wiring of GBC_LOD_ZOOM_THRESHOLD (8) and BORDER_BAND.gbc (2) into the
  // border: lodZoom={4} would keep sprites at 6.94, band={BORDER_BAND.gba} would make every band 4 blocks thick.
  it("wheeling out from the fit zoom: sprites at >= 8, a badge below 8, sprites again after wheeling back; band thickness = BORDER_BAND.gbc * zoom", async () => {
    const sources = [{ method: "rock", chances: [{ species: "GEODUDE", percent: 45, minLevel: 5, maxLevel: 8 }] }];
    const { container, canvas } = await mountReadyAll({ encounters: { MapA: sources, MapB: sources } });
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    const strips = () => [...container.querySelectorAll<HTMLElement>(".encounter-border__strip")];
    const badges = () => container.querySelectorAll(".encounter-border__badge");
    const wheel = async (deltaY: number, pct: RegExp) => {
      fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY });
      await waitFor(() => expect(screen.getByText(pct)).toBeTruthy());
    };

    await waitFor(() => expect(strips().length).toBe(2)); // fit zoom 10
    expect(badges().length).toBe(0);
    const left = () => container.querySelector<HTMLElement>(".encounter-border__strip--left")!; // MapA
    expect(parseFloat(left().style.width)).toBeCloseTo(BORDER_BAND.gbc * 10, 3);

    await wheel(100, /zoom 26%/); // zoom 8.33: still >= 8
    expect(strips().length).toBe(2);
    expect(badges().length).toBe(0);
    expect(parseFloat(left().style.width)).toBeCloseTo(BORDER_BAND.gbc * (10 / 1.2), 3);

    await wheel(100, /zoom 22%/); // zoom 6.94: below 8
    expect(strips().length).toBe(0);
    expect(badges().length).toBe(2);

    await wheel(-100, /zoom 26%/); // back to 8.33
    expect(badges().length).toBe(0);
    expect(strips().length).toBe(2);
    expect(parseFloat(left().style.width)).toBeCloseTo(BORDER_BAND.gbc * (10 / 1.2), 3);
  });

  it("at time=morn a nite-only species renders dimmed (not hidden) and a morn species does not; the time-independent cache means a time switch flips it without a refetch", async () => {
    const sources = [
      { method: "grass", time: "morn", encounterRate: 9.765625, chances: [{ species: "CATERPIE", percent: 45, minLevel: 3, maxLevel: 8 }] },
      { method: "grass", time: "nite", encounterRate: 9.765625, chances: [{ species: "ZUBAT", percent: 10, minLevel: 3, maxLevel: 7 }] },
    ];
    const { rerender } = await mountReadyAll({ encounters: { MapA: sources, MapB: [] } }, { time: "morn" });
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Zubat/ })).toBeTruthy());
    const dimmed = (n: string) => screen.getByRole("button", { name: new RegExp(`^${n}(,|$)`) }).classList.contains("encounter-border__sprite--dimmed");
    expect(dimmed("Zubat")).toBe(true);
    expect(dimmed("Caterpie")).toBe(false);
    const encounterCalls = () => vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).startsWith("/api/encounters/")).length;
    expect(encounterCalls()).toBe(2); // MapA, MapB: one fetch each
    rerender(<GbcWorldCanvas time="nite" />);
    expect(dimmed("Zubat")).toBe(false);
    expect(dimmed("Caterpie")).toBe(true);
    expect(encounterCalls()).toBe(2); // the time switch refetched nothing
  });

  it("method lens tints MapA/MapB by their own fetched method precedence", async () => {
    const encounters = {
      MapA: [{ method: "water", chances: [] }],
      MapB: [{ method: "rock", chances: [] }],
    };
    await mountReadyAll({ encounters });
    fireEvent.click(screen.getByLabelText(/method lens/i));

    await waitFor(() => expect(document.querySelectorAll(".world-canvas__lens-tint").length).toBe(2));
    const tints = [...document.querySelectorAll<HTMLElement>(".world-canvas__lens-tint")].map((el) => el.style.background);
    expect(tints).toContain("var(--encounter-water)");
    expect(tints).toContain("var(--encounter-rock-smash)");
  });

  it("the method lens's own legend key uses the GBC methodKey (water/fish/headbutt/rock-smash, no grass)", async () => {
    await mountReadyAll({});
    fireEvent.click(screen.getByLabelText(/method lens/i));
    expect(screen.getByText("Headbutt")).toBeTruthy();
    expect(screen.getByText("Rock Smash")).toBeTruthy();
    expect(screen.queryByText("Grass")).toBeNull();
  });

  it("empty-maps lens tints a map named in coverage's own mapsWithoutEncounters with --warn", async () => {
    await mountReadyAll({ coverage: { ...EMPTY_COVERAGE, mapsWithoutEncounters: ["MapA"] } });
    fireEvent.click(screen.getByLabelText(/empty maps lens/i));
    await waitFor(() => expect(document.querySelectorAll(".world-canvas__lens-tint").length).toBe(1));
    expect(document.querySelector<HTMLElement>(".world-canvas__lens-tint")!.style.background).toBe("var(--warn)");
  });

  // Plan 6c C1: the legend is a row below the toolbar (never a popover) and
  // its lists are real: Empty maps lists coverage's own names and a click
  // hands the name to the app's onJumpToMap (replaces the old focusEmptyMaps fit, F11).
  it("Empty maps lens: 'List them' lists the coverage's own empty maps and a click calls onJumpToMap", async () => {
    const onJumpToMap = vi.fn();
    await mountReadyAll({ coverage: { ...EMPTY_COVERAGE, mapsWithoutEncounters: ["MapA", "Interior"] } }, { onJumpToMap });
    fireEvent.click(screen.getByLabelText(/empty maps lens/i));
    fireEvent.click(screen.getByRole("button", { name: "List them" }));
    const ul = screen.getByRole("list", { name: "Maps with no encounters" });
    expect(Array.from(ul.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["MapA", "Interior"]);
    fireEvent.click(screen.getByRole("button", { name: "Interior" }));
    expect(onJumpToMap).toHaveBeenCalledTimes(1);
    expect(onJumpToMap).toHaveBeenCalledWith("Interior");
  });

  it("Unused species lens: 'Show list' lists display names from coverage's own unusedSpecies", async () => {
    await mountReadyAll({ coverage: { ...EMPTY_COVERAGE, unusedSpecies: ["CELEBI"] } });
    fireEvent.click(screen.getByLabelText(/unused species lens/i));
    fireEvent.click(screen.getByRole("button", { name: "Show list" }));
    const ul = screen.getByRole("list", { name: "Unused species" });
    expect(Array.from(ul.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["Celebi"]);
  });

  it("the legend is a row directly after the toolbar, outside the toolbar and the viewport", async () => {
    await mountReadyAll({ coverage: { ...EMPTY_COVERAGE, mapsWithoutEncounters: ["MapA"] } });
    fireEvent.click(screen.getByLabelText(/empty maps lens/i));
    const row = document.querySelector(".world-canvas__toolbar")!.nextElementSibling as HTMLElement;
    expect(row.classList.contains("world-canvas__legend-row")).toBe(true);
    expect(row.textContent).toMatch(/1 map has no encounters/);
    expect(row.closest(".world-canvas__toolbar")).toBeNull();
    expect(row.closest(".world-canvas__viewport")).toBeNull();
  });

  async function mountWithCoverageAnswer(answer: () => Promise<Response>) {
    const base = mockFetchAll({});
    vi.stubGlobal("fetch", vi.fn((url: string) => (url === "/api/coverage" ? answer() : base(url))));
    render(<GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByText(new RegExp(`${WORLD.components.length} components`))).toBeTruthy());
  }
  const legendRow = () => document.querySelector(".world-canvas__legend-row");

  it("while coverage is still loading, a lens shows 'Loading coverage…' and never a count or list button", async () => {
    await mountWithCoverageAnswer(() => new Promise<Response>(() => {}));
    fireEvent.click(screen.getByLabelText(/empty maps lens/i));
    expect(legendRow()!.textContent).toContain("Loading coverage…");
    expect(legendRow()!.textContent).not.toMatch(/0 maps|have no encounters/);
    expect(screen.queryByRole("button", { name: "List them" })).toBeNull();
  });

  it("a coverage failure after a lens was clicked removes the legend row and shows the error", async () => {
    let fail!: () => void;
    await mountWithCoverageAnswer(() => new Promise<Response>((res) => { fail = () => res({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response); }));
    fireEvent.click(screen.getByLabelText(/empty maps lens/i));
    expect(legendRow()).not.toBeNull();
    await act(async () => { fail(); });
    await waitFor(() => expect(screen.getByText(/Coverage lenses unavailable/)).toBeTruthy());
    expect(legendRow()).toBeNull();
  });

  it("no legend row until a lens is on, and none again once it is turned off", async () => {
    await mountReadyAll({ coverage: { ...EMPTY_COVERAGE, mapsWithoutEncounters: ["MapA"] } });
    const toggle = screen.getByLabelText(/empty maps lens/i);
    expect(legendRow()).toBeNull();
    fireEvent.click(toggle);
    expect(legendRow()).not.toBeNull();
    fireEvent.click(toggle);
    expect(legendRow()).toBeNull();
  });

  it("the level-curve lens row carries GBC's own legend copy (legendCopy reaches the legend)", async () => {
    await mountReadyAll({});
    fireEvent.click(screen.getByLabelText(/level curve lens/i));
    expect(legendRow()!.textContent).toContain("an unweighted mean");
  });

  // Fix round (spec review F5/R7): the original version of this test only
  // asserted the 2 tints differ from each other, which survives BOTH a
  // divisor bug (R18, now covered directly by WorldCanvas.test.tsx's own
  // levelColorMap unit tests) AND a low/high swap at THIS call site (R7) --
  // two different colours are still "distinct" even swapped. Stubs
  // getComputedStyle (mirroring the badge-colour test's own pattern just
  // above) so the low/high endpoints are known exactly, then asserts the
  // LOWER-level map (MapA) gets the LOW endpoint and the higher (MapB) gets
  // the HIGH one.
  it("level-curve lens colours the LOW map with the low endpoint and the HIGH map with the high endpoint (mutation check R7)", async () => {
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = ((_el: Element) => ({
      getPropertyValue: (prop: string) => {
        if (prop === "--overlay-elevation-low") return "#0000ff";
        if (prop === "--danger") return "#ff0000";
        return "";
      },
    })) as typeof window.getComputedStyle;
    try {
      const coverage = { ...EMPTY_COVERAGE, levelByMap: [{ mapName: "MapA", averageLevel: 3 }, { mapName: "MapB", averageLevel: 40 }] };
      await mountReadyAll({ coverage });
      fireEvent.click(screen.getByLabelText(/level curve lens/i));
      await waitFor(() => expect(document.querySelectorAll(".world-canvas__lens-tint").length).toBe(2));
      const byMap = new Map(
        [...document.querySelectorAll<HTMLElement>(".world-canvas__lens-tint")].map((el, i) => [["MapA", "MapB"][i], el.style.background]),
      );
      expect(byMap.get("MapA")).toBe("rgb(0, 0, 255)"); // the low map -- exact low endpoint
      expect(byMap.get("MapB")).toBe("rgb(255, 0, 0)"); // the high map -- exact high endpoint
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  });

  it("a coverage fetch failure shows a visible error instead of silently rendering '0' lens counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(WORLD) } as Response);
        if (url === "/api/coverage") return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
        if (/^\/api\/encounters\//.test(url)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ family: "gbc", sources: [], defects: [] }) } as Response);
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }),
    );
    render(<GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByText(/Coverage lenses unavailable/)).toBeTruthy());
  });

  // Fix round (spec review F4): a GBA-shaped /api/encounters/:map response
  // ({ mapName, mapId, methods }, no family tag, no sources array) fails
  // isGbcEncountersPayload -- must surface as a visible note, and must not
  // be retried in a loop.
  it("a GBA-shaped encounters payload shows a visible 'unavailable' note, and is not retried in a loop", async () => {
    const encFetchCount = { MapA: 0, MapB: 0 };
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(WORLD) } as Response);
      const m = /^\/api\/encounters\/(.+)$/.exec(url);
      if (m) {
        const name = decodeURIComponent(m[1]!) as "MapA" | "MapB";
        encFetchCount[name]++;
        // GBA's own shape for the identical URL pattern -- no `family`, no
        // `sources`, a `methods` array instead.
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ mapName: name, mapId: 1, methods: [] }) } as Response);
      }
      if (url === "/api/coverage") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(EMPTY_COVERAGE) } as Response);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByText(/2 components/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Encounter data unavailable for 2 maps")).toBeTruthy());

    // Not retried in a loop: a subsequent recompute (a wheel zoom, which
    // touches the same [visible] the fetch effect is keyed on) must not
    // trigger a second fetch for either already-failed map.
    const canvas = container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
    await new Promise((r) => setTimeout(r, 20));
    expect(encFetchCount).toEqual({ MapA: 1, MapB: 1 });
  });

  it("species spotlight dims non-matching maps and lights a hit with its percent/level badge", async () => {
    await mountReadyAll({
      species: ["CHIKORITA"],
      where: { CHIKORITA: [{ mapName: "MapA", mapConst: "MAP_A", method: "grass", percent: 45, minLevel: 3, maxLevel: 5 }] },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CHIKORITA" } });
    await waitFor(() => expect(document.querySelector(".world-canvas__spotlight-hit")).toBeTruthy());
    expect(document.querySelector(".world-canvas__spotlight-badge")!.textContent).toBe("45% Lv 3-5");
    expect(document.querySelector(".world-canvas__spotlight-dim")).toBeTruthy(); // MapB, not a hit
  });

  // Fix round (spec review F8): gbcWhereSpecies can return several hits for
  // the SAME map (one per time/rod/variant) -- spotlightByMap must keep the
  // HIGHEST-percent one, not merely the first or the last seen.
  it("with two hits on the same map, the spotlight badge shows the HIGHER percent (mutation check F8)", async () => {
    await mountReadyAll({
      species: ["CHIKORITA"],
      where: {
        CHIKORITA: [
          { mapName: "MapA", mapConst: "MAP_A", method: "grass", time: "morn", percent: 10, minLevel: 3, maxLevel: 5 },
          { mapName: "MapA", mapConst: "MAP_A", method: "grass", time: "day", percent: 45, minLevel: 4, maxLevel: 6 },
        ],
      },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CHIKORITA" } });
    await waitFor(() => expect(document.querySelector(".world-canvas__spotlight-badge")).toBeTruthy());
    expect(document.querySelector(".world-canvas__spotlight-badge")!.textContent).toBe("45% Lv 4-6");
  });
});
