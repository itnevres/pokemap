import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { WorldCanvas } from "../src/components/WorldCanvas.js";
import { computeFit } from "../src/components/WorldCanvas.js";

/**
 * jsdom/testing-library's `fireEvent.drop(el, {clientX, clientY, ...})` does
 * not actually apply `clientX`/`clientY` to the resulting event in this
 * combination (confirmed by tracing WorldCanvas's own onDrop handler: they
 * came back `undefined`, producing NaN world coordinates) even though
 * `dataTransfer` comes through correctly via the same mechanism. MouseEvent's
 * own constructor DOES honour clientX/clientY reliably, so this builds a
 * plain MouseEvent for "drop" and grafts `dataTransfer` on as an own
 * property, then dispatches it through fireEvent's lower-level
 * `fireEvent(element, event)` form.
 */
function makeDropEvent(clientX: number, clientY: number, dataTransfer: unknown): Event {
  const ev = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
  return ev;
}

// ---------------------------------------------------------------------------
// Fixture builder. Each test supplies just the placements/conflicts/links it
// needs; `components` defaults to one singleton component per placement
// (sufficient for most tests) and is overridden explicitly by the tests that
// care about the unplaced-vs-placed distinction (dungeon toggle, side rail,
// the component:-1 orphan cases).
// ---------------------------------------------------------------------------
interface RawPlacement { map: string; x: number; y: number; width: number; height: number; component: number; }
interface RawComponent { index: number; maps: string[]; bounds: { x: number; y: number; width: number; height: number } }

function makeWorld(opts: {
  placements: Record<string, RawPlacement>;
  components?: RawComponent[];
  conflicts?: Array<{ map: string; viaA: { from: string; x: number; y: number }; viaB: { from: string; x: number; y: number } }>;
  verticalLinks?: Array<{ from: string; to: string; direction: "dive" | "emerge" }>;
  dungeonAutoLayout?: boolean;
}) {
  return {
    placements: opts.placements,
    components:
      opts.components ??
      Object.values(opts.placements).map((p, i) => ({
        index: i,
        maps: [p.map],
        bounds: { x: p.x, y: p.y, width: p.width, height: p.height },
      })),
    conflicts: opts.conflicts ?? [],
    verticalLinks: opts.verticalLinks ?? [],
    sidecar: { version: 1, dungeonAutoLayout: opts.dungeonAutoLayout ?? true, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } },
  };
}

type WorldFixture = ReturnType<typeof makeWorld>;

/** Routes GET /api/world (and ?dungeons=) to the current fixture, and makes
 *  POST /api/world/placement actually mutate it -- so a test can prove a
 *  drag "survives a reload" by unmounting and re-rendering against the same
 *  mock, exactly as a real page reload would re-fetch from the real server
 *  after a real POST. */
function makeFetchMock(initial: WorldFixture) {
  let world: WorldFixture = JSON.parse(JSON.stringify(initial));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith("/api/world/placement")) {
      const body = JSON.parse(String(init?.body)) as { map: string; x: number; y: number };
      const existing = world.placements[body.map];
      world = { ...world, placements: { ...world.placements, [body.map]: {
        map: body.map, x: body.x, y: body.y,
        width: existing?.width ?? 0, height: existing?.height ?? 0, component: existing?.component ?? -1,
      } } };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
    }
    if (url.startsWith("/api/world")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  return { impl, calls, currentWorld: () => world };
}

// ---------------------------------------------------------------------------
// Canvas context + Image mocking. Same technique as MapCanvas.test.tsx: a
// fake 2D context recording the calls WorldCanvas makes, keyed per-canvas so
// the offscreen LOD buffers (packages/ui/src/components/WorldCanvas.tsx's
// `small` cache) can be told apart from the visible stage canvas. Image is
// stubbed separately because these are created imperatively (`new Image()`),
// never inserted into the DOM, so `fireEvent.load` (which needs a DOM node)
// cannot reach them -- the culling requirement is specifically about how
// many of these get constructed at all.
// ---------------------------------------------------------------------------
interface FakeCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  fillLog: string[];
  drawImage: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
}

const ctxByCanvas = new Map<HTMLCanvasElement, FakeCtx>();

function makeFakeCtx(): FakeCtx {
  const ctx = {
    imageSmoothingEnabled: true,
    fillStyle: "",
    fillLog: [] as string[],
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  };
  ctx.fill = vi.fn(() => ctx.fillLog.push(ctx.fillStyle));
  return ctx;
}

class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
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
}

const VIEWPORT_SIZE = 100;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

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

  // jsdom reports 0 for every element's clientWidth/clientHeight; fix the
  // viewport so pixel math in every test is exact and hand-computable, the
  // same reasoning as MapCanvas.test.tsx's PIXEL_SIZE.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: VIEWPORT_SIZE, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: VIEWPORT_SIZE, configurable: true });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  ctxByCanvas.clear();
  vi.unstubAllGlobals();
});

/**
 * Mounts and waits for the initial /api/world fetch to actually land.
 *
 * Waiting on "clearRect has been called" alone is NOT sufficient: the draw
 * effect calls clearRect unconditionally at its top, even on the very first
 * render where `world` is still null and `visible` is `[]` -- so that check
 * can pass before the fetch has resolved at all. Waiting for the "Loading
 * world…" placeholder to disappear is tied directly to `world !== null`,
 * which only happens after the fetch's `.then` has actually run.
 */
async function mountReady(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const utils = render(<WorldCanvas />);
  await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
  const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: VIEWPORT_SIZE, bottom: VIEWPORT_SIZE, width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, x: 0, y: 0, toJSON() {},
  });
  const stageCtx = ctxByCanvas.get(canvas)!;
  await waitFor(() => expect(stageCtx.clearRect).toHaveBeenCalled());
  return { ...utils, canvas, stageCtx };
}

describe("WorldCanvas", () => {
  // -------------------------------------------------------------------
  // Culling
  // -------------------------------------------------------------------
  it("culls: fetches images only for placements intersecting the viewport, not every placement", async () => {
    // Default view is zoom=1, pan={0,0} -- world-tile viewport is exactly
    // [0,100)x[0,100) at VIEWPORT_SIZE=100. Three placements sit inside
    // that box; nine more sit far outside it (x>=250), so a broken
    // implementation that fetches unconditionally would create 12 images,
    // not 3 -- and one that fetches nothing would create 0. Either wrong
    // answer is distinguishable from the pinned one.
    const inView: Record<string, RawPlacement> = {
      InViewA: { map: "InViewA", x: 0, y: 0, width: 10, height: 10, component: 0 },
      InViewB: { map: "InViewB", x: 20, y: 0, width: 10, height: 10, component: 1 },
      InViewC: { map: "InViewC", x: 0, y: 20, width: 10, height: 10, component: 2 },
    };
    const farAway: Record<string, RawPlacement> = {};
    for (let i = 0; i < 9; i++) {
      farAway[`Far${i}`] = { map: `Far${i}`, x: 250 + i * 40, y: 250, width: 10, height: 10, component: 3 + i };
    }
    const { impl } = makeFetchMock(makeWorld({ placements: { ...inView, ...farAway } }));
    await mountReady(impl);

    await waitFor(() => expect(FakeImage.instances.length).toBe(3));
    expect(FakeImage.instances.map((i) => i.src).sort()).toEqual(
      ["/api/render/InViewA.png", "/api/render/InViewB.png", "/api/render/InViewC.png"].sort(),
    );
  });

  it("never re-fetches a placement already cached, even across a redraw", async () => {
    const { impl } = makeFetchMock(
      makeWorld({ placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } } }),
    );
    const { canvas } = await mountReady(impl);
    await waitFor(() => expect(FakeImage.instances.length).toBe(1));

    // A pan that keeps Solo in view still triggers the draw effect (pan is
    // a dependency) but must not create a second Image for the same map.
    fireEvent.mouseDown(canvas, { clientX: 90, clientY: 90, button: 0 }); // empty space -> pans, not a map drag
    fireEvent.mouseMove(canvas, { clientX: 95, clientY: 95 });
    fireEvent.mouseUp(canvas);

    expect(FakeImage.instances.length).toBe(1);
  });

  // -------------------------------------------------------------------
  // LOD
  // -------------------------------------------------------------------
  it("below the LOD zoom threshold, draws the cached downscaled buffer, not the full-resolution image", async () => {
    const { impl } = makeFetchMock(
      makeWorld({ placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } } }),
    );
    const { canvas, stageCtx } = await mountReady(impl);
    await waitFor(() => expect(FakeImage.instances.length).toBe(1));

    act(() => {
      FakeImage.instances[0]!.onload?.();
    });
    await waitFor(() => expect(stageCtx.drawImage).toHaveBeenCalled());

    // Default zoom is 1, below LOD_ZOOM_THRESHOLD (4) -- the extra canvas
    // besides the stage is Solo's small LOD buffer, created synchronously
    // inside the same onload handler.
    const smallCanvas = [...ctxByCanvas.keys()].find((c) => c !== canvas)!;
    expect(smallCanvas).toBeTruthy();
    const lastDraw = stageCtx.drawImage.mock.calls.at(-1)!;
    expect(lastDraw[0]).toBe(smallCanvas);
    expect(lastDraw[0]).not.toBeInstanceOf(FakeImage);
  });

  it("at or above the LOD zoom threshold, draws the full-resolution image instead of the small buffer", async () => {
    const { impl } = makeFetchMock(
      makeWorld({ placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } } }),
    );
    const { canvas, stageCtx } = await mountReady(impl);
    await waitFor(() => expect(FakeImage.instances.length).toBe(1));
    const img = FakeImage.instances[0]!;
    act(() => {
      img.onload?.();
    });
    await waitFor(() => expect(stageCtx.drawImage).toHaveBeenCalled());

    // 1.2^8 ~= 4.30, comfortably past the 4x threshold -- not a
    // floating-point boundary case. Anchored at (5,5), inside Solo's own
    // 10x10 rect: cursor-centred zoom keeps that world point fixed under
    // the cursor as zoom increases, which is exactly what pushes content
    // FAR from the anchor off-screen -- anchoring anywhere outside Solo's
    // own rect would cull Solo itself out partway through the sequence.
    for (let i = 0; i < 8; i++) {
      fireEvent.wheel(canvas, { clientX: 5, clientY: 5, deltaY: -100 });
    }

    await waitFor(() => expect(stageCtx.drawImage.mock.calls.at(-1)![0]).toBe(img));
    const lastDraw = stageCtx.drawImage.mock.calls.at(-1)!;
    expect(lastDraw[0]).toBe(img);
    expect(lastDraw[0]).not.toBeInstanceOf(HTMLCanvasElement);
  });

  // -------------------------------------------------------------------
  // Pan / zoom / fit
  // -------------------------------------------------------------------
  it("computeFit centres the world's bounds in the viewport at the largest zoom that shows all of it", () => {
    // Hand-computed: bounds 50x20 in a 100x100 viewport -- zoom is
    // min(100/50, 100/20) = min(2, 5) = 2; pan centres the remaining space.
    const fit = computeFit({ x: 0, y: 0, width: 50, height: 20 }, { w: 100, h: 100 });
    expect(fit.zoom).toBe(2);
    expect(fit.pan).toEqual({ x: 0, y: 30 });
  });

  it("drag pans the world by the mouse delta", async () => {
    const { impl } = makeFetchMock(
      makeWorld({ placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } } }),
    );
    const { canvas, stageCtx } = await mountReady(impl);
    act(() => {
      FakeImage.instances[0]!.onload?.();
    });
    await waitFor(() => expect(stageCtx.drawImage).toHaveBeenCalled());
    // At zoom=1, pan={0,0}, Solo (x=0,y=0) draws at destination (0,0).
    expect(stageCtx.drawImage.mock.calls.at(-1)!.slice(1, 3)).toEqual([0, 0]);

    // Mousedown on empty space (50,50 is well outside Solo's 10x10 rect) so
    // this pans rather than drags the map. Panning by a POSITIVE delta
    // (toward the bottom-right) -- panning the other way would push Solo's
    // world-tile rect out of the viewport entirely (it sits right at the
    // world origin) and cull it, leaving no new drawImage call to observe
    // and making this assertion pass or fail for the wrong reason.
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 65, clientY: 70 });
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.at(-1)!.slice(1, 3)).toEqual([15, 20]));
    fireEvent.mouseUp(canvas);

    // Movement after mouseup must not keep panning.
    fireEvent.mouseMove(canvas, { clientX: 0, clientY: 0 });
    expect(stageCtx.drawImage.mock.calls.at(-1)!.slice(1, 3)).toEqual([15, 20]);
  });

  it("wheel zooms about the cursor, keeping the world point under it fixed", async () => {
    const { impl } = makeFetchMock(
      makeWorld({ placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } } }),
    );
    const { canvas, stageCtx } = await mountReady(impl);
    act(() => {
      FakeImage.instances[0]!.onload?.();
    });
    await waitFor(() => expect(stageCtx.drawImage).toHaveBeenCalled());

    // Hand-computed: cursor at (50,50), zoom 1 -> 1.2. World point under the
    // cursor before zooming is (50,50) (pan={0,0}); the new pan must keep
    // that same world point under (50,50): newPan = 50 - 50*1.2 = -10.
    fireEvent.wheel(canvas, { clientX: 50, clientY: 50, deltaY: -100 });
    await waitFor(() => expect(stageCtx.drawImage.mock.calls.at(-1)!.slice(1, 3)).toEqual([-10, -10]));

    // A crude "always zoom about the origin" implementation would instead
    // leave pan at {0,0} -- distinct from {-10,-10}, so this tells the two
    // apart.
    expect(stageCtx.drawImage.mock.calls.at(-1)!.slice(1, 3)).not.toEqual([0, 0]);
  });

  it("Fit world sets zoom/pan to the computed fit for the connected landmasses, not singleton rooms", async () => {
    // Two placements whose combined bounds are exactly the 50x20 box
    // computeFit's own unit test above already hand-verifies: zoom 2,
    // pan {0,30}. Both belong to the SAME 2-map component (a landmass),
    // and Ghost is a singleton at an extreme coordinate that would blow
    // the fit out to near-zero zoom if it were included -- proving Fit
    // World fits the landmasses, not literally every placement.
    const { impl } = makeFetchMock(
      makeWorld({
        placements: {
          A: { map: "A", x: 0, y: 0, width: 30, height: 20, component: 0 },
          B: { map: "B", x: 30, y: 0, width: 20, height: 10, component: 0 },
          Ghost: { map: "Ghost", x: 10_000, y: 10_000, width: 5, height: 5, component: 1 },
        },
        components: [
          { index: 0, maps: ["A", "B"], bounds: { x: 0, y: 0, width: 50, height: 20 } },
          { index: 1, maps: ["Ghost"], bounds: { x: 10_000, y: 10_000, width: 5, height: 5 } },
        ],
      }),
    );
    const { canvas, stageCtx } = await mountReady(impl);
    for (const img of FakeImage.instances) act(() => img.onload?.());
    await waitFor(() => expect(stageCtx.drawImage).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Fit world" }));

    // A (0,0) at zoom 2, pan {0,30} draws at destination (0,30).
    await waitFor(() => {
      const call = stageCtx.drawImage.mock.calls.find((c) => c[3] === 30 * 2 && c[4] === 20 * 2);
      expect(call?.slice(1, 3)).toEqual([0, 30]);
    });
    expect(screen.getByText("13%")).toBeTruthy(); // round(2/16*100) = 13
  });

  // -------------------------------------------------------------------
  // Drag to place
  // -------------------------------------------------------------------
  it("dragging a placed map posts its new position, and it survives a reload", async () => {
    const fixture = makeWorld({ placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } } });
    const { impl, calls } = makeFetchMock(fixture);
    const { canvas, unmount } = await mountReady(impl);

    // Grab a point inside Solo (its rect is [0,10)x[0,10)) and drop it at
    // world (20,20) -- grabbed 5 tiles in from its origin, so it should
    // land at (15,15), not snap its origin to the cursor.
    fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);

    await waitFor(() => expect(calls.some((c) => c.url === "/api/world/placement")).toBe(true));
    const post = calls.find((c) => c.url === "/api/world/placement")!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ map: "Solo", x: 15, y: 15 });

    // Reload: unmount and remount against the SAME stateful mock, which now
    // answers /api/world with Solo at its new position -- exactly what a
    // real page reload does against the real server after a real POST.
    unmount();
    const after = await mountReady(impl);
    for (const img of FakeImage.instances) act(() => img.onload?.());
    await waitFor(() => expect(after.stageCtx.drawImage).toHaveBeenCalled());

    // At zoom=1, pan={0,0}: Solo at (15,15) draws at destination (15,15).
    expect(after.stageCtx.drawImage.mock.calls.at(-1)!.slice(1, 3)).toEqual([15, 15]);
  });

  // -------------------------------------------------------------------
  // Dungeon toggle + side rail
  // -------------------------------------------------------------------
  it("lists singleton maps absent from placements in the side rail, and lets one be dragged onto the canvas", async () => {
    // Simulates the dungeons-off server response: Hidden is a singleton
    // component but is NOT a key in `placements` -- Placed is both.
    const fixture = makeWorld({
      placements: { Placed: { map: "Placed", x: 0, y: 0, width: 10, height: 10, component: 0 } },
      components: [
        { index: 0, maps: ["Placed"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
        { index: 1, maps: ["Hidden"], bounds: { x: 999, y: 999, width: 8, height: 6 } },
      ],
      dungeonAutoLayout: false,
    });
    const { impl, calls } = makeFetchMock(fixture);
    const { canvas } = await mountReady(impl);

    const row = screen.getByRole("button", { name: "Hidden" });
    expect(row).toBeTruthy(); // side rail lists it
    expect(screen.queryByRole("button", { name: "Placed" })).toBeNull(); // already-placed maps are not in the rail

    const dataTransfer = { store: new Map<string, string>(), setData(k: string, v: string) { this.store.set(k, v); }, getData(k: string) { return this.store.get(k) ?? ""; } };
    fireEvent.dragStart(row, { dataTransfer });
    fireEvent(canvas, makeDropEvent(55, 55, dataTransfer));

    // Dropped at world (55,55) with Hidden's own 8x6 size (from its
    // singleton component's bounds) centred under the cursor:
    // round(55 - 8/2)=51, round(55 - 6/2)=52.
    await waitFor(() => expect(calls.some((c) => c.url === "/api/world/placement")).toBe(true));
    const post = calls.find((c) => c.url === "/api/world/placement")!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ map: "Hidden", x: 51, y: 52 });

    // Optimistic local update: Hidden is now "placed", so it drops out of
    // the rail immediately, without waiting on the POST's response.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Hidden" })).toBeNull());
  });

  it("the dungeon-layout switch reflects the sidecar's stored state and toggles on click", async () => {
    const { impl } = makeFetchMock(makeWorld({ placements: {}, dungeonAutoLayout: false }));
    await mountReady(impl);

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByText(/off/)).toBeTruthy();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByText(/dungeon auto-layout on/i)).toBeTruthy();

    // The click also changes dungeonsOverride, which re-fires /api/world --
    // wait for that second request to actually land before the test ends,
    // or its resolution (and the resulting re-render/redraw) lands after
    // this test's own afterEach has restored the real, unmocked
    // HTMLCanvasElement.getContext, which jsdom logs a warning for.
    await waitFor(() => expect(impl).toHaveBeenCalledTimes(2));
  });

  // -------------------------------------------------------------------
  // Conflict badges
  // -------------------------------------------------------------------
  it("draws a marker for every conflict and shows a tooltip naming both disagreeing paths", async () => {
    const { impl } = makeFetchMock(
      makeWorld({
        placements: { Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 } },
        conflicts: [{ map: "Solo", viaA: { from: "RouteA", x: 1, y: 1 }, viaB: { from: "RouteB", x: 2, y: 2 } }],
      }),
    );
    const { canvas, stageCtx } = await mountReady(impl);

    // Badge colour is the fallback hex (jsdom's getComputedStyle resolves
    // no stylesheet in this test environment, so WorldCanvas's own `||
    // "#ef4444"` fallback is what actually runs -- pinned here, not just
    // "some colour changed").
    await waitFor(() => expect(stageCtx.fillLog).toContain("#ef4444"));

    // Diamond centre: p.x=0,y=0,w=10,h=10 at zoom=1,pan={0,0} ->
    // cx = 0+10-10 = 0, cy = 0+10 = 10.
    fireEvent.mouseMove(canvas, { clientX: 0, clientY: 10 });
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("RouteA");
    expect(tooltip.textContent).toContain("RouteB");

    fireEvent.mouseMove(canvas, { clientX: 90, clientY: 90 });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  // -------------------------------------------------------------------
  // Dive / emerge badges
  // -------------------------------------------------------------------
  it("draws dive and emerge vertical links as distinctly-coloured badges, not as adjacency", async () => {
    const { impl } = makeFetchMock(
      makeWorld({
        placements: {
          DiveMap: { map: "DiveMap", x: 0, y: 0, width: 10, height: 10, component: 0 },
          EmergeMap: { map: "EmergeMap", x: 50, y: 0, width: 10, height: 10, component: 1 },
        },
        verticalLinks: [
          { from: "DiveMap", to: "SomeCave", direction: "dive" },
          { from: "EmergeMap", to: "SomeOtherCave", direction: "emerge" },
        ],
      }),
    );
    const { stageCtx } = await mountReady(impl);

    await waitFor(() => expect(stageCtx.fillLog.length).toBeGreaterThanOrEqual(2));
    // Fallback hexes (no stylesheet in the test environment): dive mirrors
    // --overlay-elevation-low, emerge mirrors --overlay-elevation-high --
    // two DIFFERENT colours, proving the two kinds are told apart rather
    // than sharing one generic "there's a link here" mark.
    expect(stageCtx.fillLog).toContain("#3b82f6");
    expect(stageCtx.fillLog).toContain("#f97316");
    expect(new Set(stageCtx.fillLog).size).toBeGreaterThan(1);
  });

  // -------------------------------------------------------------------
  // component: -1 orphan handling (audit note)
  // -------------------------------------------------------------------
  it("recovers a component:-1 placement's real size from its singleton component instead of treating it as 0x0", async () => {
    // Mirrors applySidecar's documented placeholder shape exactly
    // (packages/core/test/world/sidecar.test.ts): a manual placement for a
    // map absent from the base/auto set carries width:0, height:0,
    // component:-1. Ghost's true size (8x6) is only knowable via its
    // singleton component's bounds.
    const { impl } = makeFetchMock(
      makeWorld({
        placements: { Ghost: { map: "Ghost", x: 5, y: 5, width: 0, height: 0, component: -1 } },
        components: [{ index: 0, maps: ["Ghost"], bounds: { x: 5, y: 5, width: 8, height: 6 } }],
      }),
    );
    const { canvas } = await mountReady(impl);

    // If sizeOfPlacement did NOT recover the real size, Ghost's rect would
    // be zero-area and this hover would hit nothing.
    fireEvent.mouseMove(canvas, { clientX: 7, clientY: 7 });
    const status = await screen.findByText(/Ghost/);
    // componentOfPlacement must not index components[-1] directly (that
    // would silently be undefined, and undefined.maps.length would throw,
    // not render this text at all) -- -1 is reported as unknown, not
    // crashed past.
    expect(status.textContent).toMatch(/manual placement/i);
  });

  it("does not crash on a component:-1 placement whose map is entirely unknown", async () => {
    // Genuinely reachable case per the audit note: a manually-placed map
    // renamed or removed from the project. No component anywhere names it,
    // so its size is truly unrecoverable -- this must render without
    // throwing, not fetch or draw it, and not corrupt anything else.
    const { impl } = makeFetchMock(
      makeWorld({
        placements: {
          Removed: { map: "Removed", x: 5, y: 5, width: 0, height: 0, component: -1 },
          Solo: { map: "Solo", x: 0, y: 0, width: 10, height: 10, component: 0 },
        },
        components: [{ index: 0, maps: ["Solo"], bounds: { x: 0, y: 0, width: 10, height: 10 } }],
      }),
    );
    const { container } = await mountReady(impl);
    // Still counts as "placed" (the sidecar has a stored position for it)
    // even though it is unrenderable -- distinct from being silently
    // dropped from the count entirely. Reads the status strip's full
    // textContent directly rather than screen.getByText: the count sits
    // inside a nested <strong>, and RTL's default text matcher only
    // concatenates an element's OWN direct text-node children, not a
    // descendant element's -- "placed " and "2" are on opposite sides of
    // that boundary.
    const status = container.querySelector(".world-canvas__status")!;
    expect(status.textContent).toMatch(/placed 2/);
    // And Solo -- an unrelated, well-formed placement -- still renders
    // normally alongside it.
    await waitFor(() => expect(FakeImage.instances.some((i) => i.src.includes("Solo"))).toBe(true));
  });
});
