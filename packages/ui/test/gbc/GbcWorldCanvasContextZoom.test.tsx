import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { GbcWorldCanvas, type GbcWorldCanvasProps } from "../../src/gbc/GbcWorldCanvas.js";
import type { MapView } from "../../src/components/mapView.js";

// Plan 8 Task 2 (M6): in-context +/- from a non-level zoom (after a wheel). Harness copied from GbcWorldCanvasContext.test.tsx.
// Zoom here is px per BLOCK, native 32. Viewport 200x200; the initial fit of the one 20x10-block component is zoom 10,
// pan (0, 50), so MapA covers x [0,100), y [50,150) and MapB x [100,200), y [50,150) in screen px.

const VIEWPORT_SIZE = 200;
const WORLD: GbcWorldPayload = {
  family: "gbc",
  blockPx: 32,
  placements: {
    MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
    MapB: { map: "MapB", x: 10, y: 0, width: 10, height: 10, component: 0, mapType: "ROUTE", manual: false },
  },
  components: [{ index: 0, maps: ["MapA", "MapB"], bounds: { x: 0, y: 0, width: 20, height: 10 } }],
  conflicts: [], sidecar: { dungeonAutoLayout: true },
};

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
function makeFetch(warps: Record<string, unknown[]> = {}) {
  return vi.fn((url: string) => {
    if (url === "/api/world") return ok(WORLD);
    const w = /^\/api\/warps\/(.+)$/.exec(url);
    if (w) return ok({ family: "gbc", mapName: decodeURIComponent(w[1]!), warps: warps[decodeURIComponent(w[1]!)] ?? [] });
    if (url.startsWith("/api/map/")) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

interface FakeCtx { imageSmoothingEnabled: boolean; drawImage: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn>; [k: string]: unknown }
const ctxByCanvas = new Map<HTMLCanvasElement, FakeCtx>();
class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  onload: (() => void) | null = null;
  constructor() { FakeImage.instances.push(this); }
}
class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error -- test stub, narrower than the real overload set
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== "2d") return null;
    let ctx = ctxByCanvas.get(this);
    if (!ctx) {
      ctx = new Proxy({ imageSmoothingEnabled: true, drawImage: vi.fn(), clearRect: vi.fn() } as FakeCtx, {
        get: (t, k) => (k in t ? t[k as string] : (t[k as string] = vi.fn())),
      });
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
});

const RECT = { left: 0, top: 0, right: VIEWPORT_SIZE, bottom: VIEWPORT_SIZE, width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, x: 0, y: 0, toJSON() {} };
const boxAt = (top: number) => ({ ...RECT, top, y: top, bottom: top + VIEWPORT_SIZE });

async function mount(props: Partial<GbcWorldCanvasProps> = {}, impl = makeFetch()) {
  vi.stubGlobal("fetch", impl);
  const utils = render(<GbcWorldCanvas time="day" {...props} />);
  const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => RECT;
  await waitFor(() => expect(screen.getByText(/1 components/)).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(/zoom 3%/)).toBeNull()); // the initial fit has been applied (zoom 10 = 31%)
  const rerenderWith = (next: Partial<GbcWorldCanvasProps>) => utils.rerender(<GbcWorldCanvas time="day" {...next} />);
  return { ...utils, canvas, rerenderWith, fetcher: impl };
}

/** What the overlay hands the host's renderCanvas: the controlled GbcMapCanvas view. */
function probe() {
  const views: MapView[] = [];
  const onViewChanges: Array<(v: MapView) => void> = [];
  const renderCanvas = (view: MapView, onViewChange: (v: MapView) => void) => {
    views.push(view);
    onViewChanges.push(onViewChange);
    return <div data-testid="ov-canvas" data-view={JSON.stringify(view)} />;
  };
  const current = () => JSON.parse(screen.getByTestId("ov-canvas").getAttribute("data-view")!) as MapView;
  return { renderCanvas, views, current, change: (v: MapView) => act(() => onViewChanges.at(-1)!(v)) };
}
const ctxOf = (renderCanvas: ReturnType<typeof probe>["renderCanvas"], onExitRequest = vi.fn(), origin: { x: number; y: number } | null = { x: 32, y: 32 }) =>
  ({ map: "MapB", origin, renderCanvas, onExitRequest });
const status = (container: HTMLElement) => container.querySelector(".world-canvas__status")!.textContent!;
const lastDraw = (canvas: HTMLCanvasElement) => ctxByCanvas.get(canvas)!.drawImage.mock.calls.at(-1)!;

describe("GbcWorldCanvas: in-context +/- from a non-level zoom (Plan 8 M6)", () => {
  async function wheeledOut() {
    const p = probe();
    const { canvas } = await mount({ context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    p.change({ zoom: 4, pan: { x: 0, y: 0 } }); // 128 px/block
    await waitFor(() => expect(p.current().zoom).toBe(4));
    fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: 100 }); // 128 / 1.2: overlay zoom 3.33, between 2x and 4x
    await waitFor(() => expect(p.current().zoom).toBeCloseTo(10 / 3, 5));
    return { canvas };
  }
  const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

  it("+ steps up to 4x (not down to 1x)", async () => {
    const { canvas } = await wheeledOut();
    fireEvent.keyDown(canvas, { key: "+" });
    await waitFor(() => expect(pressed("4×")).toBe("true"));
  });

  it("- steps down to 2x", async () => {
    const { canvas } = await wheeledOut();
    fireEvent.keyDown(canvas, { key: "-" });
    await waitFor(() => expect(pressed("2×")).toBe("true"));
  });
});
