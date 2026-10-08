import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { GbcWorldCanvas, type GbcWorldCanvasProps } from "../../src/gbc/GbcWorldCanvas.js";
import type { MapView } from "../../src/components/mapView.js";

// Plan 7 Task 5b: the GBC world canvas's in-context edit mode, the twin of WorldCanvasContext.test.tsx (6c E4).
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
  conflicts: [],
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

describe("GbcWorldCanvas: Edit here and double-click (Plan 7 Task 5b)", () => {
  it("a plain double-click on a map body calls onEditHere with that map and not onOpenMap; empty space does not", async () => {
    const onEditHere = vi.fn(), onOpenMap = vi.fn();
    const { canvas } = await mount({ onEditHere, onOpenMap });
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 10 }); // above the maps (y < 50)
    expect(onEditHere).not.toHaveBeenCalled();
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });
    expect(onEditHere).toHaveBeenCalledTimes(1);
    expect(onEditHere).toHaveBeenCalledWith("MapB");
    expect(onOpenMap).not.toHaveBeenCalled();
  });

  it("Shift+double-click opens the map in Map view and does not edit; Ctrl and Meta do neither", async () => {
    const onEditHere = vi.fn(), onOpenMap = vi.fn();
    const { canvas } = await mount({ onEditHere, onOpenMap });
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100, shiftKey: true });
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    expect(onOpenMap).toHaveBeenCalledWith("MapB");
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100, ctrlKey: true });
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100, metaKey: true });
    expect(onEditHere).not.toHaveBeenCalled();
    expect(onOpenMap).toHaveBeenCalledTimes(1);
  });

  it("a double-click at the end of a drag does not edit", async () => {
    const onEditHere = vi.fn();
    const { canvas } = await mount({ onEditHere });
    fireEvent.mouseDown(canvas, { clientX: 190, clientY: 190, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 191, clientY: 191 });
    fireEvent.mouseUp(canvas);
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });
    expect(onEditHere).not.toHaveBeenCalled();
  });

  it("without onEditHere (Dungeon mode) a plain double-click still opens the map", async () => {
    const onOpenMap = vi.fn();
    const { canvas } = await mount({ onOpenMap });
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });
    expect(onOpenMap).toHaveBeenCalledWith("MapB");
  });

  it("with warps on, a double-click on a warp marker previews and does NOT call onEditHere; elsewhere on the map body it does", async () => {
    const onEditHere = vi.fn();
    const warp = { x: 2, y: 2, mapConst: "MAP_A", destWarp: 1, lineIndex: 1, destMapName: "MapA", destEvent: { x: 1, y: 1, mapConst: "MAP_B", destWarp: 1, lineIndex: 1 } };
    const { canvas, container } = await mount({ onEditHere }, makeFetch({ MapB: [warp] }));
    fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
    await waitFor(() => expect(container.querySelectorAll(".world-canvas__warp-marker").length).toBe(1));
    const marker = container.querySelector(".world-canvas__warp-marker") as HTMLElement;
    const mx = parseFloat(marker.style.left), my = parseFloat(marker.style.top);
    fireEvent.doubleClick(canvas, { clientX: mx + 2, clientY: my }); // inside MapB's body AND within the marker radius
    expect(screen.getByRole("dialog", { name: "MapA preview" })).toBeTruthy();
    expect(onEditHere).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.doubleClick(canvas, { clientX: mx + 40, clientY: my }); // inside MapB's body, past the marker radius
    expect(onEditHere).toHaveBeenCalledTimes(1);
    expect(onEditHere).toHaveBeenCalledWith("MapB");
  });

  it("the context menu's Edit here is enabled (no Plan 7 hint) and calls onEditHere, snapping at the menu's open position", async () => {
    const onEditHere = vi.fn();
    const p = probe();
    const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
    fireEvent.contextMenu(canvas, { clientX: 150, clientY: 100 });
    const item = screen.getByRole("menuitem", { name: "Edit here" }) as HTMLButtonElement;
    expect(item.disabled).toBe(false);
    expect(item.textContent).not.toContain("Plan 7");
    fireEvent.click(item);
    expect(onEditHere).toHaveBeenCalledWith("MapB");
    rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) });
    // zoom 10 snaps to 1x = 32 px/block. MapB (10,0) 10x10: centre (15, 5) blocks * 32 = (480, 160); pan = (150-480, 100-160) = (-330, -60).
    // GbcMapCanvas view = (10*32 - 330 - 32, 0 - 60 - 32) = (-42, -92), zoom 1.
    await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -42, y: -92 } }));
  });

  it("with no onEditHere the menu offers no Edit here", async () => {
    const { canvas } = await mount({ onOpenMap: vi.fn() });
    fireEvent.contextMenu(canvas, { clientX: 150, clientY: 100 });
    expect(screen.queryByRole("menuitem", { name: /Edit here/ })).toBeNull();
  });

  it("the ContextMenu key's Edit here snaps at the selected map's screen centre", async () => {
    const onEditHere = vi.fn();
    const p = probe();
    const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
    fireEvent.click(canvas, { clientX: 150, clientY: 100 }); // select MapB
    fireEvent.keyDown(canvas, { key: "ContextMenu" }); // opens at MapB's centre: (15*10, 5*10+50) = (150, 100)
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
    rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -42, y: -92 } })); // as above, pointer (150, 100)
  });
});

describe("GbcWorldCanvas: in-context overlay (Plan 7 Task 5b)", () => {
  it("renders no overlay without the context prop", async () => {
    const { container } = await mount({});
    expect(container.querySelector(".world-canvas__context")).toBeNull();
  });

  it("renders the overlay inside the viewport box with the dim layer and a labelled bar (map name, 1x/2x/4x, Done)", async () => {
    const p = probe();
    const { container } = await mount({ context: ctxOf(p.renderCanvas) });
    const overlay = container.querySelector(".world-canvas__viewport > .world-canvas__context")!;
    expect(overlay).not.toBeNull();
    const dim = overlay.querySelector(".world-canvas__context-dim")!;
    expect(dim.getAttribute("aria-hidden")).toBe("true");
    const bar = overlay.querySelector(".world-canvas__context-bar")!;
    expect(bar.textContent).toContain("MapB");
    expect([...bar.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["1×", "2×", "4×", "Done"]);
    expect(screen.getByRole("group", { name: "Editing MapB in place" })).toBe(bar);
    expect(screen.getByRole("button", { name: "Done editing MapB" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
  });

  it("with no payload yet (origin null) shows only the dim layer and the bar, and does not snap", async () => {
    const p = probe();
    const { container } = await mount({ context: ctxOf(p.renderCanvas, vi.fn(), null) });
    expect(container.querySelector(".world-canvas__context-dim")).not.toBeNull();
    expect(container.querySelector(".world-canvas__context-bar")).not.toBeNull();
    expect(screen.queryByTestId("ov-canvas")).toBeNull();
    expect(p.views).toHaveLength(0);
    expect(status(container)).toContain("zoom 31%"); // still the pre-snap world
  });

  it("keeps the SAME world canvas node when the overlay appears and goes, and does not refetch /api/world", async () => {
    const p = probe();
    const { canvas, container, rerenderWith, fetcher } = await mount({});
    const before = container.querySelector("canvas.world-canvas__stage");
    expect(before).toBe(canvas);
    rerenderWith({ context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    expect(container.querySelector("canvas.world-canvas__stage")).toBe(before);
    rerenderWith({});
    expect(container.querySelector("canvas.world-canvas__stage")).toBe(before);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/world")).toHaveLength(1);
  });

  it("snaps the world once, to the viewport centre when no pointer was recorded, and the overlay never renders at the pre-snap view", async () => {
    const p = probe();
    const { canvas, container } = await mount({ context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    // zoom 10 -> 1x (32 px/block). MapB centre (15, 5)*32 = (480, 160); pan = (100-480, 100-160) = (-380, -60).
    // GbcMapCanvas view: pan = (10*32 - 380 - 32*1, 0 - 60 - 32*1) = (-92, -92), zoom 1.
    expect(p.current()).toEqual({ zoom: 1, pan: { x: -92, y: -92 } });
    expect(p.views[0]).toEqual({ zoom: 1, pan: { x: -92, y: -92 } });
    expect(status(container)).toContain("zoom 100%");
    await waitFor(() => expect(FakeImage.instances.length).toBeGreaterThanOrEqual(1));
    act(() => { for (const img of FakeImage.instances) img.onload?.(); });
    // The world's own stage draws MapB at (10*32 - 380, -60) = (-60, -60), 320x320 (10 blocks of 32).
    await waitFor(() => expect(lastDraw(canvas).slice(1)).toEqual([-60, -60, 320, 320]));
  });

  it("snaps at the recorded double-click pointer", async () => {
    const onEditHere = vi.fn();
    const p = probe();
    const { canvas, rerenderWith } = await mount({ onEditHere });
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });
    rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -42, y: -92 } })); // pan (-330, -60), see the menu test
  });

  it("an overlay view change moves the world in lock-step: zoom 32*z, pan from worldViewFromMapView", async () => {
    const p = probe();
    const { canvas, container } = await mount({ context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    p.change({ zoom: 2, pan: { x: -100, y: 40 } });
    // zoom 64; pan = (-100 + 32*2 - 10*64, 40 + 32*2 - 0) = (-100 + 64 - 640, 104) = (-676, 104).
    // Back through mapViewFromWorld: (10*64 - 676 - 64, 0 + 104 - 64) = (-100, 40).
    await waitFor(() => expect(p.current()).toEqual({ zoom: 2, pan: { x: -100, y: 40 } }));
    expect(status(container)).toContain("zoom 200%");
    await waitFor(() => expect(FakeImage.instances.length).toBeGreaterThanOrEqual(1));
    act(() => { for (const img of FakeImage.instances) img.onload?.(); });
    await waitFor(() => expect(lastDraw(canvas).slice(1)).toEqual([-36, 104, 640, 640])); // MapB at 10*64 - 676 = -36, 10 blocks of 64
  });

  it("the 1x/2x/4x buttons zoom about the overlay centre and report the zoom the overlay shows", async () => {
    const p = probe();
    await mount({ context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    expect(screen.getByRole("button", { name: "1×" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    // zoomAboutPivot({1,(-92,-92)}, 4, 100, 100): cx = (100+92)/1 = 192 -> 100 - 768 = -668, same for y.
    await waitFor(() => expect(p.current()).toEqual({ zoom: 4, pan: { x: -668, y: -668 } }));
    expect(screen.getByRole("button", { name: "4×" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1×" }).getAttribute("aria-pressed")).toBe("false");
  });

  describe("zoom clamp", () => {
    it("in context a wheel-in at 128 px/block (a 4x session) stays at 128, a wheel-out gives 128 / 1.2, and the cap above 32 is real", async () => {
      const p = probe();
      const { canvas, container } = await mount({ context: ctxOf(p.renderCanvas) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
      expect(status(container)).toContain("zoom 120%"); // 32 * 1.2 = 38.4 -> past the outside cap of 32
      p.change({ zoom: 4, pan: { x: 0, y: 0 } });
      await waitFor(() => expect(status(container)).toContain("zoom 400%"));
      fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
      expect(status(container)).toContain("zoom 400%"); // an upper bound of 32 would give 100%; 128 * 1.2 uncapped 480%
      fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: 100 });
      await waitFor(() => expect(status(container)).toContain("zoom 333%")); // 128 / 1.2 = 106.67 -> 333%
    });

    it("the +/- keys respect the same bounds (a + at 128 does not jump down to 32)", async () => {
      const p = probe();
      const { canvas, container } = await mount({ context: ctxOf(p.renderCanvas) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      p.change({ zoom: 4, pan: { x: 0, y: 0 } });
      await waitFor(() => expect(status(container)).toContain("zoom 400%"));
      fireEvent.keyDown(canvas, { key: "+" });
      expect(status(container)).toContain("zoom 400%");
    });

    it("after leaving context the leftover 128 is not clamped down by a wheel-in", async () => {
      const p = probe();
      const { canvas, container, rerenderWith } = await mount({ context: ctxOf(p.renderCanvas) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      p.change({ zoom: 4, pan: { x: 0, y: 0 } });
      await waitFor(() => expect(status(container)).toContain("zoom 400%"));
      rerenderWith({});
      fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
      expect(status(container)).toContain("zoom 400%");
    });

    it("outside context the cap is 32 px/block (100%)", async () => {
      const { canvas, container } = await mount({});
      for (let i = 0; i < 40; i++) fireEvent.wheel(canvas, { clientX: 100, clientY: 100, deltaY: -100 });
      await waitFor(() => expect(status(container)).toContain("zoom 100%"));
    });
  });

  describe("exit requests", () => {
    it("Done calls onExitRequest once", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctxOf(p.renderCanvas, onExitRequest) });
      fireEvent.click(screen.getByRole("button", { name: "Done editing MapB" }));
      expect(onExitRequest).toHaveBeenCalledTimes(1);
    });

    it("Escape calls it once; an Escape another handler already prevented does not", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      // Registered before the mount, so (both are window capture listeners) it runs before the context listener.
      let preventing = false;
      const prevent = (e: KeyboardEvent) => { if (preventing) e.preventDefault(); };
      window.addEventListener("keydown", prevent, true);
      try {
        await mount({ context: ctxOf(p.renderCanvas, onExitRequest) });
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onExitRequest).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(window, { key: "Enter" });
        expect(onExitRequest).toHaveBeenCalledTimes(1);
        preventing = true;
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onExitRequest).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener("keydown", prevent, true);
      }
    });

    it("Escape is judged in the capture phase: a document listener that removes the modal on Escape (React's flush) does not let it through", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctxOf(p.renderCanvas, onExitRequest) });
      const modal = document.createElement("div");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      const flush = (e: KeyboardEvent) => { if (e.key === "Escape") modal.remove(); };
      document.addEventListener("keydown", flush); // bubble: runs after capture, before a window bubble listener
      fireEvent.keyDown(modal, { key: "Escape" });
      document.removeEventListener("keydown", flush);
      expect(modal.isConnected).toBe(false);
      expect(onExitRequest).not.toHaveBeenCalled();
    });

    it("Escape that closes an open context menu does not also request an exit", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      const { canvas } = await mount({ onOpenMap: vi.fn(), context: ctxOf(p.renderCanvas, onExitRequest) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      // MapB is snapped to x [-60, 260), y [-60, 260); this point is inside it.
      fireEvent.contextMenu(canvas, { clientX: 100, clientY: 100 });
      expect(screen.getByRole("menu")).toBeTruthy();
      expect(fireEvent.keyDown(document.activeElement!, { key: "Escape" })).toBe(false);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(onExitRequest).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onExitRequest).toHaveBeenCalledTimes(1);
    });

    it.each(["input", "textarea", "select"])("from a <%s> does not request an exit", async (tag) => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctxOf(p.renderCanvas, onExitRequest) });
      const field = document.body.appendChild(document.createElement(tag));
      fireEvent.keyDown(field, { key: "Escape" });
      field.remove();
      expect(onExitRequest).not.toHaveBeenCalled();
    });

    it("the Escape listener lives only while in context", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      const { rerenderWith } = await mount({ context: ctxOf(p.renderCanvas, onExitRequest) });
      rerenderWith({});
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onExitRequest).not.toHaveBeenCalled();
    });

    it("a double-click on the overlay outside the map rect calls it; inside the rect or on the bar does not", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      const { container } = await mount({ context: ctxOf(p.renderCanvas, onExitRequest) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      const overlay = container.querySelector(".world-canvas__context") as HTMLElement;
      overlay.getBoundingClientRect = () => RECT;
      // Snapped at the viewport centre: MapB's rect is x [-60, 260), y [-60, 260) (see the snap test).
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 100, clientY: 100 });
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 0, clientY: 0 });
      fireEvent.doubleClick(screen.getByRole("button", { name: "2×" }), { clientX: 400, clientY: 400 }); // on the bar, outside the rect
      expect(onExitRequest).not.toHaveBeenCalled();
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 260, clientY: 100 }); // right edge is exclusive
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 100, clientY: 260 }); // bottom edge is exclusive
      expect(onExitRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe("snap uses the canvas box as it is when the payload (and so the chrome) arrives", () => {
    it("waits for context.origin, then converts the recorded client pointer with the shifted box", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, container, rerenderWith } = await mount({ onEditHere });
      canvas.getBoundingClientRect = () => boxAt(58); // already shifted when the user double-clicks
      fireEvent.doubleClick(canvas, { clientX: 150, clientY: 158 }); // canvas-relative (150, 100): inside MapB
      expect(onEditHere).toHaveBeenCalledWith("MapB");

      rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas, vi.fn(), null) }); // payload not loaded: no snap yet
      await act(async () => { await Promise.resolve(); });
      expect(p.views).toHaveLength(0);
      expect(status(container)).toContain("zoom 31%");

      canvas.getBoundingClientRect = () => boxAt(116); // the chrome mounted and moved the canvas down again
      rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) });
      // pointer = client (150, 158) - box (0, 116) = (150, 42); MapB centre (480, 160) -> pan (-330, -118);
      // view = (10*32 - 330 - 32, -118 - 32) = (-42, -150).
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -42, y: -150 } }));
    });

    it("the right-click menu's open point is recorded in client px too", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
      canvas.getBoundingClientRect = () => boxAt(58);
      fireEvent.contextMenu(canvas, { clientX: 150, clientY: 158 }); // canvas-relative (150, 100)
      fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
      canvas.getBoundingClientRect = () => boxAt(116);
      rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) });
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -42, y: -150 } }));
    });

    it("a later entry does not reuse an earlier pointer: with none recorded the canvas centre is used", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, rerenderWith } = await mount({ onEditHere });
      fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });
      rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) });
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -42, y: -92 } }));
      rerenderWith({ onEditHere });
      rerenderWith({ onEditHere, context: ctxOf(p.renderCanvas) }); // entered some other way: nothing recorded
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -92, y: -92 } })); // centre fallback
    });
  });

  it("re-entering at the leftover 4x zoom snaps to 4x (the zoom is not forced back to 1x)", async () => {
    const p = probe();
    const { rerenderWith } = await mount({ context: ctxOf(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(p.current().zoom).toBe(4));
    rerenderWith({});
    expect(screen.queryByTestId("ov-canvas")).toBeNull();
    rerenderWith({ context: ctxOf(p.renderCanvas) });
    // snapContextZoom(128, 32) = 4; centre fallback (100, 100): MapB centre (15, 5)*128 = (1920, 640) -> pan (-1820, -540);
    // view = (10*128 - 1820 - 32*4, -540 - 32*4) = (-668, -668).
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    expect(p.current()).toEqual({ zoom: 4, pan: { x: -668, y: -668 } });
  });

  it("leaving context returns focus to the world canvas; a canvas that never had a context does not take focus", async () => {
    const p = probe();
    const { canvas, rerenderWith } = await mount({ context: ctxOf(p.renderCanvas) });
    screen.getByRole("button", { name: "Done editing MapB" }).focus();
    rerenderWith({});
    expect(document.activeElement).toBe(canvas);
    const other = await mount({});
    expect(document.activeElement).not.toBe(other.canvas);
  });
});

describe("GbcWorldCanvas: tileVersions (Plan 7 Task 5b)", () => {
  const srcs = () => FakeImage.instances.map((i) => i.src).sort();

  it("a bumped version re-requests exactly that map, as &v=<n>, and nothing else", async () => {
    const { rerenderWith } = await mount({});
    await waitFor(() => expect(FakeImage.instances).toHaveLength(2));
    expect(srcs()).toEqual(["/api/render/MapA.png?time=day", "/api/render/MapB.png?time=day"]);

    rerenderWith({ tileVersions: { MapB: 1 } });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(3));
    expect(FakeImage.instances[2]!.src).toBe("/api/render/MapB.png?time=day&v=1");

    rerenderWith({ tileVersions: { MapB: 1 } }); // equal content, new object: no request
    rerenderWith({ tileVersions: { MapB: 2 } });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(4));
    expect(FakeImage.instances[3]!.src).toBe("/api/render/MapB.png?time=day&v=2");
    expect(FakeImage.instances.map((i) => i.src).filter((s) => s.includes("MapA.png"))).toEqual(["/api/render/MapA.png?time=day"]);
  });

  it("every load of a versioned map keeps its &v, including the first after mount and the reload after a time switch", async () => {
    const { rerender } = await mount({ tileVersions: { MapB: 3 } });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(2));
    expect(srcs()).toEqual(["/api/render/MapA.png?time=day", "/api/render/MapB.png?time=day&v=3"]);
    rerender(<GbcWorldCanvas time="nite" tileVersions={{ MapB: 3 }} />);
    await waitFor(() => expect(FakeImage.instances).toHaveLength(4));
    expect(FakeImage.instances.slice(2).map((i) => i.src).sort()).toEqual(["/api/render/MapA.png?time=nite", "/api/render/MapB.png?time=nite&v=3"]);
  });
});
