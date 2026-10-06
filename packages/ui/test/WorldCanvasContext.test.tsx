import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { WorldCanvas, type WorldCanvasProps } from "../src/components/WorldCanvas.js";
import type { MapView } from "../src/components/mapView.js";

// Plan 6c E4: the GBA world canvas's in-context edit mode -- the "edit here" entry points, the overlay, the snap, the
// zoom clamp, the exits and the per-map tile refresh. Fixtures are this file's own (WorldCanvas.test.tsx keeps its own
// private). Viewport 100x100, zoom 1, pan 0: A [0,10)^2 and B [20,23)^2 in screen px.

const VIEWPORT_SIZE = 100;
const WORLD = {
  placements: {
    A: { map: "A", x: 0, y: 0, width: 10, height: 10, component: 0 },
    B: { map: "B", x: 20, y: 0, width: 3, height: 3, component: 1 },
  },
  components: [
    { index: 0, maps: ["A"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
    { index: 1, maps: ["B"], bounds: { x: 20, y: 0, width: 3, height: 3 } },
  ],
  conflicts: [], verticalLinks: [], sidecar: { version: 1, dungeonAutoLayout: true, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } },
};
const B_LAYOUT = {
  map: { id: "MAP_B", name: "B", layout: "LAYOUT_B" },
  layout: { id: "LAYOUT_B", name: "B_Layout", width: 1, height: 1, borderWidth: 0, borderHeight: 0, primaryTileset: "t1", secondaryTileset: "t2" },
  split: { version: "hns", metatiles: 512, tiles: 512, pals: 12 },
  blocks: [{ metatileId: 0, collision: 0, elevation: 0, behavior: 0 }],
};

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
function makeFetch(warps: Record<string, unknown[]> = {}) {
  return vi.fn((url: string) => {
    if (url.startsWith("/api/world")) return ok(WORLD);
    if (url === "/api/coverage") {
      return ok({ mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [],
        byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 } });
    }
    if (url === "/api/species") return ok([]);
    if (url === "/api/map/B") return ok(B_LAYOUT);
    if (url.startsWith("/api/encounters/")) return ok({ mapName: url.slice(16), mapId: 1, methods: [] });
    const w = /^\/api\/warps\/(.+)$/.exec(url);
    if (w) return ok({ mapName: w[1], warps: warps[decodeURIComponent(w[1]!)] ?? [] });
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

async function mount(props: WorldCanvasProps = {}, impl = makeFetch()) {
  vi.stubGlobal("fetch", impl);
  const utils = render(<WorldCanvas {...props} />);
  await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
  const canvas = utils.container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => RECT;
  await waitFor(() => expect(ctxByCanvas.get(canvas)!.clearRect).toHaveBeenCalled());
  const rerenderWith = (next: WorldCanvasProps) => utils.rerender(<WorldCanvas {...next} />);
  return { ...utils, canvas, rerenderWith };
}

/** What the overlay hands the host's renderCanvas: the controlled MapCanvas view. */
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
const readout = (container: HTMLElement) => container.querySelector(".world-canvas__zoom-readout")!.textContent;
const lastDraw = (canvas: HTMLCanvasElement) => ctxByCanvas.get(canvas)!.drawImage.mock.calls.at(-1)!;

describe("WorldCanvas: onEditHere double-click (Plan 6c E4)", () => {
  it("a plain double-click on a map body calls onEditHere with that map; empty space does not", async () => {
    const onEditHere = vi.fn();
    const { canvas } = await mount({ onEditHere });
    fireEvent.doubleClick(canvas, { clientX: 95, clientY: 95 });
    expect(onEditHere).not.toHaveBeenCalled();
    fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1 });
    expect(onEditHere).toHaveBeenCalledTimes(1);
    expect(onEditHere).toHaveBeenCalledWith("B");
  });

  it("Ctrl, Meta and Shift double-clicks do not call it (Shift opens the map instead)", async () => {
    const onEditHere = vi.fn();
    const onOpenMap = vi.fn();
    const { canvas } = await mount({ onEditHere, onOpenMap });
    fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1, ctrlKey: true });
    fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1, metaKey: true });
    fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1, shiftKey: true });
    expect(onEditHere).not.toHaveBeenCalled();
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    expect(onOpenMap).toHaveBeenCalledWith("B");
  });

  it("a double-click at the end of a drag does not call it", async () => {
    const onEditHere = vi.fn();
    const { canvas } = await mount({ onEditHere });
    fireEvent.mouseDown(canvas, { clientX: 90, clientY: 90, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 91, clientY: 91 });
    fireEvent.mouseUp(canvas);
    fireEvent.doubleClick(canvas, { clientX: 22, clientY: 2 });
    expect(onEditHere).not.toHaveBeenCalled();
  });

  it("without onEditHere a plain double-click does nothing", async () => {
    const { canvas } = await mount({ onOpenMap: vi.fn() });
    expect(() => fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1 })).not.toThrow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("with warps on, a double-click on a warp marker opens the preview and does NOT call onEditHere; elsewhere on the map body it does", async () => {
    const onEditHere = vi.fn();
    const impl = makeFetch({ A: [{ x: 2, y: 3, elevation: 0, destMap: "MAP_B", destWarpId: "0", destMapName: "B" }] });
    const { canvas } = await mount({ onEditHere }, impl);
    fireEvent.click(screen.getByRole("switch", { name: /warps/i }));
    for (let i = 0; i < 8; i++) fireEvent.wheel(canvas, { clientX: 0, clientY: 0, deltaY: -100 }); // pan stays 0; zoom 1.2^8
    await waitFor(() => expect(canvas.parentElement!.querySelectorAll(".world-canvas__warp-marker").length).toBe(1));
    const marker = canvas.parentElement!.querySelector(".world-canvas__warp-marker") as HTMLElement;
    const mx = parseFloat(marker.style.left), my = parseFloat(marker.style.top);

    fireEvent.doubleClick(canvas, { clientX: mx + 3, clientY: my }); // inside A's body AND within the marker radius
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(onEditHere).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Close"));

    fireEvent.doubleClick(canvas, { clientX: mx + 20, clientY: my }); // inside A's body, past the marker radius
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onEditHere).toHaveBeenCalledTimes(1);
    expect(onEditHere).toHaveBeenCalledWith("A");
  });

  it("the context menu's Edit here (right-click) calls onEditHere and snaps at the menu's open position", async () => {
    const onEditHere = vi.fn();
    const p = probe();
    const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
    fireEvent.contextMenu(canvas, { clientX: 22, clientY: 2 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
    expect(onEditHere).toHaveBeenCalledWith("B");
    rerenderWith({ onEditHere, context: { map: "B", origin: { x: 16, y: 16 }, renderCanvas: p.renderCanvas, onExitRequest: vi.fn() } });
    // B (20,0) 3x3 at 16 px/tile: centre (21.5, 1.5)*16 = (344, 24); pan = (22-344, 2-24) = (-322, -22).
    // MapCanvas view = (20*16 + -322 - 16, 0 + -22 - 16) = (-18, -38).
    await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -18, y: -38 } }));
  });

  it("the ContextMenu key's Edit here snaps at the selected map's screen centre", async () => {
    const onEditHere = vi.fn();
    const p = probe();
    const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
    fireEvent.mouseDown(canvas, { clientX: 21, clientY: 1, button: 0, ctrlKey: true }); // select B
    fireEvent.keyDown(canvas, { key: "ContextMenu" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
    rerenderWith({ onEditHere, context: { map: "B", origin: { x: 16, y: 16 }, renderCanvas: p.renderCanvas, onExitRequest: vi.fn() } });
    // The menu opened at B's centre (21.5, 1.5); pan = round(21.5 - 344, 1.5 - 24) = (-322, -22) (-322.5 rounds up).
    await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -18, y: -38 } }));
  });
});

describe("WorldCanvas: in-context overlay (Plan 6c E4)", () => {
  const ctx = (renderCanvas: ReturnType<typeof probe>["renderCanvas"], onExitRequest = vi.fn(), origin: { x: number; y: number } | null = { x: 16, y: 16 }) =>
    ({ map: "B", origin, renderCanvas, onExitRequest });

  it("renders no overlay without the context prop", async () => {
    const { container } = await mount({});
    expect(container.querySelector(".world-canvas__context")).toBeNull();
  });

  it("renders the overlay with the dim layer and the bar (map name, 1x/2x/4x, Done) inside the viewport box", async () => {
    const p = probe();
    const { container } = await mount({ context: ctx(p.renderCanvas) });
    const overlay = container.querySelector(".world-canvas__viewport > .world-canvas__context")!;
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector(".world-canvas__context-dim")).not.toBeNull();
    const bar = overlay.querySelector(".world-canvas__context-bar")!;
    expect(bar.textContent).toContain("B");
    expect([...bar.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["1×", "2×", "4×", "Done"]);
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
  });

  it("with no layout yet (origin null) shows only the dim layer and the bar", async () => {
    const p = probe();
    const { container } = await mount({ context: ctx(p.renderCanvas, vi.fn(), null) });
    expect(container.querySelector(".world-canvas__context-dim")).not.toBeNull();
    expect(container.querySelector(".world-canvas__context-bar")).not.toBeNull();
    expect(screen.queryByTestId("ov-canvas")).toBeNull();
    expect(p.views).toHaveLength(0);
  });

  it("snaps the world view once, to the viewport centre when no pointer was recorded, and draws the map there", async () => {
    const p = probe();
    const { canvas } = await mount({ context: ctx(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    // zoom 1 -> snap 1x (16 px/tile). B centre (21.5, 1.5)*16 = (344, 24); pan = (50-344, 50-24) = (-294, 26).
    // MapCanvas view: pan = (20*16 - 294 - 16*1, 0 + 26 - 16*1) = (10, 10), zoom 1.
    expect(p.current()).toEqual({ zoom: 1, pan: { x: 10, y: 10 } });
    expect(p.views[0]).toEqual({ zoom: 1, pan: { x: 10, y: 10 } }); // the overlay canvas never rendered at the pre-snap (non-1/2/4) zoom
    // The world's own stage draws B at (320-294, 26) = (26, 26), 48x48 (3 tiles at 16 px).
    await waitFor(() => expect(FakeImage.instances.length).toBeGreaterThanOrEqual(1));
    act(() => { for (const img of FakeImage.instances) img.onload?.(); });
    await waitFor(() => expect(lastDraw(canvas).slice(1)).toEqual([26, 26, 48, 48]));
    expect(readout(document.body)).toBe("100%");
  });

  it("snaps at the recorded double-click pointer", async () => {
    const onEditHere = vi.fn();
    const p = probe();
    const { canvas, rerenderWith } = await mount({ onEditHere });
    fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1 });
    rerenderWith({ onEditHere, context: ctx(p.renderCanvas) });
    // pan = (21 - 344, 1 - 24) = (-323, -23); view pan = (320 - 323 - 16, -23 - 16) = (-19, -39).
    await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -19, y: -39 } }));
  });

  it("an overlay view change moves the world in lock-step: zoom 16*z, pan from worldViewFromMapView", async () => {
    const p = probe();
    const { canvas, container } = await mount({ context: ctx(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    p.change({ zoom: 2, pan: { x: -100, y: 40 } });
    // zoom 32; pan = (-100 + 16*2 - 20*32, 40 + 16*2 - 0) = (-100 + 32 - 640, 72) = (-708, 72).
    // The controlled view comes back through mapViewFromWorld: (20*32 + -708 - 32, 0 + 72 - 32) = (-100, 40).
    await waitFor(() => expect(p.current()).toEqual({ zoom: 2, pan: { x: -100, y: 40 } }));
    expect(readout(container)).toBe("200%");
    await waitFor(() => expect(FakeImage.instances.length).toBeGreaterThanOrEqual(1));
    act(() => { for (const img of FakeImage.instances) img.onload?.(); });
    await waitFor(() => expect(lastDraw(canvas).slice(1)).toEqual([-68, 72, 96, 96])); // B at 20*32 - 708 = -68, 3 tiles of 32
  });

  it("the 1x/2x/4x buttons zoom about the overlay centre and report the zoom the overlay shows", async () => {
    const p = probe();
    await mount({ context: ctx(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    expect(screen.getByRole("button", { name: "1×" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    // zoomAboutPivot({1,(10,10)}, 4, 50, 50): cx = (50-10)/1 = 40 -> 50 - 160 = -110, same for y.
    await waitFor(() => expect(p.current()).toEqual({ zoom: 4, pan: { x: -110, y: -110 } }));
    expect(screen.getByRole("button", { name: "4×" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1×" }).getAttribute("aria-pressed")).toBe("false");
  });

  describe("zoom clamp", () => {
    it("a wheel-in at 64 px/tile (a 4x editing session's zoom) stays at 64; a wheel-out gives 64 / 1.2", async () => {
      const p = probe();
      const { canvas, container } = await mount({ context: ctx(p.renderCanvas) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      p.change({ zoom: 4, pan: { x: 0, y: 0 } });
      await waitFor(() => expect(readout(container)).toBe("400%"));
      fireEvent.wheel(canvas, { clientX: 50, clientY: 50, deltaY: -100 });
      expect(readout(container)).toBe("400%"); // an upper bound of 16 would give 16 (100%), 64 * 1.2 uncapped 480%
      fireEvent.wheel(canvas, { clientX: 50, clientY: 50, deltaY: 100 });
      await waitFor(() => expect(readout(container)).toBe("333%")); // 64 / 1.2 = 53.33 -> 333%
    });

    it("the same holds after leaving context: the leftover 64 is not clamped down by a wheel-in", async () => {
      const p = probe();
      const { canvas, container, rerenderWith } = await mount({ context: ctx(p.renderCanvas) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      p.change({ zoom: 4, pan: { x: 0, y: 0 } });
      await waitFor(() => expect(readout(container)).toBe("400%"));
      rerenderWith({});
      fireEvent.wheel(canvas, { clientX: 50, clientY: 50, deltaY: -100 });
      expect(readout(container)).toBe("400%");
    });

    it("and at 16 px/tile (100%) outside it", async () => {
      const { canvas, container } = await mount({});
      for (let i = 0; i < 40; i++) fireEvent.wheel(canvas, { clientX: 50, clientY: 50, deltaY: -100 });
      await waitFor(() => expect(readout(container)).toBe("100%"));
    });
  });

  describe("exit requests", () => {
    it("Done calls onExitRequest once", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctx(p.renderCanvas, onExitRequest) });
      fireEvent.click(screen.getByRole("button", { name: "Done editing B" }));
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
        await mount({ context: ctx(p.renderCanvas, onExitRequest) });
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

    it("Escape does nothing while a modal dialog is open (the GBA modals do not stop propagation)", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctx(p.renderCanvas, onExitRequest) });
      const modal = document.createElement("div");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      fireEvent.keyDown(modal, { key: "Escape" });
      modal.remove();
      expect(onExitRequest).not.toHaveBeenCalled();
    });

    it("Escape that closes an open context menu does not also request an exit, whichever listener runs first", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      const { canvas } = await mount({ onOpenMap: vi.fn(), context: ctx(p.renderCanvas, onExitRequest) });
      fireEvent.contextMenu(canvas, { clientX: 50, clientY: 50 }); // B is snapped to [26,74)^2
      expect(screen.getByRole("menu")).toBeTruthy();
      expect(fireEvent.keyDown(document.activeElement!, { key: "Escape" })).toBe(false); // the menu prevents the default so other Escape handlers skip it
      expect(screen.queryByRole("menu")).toBeNull();
      expect(onExitRequest).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "Escape" }); // the menu is gone: now it counts
      expect(onExitRequest).toHaveBeenCalledTimes(1);
    });

    it("the Escape listener lives only while in context", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      const { rerenderWith } = await mount({ context: ctx(p.renderCanvas, onExitRequest) });
      rerenderWith({});
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onExitRequest).not.toHaveBeenCalled();
    });

    it("a double-click on the overlay outside the map rect calls it; inside the rect or on the bar does not", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      const { container } = await mount({ context: ctx(p.renderCanvas, onExitRequest) });
      await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
      const overlay = container.querySelector(".world-canvas__context") as HTMLElement;
      overlay.getBoundingClientRect = () => RECT;
      // Snapped at the viewport centre: B's rect is [26, 74)^2 (see the snap test above).
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 50, clientY: 50 });
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 26, clientY: 26 }); // top-left edge: inside
      fireEvent.doubleClick(screen.getByRole("button", { name: "2×" }), { clientX: 5, clientY: 5 }); // on the bar
      expect(onExitRequest).not.toHaveBeenCalled();
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 25, clientY: 50 });
      fireEvent.doubleClick(screen.getByTestId("ov-canvas"), { clientX: 50, clientY: 74 }); // bottom edge is exclusive
      expect(onExitRequest).toHaveBeenCalledTimes(2);
    });
  });
});

describe("WorldCanvas: tileVersions (Plan 6c E4)", () => {
  const srcs = () => FakeImage.instances.map((i) => i.src).sort();

  it("a bumped version re-requests exactly that map, as ?v=<n>, and nothing else", async () => {
    const { rerenderWith } = await mount({});
    await waitFor(() => expect(FakeImage.instances).toHaveLength(2));
    expect(srcs()).toEqual(["/api/render/A.png", "/api/render/B.png"]);

    rerenderWith({ tileVersions: { B: 1 } });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(3));
    expect(FakeImage.instances[2]!.src).toBe("/api/render/B.png?v=1");

    rerenderWith({ tileVersions: { B: 1 } }); // equal content, new object: no request
    rerenderWith({ tileVersions: { B: 2 } });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(4));
    expect(FakeImage.instances[3]!.src).toBe("/api/render/B.png?v=2");
    expect(FakeImage.instances.map((i) => i.src).filter((s) => s.includes("A.png"))).toEqual(["/api/render/A.png"]);
  });

  it("every load of a versioned map keeps its ?v, including the first one after mount", async () => {
    await mount({ tileVersions: { B: 3 } });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(2));
    expect(srcs()).toEqual(["/api/render/A.png", "/api/render/B.png?v=3"]);
  });
});

describe("WorldCanvas: in-context fix round (Plan 6c E4)", () => {
  const ctx = (renderCanvas: ReturnType<typeof probe>["renderCanvas"], onExitRequest = vi.fn(), origin: { x: number; y: number } | null = { x: 16, y: 16 }) =>
    ({ map: "B", origin, renderCanvas, onExitRequest });
  const boxAt = (top: number) => ({ ...RECT, top, y: top, bottom: top + VIEWPORT_SIZE });

  describe("Escape", () => {
    it("is judged before any bubble handler: a document listener that removes the modal on Escape (React's flush) does not let it through", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctx(p.renderCanvas, onExitRequest) });
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

    it.each(["input", "textarea", "select"])("from a <%s> does not request an exit", async (tag) => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctx(p.renderCanvas, onExitRequest) });
      const field = document.body.appendChild(document.createElement(tag));
      fireEvent.keyDown(field, { key: "Escape" });
      field.remove();
      expect(onExitRequest).not.toHaveBeenCalled();
    });

    it("from a contenteditable element does not request an exit; from a plain element it does", async () => {
      const onExitRequest = vi.fn();
      const p = probe();
      await mount({ context: ctx(p.renderCanvas, onExitRequest) });
      const editable = document.body.appendChild(document.createElement("div"));
      editable.setAttribute("contenteditable", "true");
      fireEvent.keyDown(editable, { key: "Escape" });
      editable.remove();
      expect(onExitRequest).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onExitRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("snap uses the canvas box as it is when the layout (and so the chrome) arrives", () => {
    it("waits for context.origin, then converts the recorded client pointer with the shifted box", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, container, rerenderWith } = await mount({ onEditHere });
      canvas.getBoundingClientRect = () => boxAt(58); // already shifted when the user double-clicks
      fireEvent.doubleClick(canvas, { clientX: 21, clientY: 59 }); // canvas-relative (21, 1): inside B
      expect(onEditHere).toHaveBeenCalledWith("B");

      rerenderWith({ onEditHere, context: ctx(p.renderCanvas, vi.fn(), null) }); // layout not loaded: no snap yet
      await act(async () => { await Promise.resolve(); });
      expect(p.views).toHaveLength(0);
      expect(readout(container)).toBe("6%"); // zoom 1 unchanged: still the pre-snap world

      canvas.getBoundingClientRect = () => boxAt(116); // the chrome mounted and moved the canvas down again
      rerenderWith({ onEditHere, context: ctx(p.renderCanvas) });
      // pointer = client (21, 59) - box (0, 116) = (21, -57); B centre (344, 24) -> pan (21-344, -57-24) = (-323, -81);
      // MapCanvas view = (20*16 - 323 - 16, -81 - 16) = (-19, -97).
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -19, y: -97 } }));
    });

    it("the right-click menu's open point is recorded in client px too", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
      canvas.getBoundingClientRect = () => boxAt(58);
      fireEvent.contextMenu(canvas, { clientX: 22, clientY: 60 }); // canvas-relative (22, 2)
      fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
      canvas.getBoundingClientRect = () => boxAt(116);
      rerenderWith({ onEditHere, context: ctx(p.renderCanvas) });
      // pointer (22, 60 - 116 = -56); pan = (22-344, -56-24) = (-322, -80); view = (320-322-16, -80-16) = (-18, -96).
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -18, y: -96 } }));
    });

    it("the ContextMenu key's open point (the selected map's centre) is recorded in client px too", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, rerenderWith } = await mount({ onOpenMap: vi.fn(), onEditHere });
      canvas.getBoundingClientRect = () => boxAt(58);
      fireEvent.mouseDown(canvas, { clientX: 21, clientY: 59, button: 0, ctrlKey: true }); // select B
      fireEvent.keyDown(canvas, { key: "ContextMenu" }); // opens at B's centre: canvas (21.5, 1.5) = client (21.5, 59.5)
      fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
      canvas.getBoundingClientRect = () => boxAt(116);
      rerenderWith({ onEditHere, context: ctx(p.renderCanvas) });
      // pointer (21.5, 59.5 - 116 = -56.5); pan = (round(21.5-344), round(-56.5-24)) = (-322, -80); view (-18, -96).
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -18, y: -96 } }));
    });

    it("a later entry does not reuse an earlier pointer: with none recorded the canvas centre is used", async () => {
      const onEditHere = vi.fn();
      const p = probe();
      const { canvas, rerenderWith } = await mount({ onEditHere });
      fireEvent.doubleClick(canvas, { clientX: 21, clientY: 1 });
      rerenderWith({ onEditHere, context: ctx(p.renderCanvas) });
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: -19, y: -39 } })); // at the pointer (21, 1)
      rerenderWith({ onEditHere });
      rerenderWith({ onEditHere, context: ctx(p.renderCanvas) }); // entered some other way: nothing recorded
      // The world kept zoom 16 (snaps to 1x again); centre fallback (50, 50): pan (-294, 26); view (10, 10).
      await waitFor(() => expect(p.current()).toEqual({ zoom: 1, pan: { x: 10, y: 10 } }));
    });
  });

  it("re-entering at the leftover 4x zoom snaps to 4x (the zoom is not forced back to 1x)", async () => {
    const p = probe();
    const { rerenderWith } = await mount({ context: ctx(p.renderCanvas) });
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    await waitFor(() => expect(p.current().zoom).toBe(4));
    rerenderWith({});
    expect(screen.queryByTestId("ov-canvas")).toBeNull();
    rerenderWith({ context: ctx(p.renderCanvas) });
    // snapContextZoom(64) = 4; centre fallback (50, 50): B centre (21.5, 1.5)*64 = (1376, 96) -> pan (-1326, -46);
    // view = (20*64 - 1326 - 16*4, -46 - 16*4) = (-110, -110).
    await waitFor(() => expect(screen.getByTestId("ov-canvas")).toBeTruthy());
    expect(p.current()).toEqual({ zoom: 4, pan: { x: -110, y: -110 } });
  });

  it("labels the bar and the Done button, and hides the dim layer from assistive tech", async () => {
    const p = probe();
    const { container } = await mount({ context: ctx(p.renderCanvas) });
    expect(screen.getByRole("group", { name: "Editing B in place" })).toBe(container.querySelector(".world-canvas__context-bar"));
    expect(screen.getByRole("button", { name: "Done editing B" })).toBeTruthy();
    expect(container.querySelector(".world-canvas__context-dim")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("leaving context returns focus to the world canvas; a canvas that never had a context does not take focus", async () => {
    const p = probe();
    const { canvas, rerenderWith } = await mount({ context: ctx(p.renderCanvas) });
    screen.getByRole("button", { name: "Done editing B" }).focus();
    rerenderWith({});
    expect(document.activeElement).toBe(canvas);
    const other = await mount({});
    expect(document.activeElement).not.toBe(other.canvas);
  });
});
