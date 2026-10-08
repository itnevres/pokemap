import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { StrictMode } from "react";
import { GbcApp } from "../../src/gbc/GbcApp.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

// Plan 7 Task 5b: GBC in-context editing at the app level, the twin of AppContextEdit.test.tsx (6c E4). The World view's
// double-click enters it, the editing chrome appears around the SAME world canvas, exits go through the dirty guard, and a
// save refreshes only that map's tile. Viewport 200x200: the one 20x10-block component fits at zoom 10, pan (0, 50), so
// OlivineCity covers x [0,100) and OlivinePort x [100,200), both y [50,150).

const GROUPS = { groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", "OlivinePort"] } };
const EMPTY_EVENTS = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const WORLD = {
  family: "gbc", blockPx: 32,
  placements: {
    OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
    OlivinePort: { map: "OlivinePort", x: 10, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
  },
  components: [{ index: 0, maps: ["OlivineCity", "OlivinePort"], bounds: { x: 0, y: 0, width: 20, height: 10 } }],
  conflicts: [],
};
const EMPTY_COVERAGE = { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [] };

function payload(name: string): GbcMapPayload {
  return {
    family: "gbc",
    map: {
      name, constName: name.toUpperCase(), group: 1, number: 1, width: 10, height: 10, blkPath: `maps/${name}.blk`,
      tileset: "TILESET_OLIVINE", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P",
      fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
    },
    layout: { blkPath: `maps/${name}.blk`, width: 10, height: 10, writable: true },
    blocks: Array.from({ length: 100 }, () => ({ metatileId: 0 })),
    metatileCount: 2,
    tileset: { constName: "TILESET_OLIVINE", name: "TilesetOlivine" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], paddingWidth: 3,
  };
}

const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response);
const CLEAN = { blocks: payload("OlivinePort").blocks, events: EMPTY_EVENTS, isDirty: false, canUndo: false, canRedo: false };

/** A fetch mock for the whole GBC app plus the edit routes; `calls` records `METHOD url` in order. */
function mockFetch() {
  const calls: string[] = [];
  let state = { ...CLEAN };
  const f = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/groups") return ok(GROUPS);
    if (url === "/api/world") return ok(WORLD);
    if (url === "/api/coverage") return ok(EMPTY_COVERAGE);
    if (url === "/api/species") return ok([]);
    const enc = /^\/api\/encounters\/(.+)$/.exec(url);
    if (enc) return ok({ family: "gbc", mapName: decodeURIComponent(enc[1]!), sources: [], defects: [] });
    const m = /^\/api\/map\/(.+)$/.exec(url);
    if (m) return ok(payload(decodeURIComponent(m[1]!)));
    if (/\/discard$/.test(url)) return ok({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false });
    if (/\/plan$/.test(url)) return ok({ changes: [{ path: "maps/x.blk", kind: "binary", summary: "1 block changed" }], refusals: [] });
    if (/\/commit$/.test(url)) return ok({ changes: [], refusals: [] });
    if (/\/paint\/apply$/.test(url)) {
      const body = JSON.parse(init!.body as string) as { targets: { x: number; y: number }[]; stamp: { cells: { metatileId: number }[] } };
      const blocks = state.blocks.map((b) => ({ ...b }));
      for (const p of body.targets) blocks[p.y * 10 + p.x] = { metatileId: body.stamp.cells[0]!.metatileId };
      state = { ...state, blocks, isDirty: true, canUndo: true };
    }
    if (/\/api\/edit\//.test(url)) return ok(state);
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", f);
  return { calls, f };
}

class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  onload: (() => void) | null = null;
  constructor() { FakeImage.instances.push(this); }
}

const sizes = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 200, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 200, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
  if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
});

const RECT = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} };
const worldCanvas = () => document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement | null;
const contextOverlay = () => document.querySelector(".world-canvas__context");
const chrome = () => document.querySelector(".toolbar");
const status = () => document.querySelector(".world-canvas__status")?.textContent ?? "";
async function overlayStage() {
  await waitFor(() => expect(contextOverlay()?.querySelector("canvas.map-canvas__stage")).toBeTruthy());
  const stage = contextOverlay()!.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  stage.getBoundingClientRect = () => RECT;
  return stage;
}

async function startApp() {
  const mock = mockFetch();
  render(<GbcApp root="/x" />);
  await waitFor(() => expect(screen.getByText("OlivinePort")).toBeTruthy());
  return mock;
}

async function enterWorld() {
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(worldCanvas()).toBeTruthy());
  const canvas = worldCanvas()!;
  canvas.getBoundingClientRect = () => RECT;
  await waitFor(() => expect(status()).toMatch(/1 components · 2 maps/));
  await waitFor(() => expect(screen.queryByText(/zoom 3%/)).toBeNull()); // the initial fit has been applied
  return canvas;
}

/** Fresh World view (nothing selected): OlivinePort's body is x in [100,200), y in [50,150). */
const dblClickPort = (canvas: HTMLCanvasElement) => fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });

/** In Map view: opens OlivineCity and paints once, which dirties the (mocked) server session. */
async function dirtyCityInMapView() {
  fireEvent.click(screen.getByText("OlivineCity"));
  await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "pencil" }));
  fireEvent.click(screen.getByLabelText("metatile 0x1"));
  const stage = document.querySelector("canvas.map-canvas__stage")!;
  fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 40, clientY: 40, button: 0 });
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
}

/** Dirty OlivineCity in Map view, then enter World (it jumps to OlivineCity, 60% fill: zoom 12, pan (40,40)) and double-click
 *  the same map: no guard, because it is already selected. OlivineCity's body is then x,y in [40,160). */
async function dirtyContextOnCity() {
  const mock = await startApp();
  await dirtyCityInMapView();
  const canvas = await enterWorldAfterJump();
  fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });
  await waitFor(() => expect(contextOverlay()).not.toBeNull());
  await waitFor(() => expect(contextOverlay()!.querySelector("canvas.map-canvas__stage")).not.toBeNull());
  return { canvas, ...mock };
}
async function enterWorldAfterJump() {
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(worldCanvas()).toBeTruthy());
  const canvas = worldCanvas()!;
  canvas.getBoundingClientRect = () => RECT;
  await waitFor(() => expect(status()).toMatch(/1 components · 2 maps · zoom 38%/)); // 12 / 32 = 37.5 -> 38%
  return canvas;
}

describe("GbcApp -- in-context editing (Plan 7 Task 5b)", () => {
  it("draws an already-loaded cached context image on real App entry and reentry without load events or zoom", async () => {
    const { calls } = mockFetch();
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(384); // (10+2)*32
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(384);
    const draws = new Map<HTMLCanvasElement, unknown[][]>();
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- drawing-command stub, narrower than the real overloads
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
      if (kind !== "2d") return null;
      const log = draws.get(this) ?? [];
      draws.set(this, log);
      return new Proxy({ drawImage: (...args: unknown[]) => { log.push(args); } } as Record<string, unknown>, {
        get: (target, key) => key in target ? target[key as string] : (target[key as string] = vi.fn()),
      });
    };
    try {
      render(<StrictMode><GbcApp root="/x" /></StrictMode>);
      await screen.findByRole("button", { name: "OlivinePort" });
      const world = await enterWorld();
      const body = document.querySelector(".app__map-editing-body");
      let previousStage: HTMLCanvasElement | null = null;
      for (let visit = 0; visit < 2; visit++) {
        dblClickPort(world);
        const stage = await overlayStage();
        const image = contextOverlay()!.querySelector("img.map-canvas__source-image") as HTMLImageElement;
        expect(image.complete).toBe(true);
        expect(image.naturalWidth).toBe(384);
        expect(stage).not.toBe(previousStage);
        await waitFor(() => expect(draws.get(stage)?.length ?? 0).toBeGreaterThan(0));
        const draw = draws.get(stage)!.at(-1)!;
        expect(draw.slice(5, 9)).toEqual([-42, -92, 384, 384]);
        expect(draws.get(draw[0] as HTMLCanvasElement)?.some((args) => args[0] === image)).toBe(true);
        expect(worldCanvas()).toBe(world);
        expect(document.querySelector(".app__map-editing-body")).toBe(body);
        previousStage = stage;
        fireEvent.click(screen.getByRole("button", { name: "Done editing OlivinePort" }));
        await waitFor(() => expect(contextOverlay()).toBeNull());
      }
      expect(calls.some((call) => call.includes("/api/edit/"))).toBe(false);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("double-clicking a map in World shows the editing chrome around the SAME world canvas, with no /api/world refetch", async () => {
    const { calls } = await startApp();
    const canvas = await enterWorld();
    const worldFetches = () => calls.filter((c) => c === "GET /api/world").length;
    const baseline = worldFetches();
    expect(baseline).toBeGreaterThan(0);
    expect(chrome()).toBeNull();
    expect(document.querySelector(".gbc-map-editing__rail")).toBeNull();
    const body = document.querySelector(".app__map-editing-body");
    expect(body).not.toBeNull();

    dblClickPort(canvas);

    await waitFor(() => expect(chrome()).not.toBeNull());
    expect(document.querySelector(".gbc-map-editing__rail")).not.toBeNull(); // palette + inspector
    expect(worldCanvas()).toBe(canvas); // same DOM node: the world canvas was not remounted
    expect(document.querySelector(".app__map-editing-body")).toBe(body);
    expect(calls.filter((c) => c === "GET /api/world").length).toBe(baseline);
    expect(contextOverlay()).not.toBeNull();
    expect(document.querySelector(".world-canvas__context-bar")!.textContent).toContain("OlivinePort");
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("OlivinePort");
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
    // The map's payload loads, then the overlay hosts a chromeless GbcMapCanvas: no map toolbar, no status strip.
    await waitFor(() => expect(contextOverlay()!.querySelector("section.map-canvas.map-canvas--chromeless canvas.map-canvas__stage")).not.toBeNull());
    expect(contextOverlay()!.querySelector(".map-canvas__toolbar")).toBeNull();
    expect(contextOverlay()!.querySelector(".map-canvas__status")).toBeNull();
  });

  it("the overlay composite lines up under the world tile: its origin is the border ring (32 px), not 0", async () => {
    // Real 2D-context stubs here (the other tests run without): record every drawImage per canvas.
    const draws = new Map<HTMLCanvasElement, unknown[][]>();
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- test stub, narrower than the real overload set
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
      if (kind !== "2d") return null;
      const log: unknown[][] = draws.get(this) ?? [];
      draws.set(this, log);
      return new Proxy({ imageSmoothingEnabled: true, drawImage: (...args: unknown[]) => { log.push(args); }, clearRect: vi.fn() } as Record<string, unknown>, {
        get: (t, k) => (k in t ? t[k as string] : (t[k as string] = vi.fn())),
      });
    };
    try {
      await startApp();
      const canvas = await enterWorld();
      dblClickPort(canvas);
      await waitFor(() => expect(contextOverlay()!.querySelector("canvas.map-canvas__stage")).not.toBeNull());
      const stage = contextOverlay()!.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
      fireEvent.load(contextOverlay()!.querySelector("img.map-canvas__source-image")!);
      act(() => { for (const img of FakeImage.instances) img.onload?.(); });
      // Double-click at (150,100) snaps OlivinePort (10,0) 10x10 blocks to 1x = 32 px/block with its centre at the pointer:
      // pan = (150 - 15*32, 100 - 5*32) = (-330, -60), so the world draws the map at (10*32 - 330, -60) = (-10, -60).
      await waitFor(() => expect((draws.get(canvas) ?? []).some((a) => a[1] === -10 && a[2] === -60 && a[3] === 320)).toBe(true));
      // The composite carries a one-block ring, so it must be drawn one ring (32 px at 1x) up and left of the map: (-42, -92).
      await waitFor(() => expect(draws.get(stage)?.at(-1)?.slice(5, 7)).toEqual([-42, -92]));
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("Done on a clean session removes the chrome and the overlay; World stays and the canvas is the same node", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickPort(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Done editing OlivinePort" }));

    await waitFor(() => expect(chrome()).toBeNull());
    expect(document.querySelector(".gbc-map-editing__rail")).toBeNull();
    expect(contextOverlay()).toBeNull();
    expect(worldCanvas()).toBe(canvas);
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Escape on a clean session leaves context too", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickPort(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(contextOverlay()).toBeNull());
    expect(chrome()).toBeNull();
  });

  it("Shift+double-click still opens the Map view and enters no context", async () => {
    await startApp();
    const canvas = await enterWorld();
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100, shiftKey: true });
    await waitFor(() => expect(document.querySelector(".app__status")?.textContent).toBe("OlivinePort"));
    expect(contextOverlay()).toBeNull();
    expect(screen.getByRole("button", { name: "Map" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("the context menu's Edit here enters context", async () => {
    await startApp();
    const canvas = await enterWorld();
    fireEvent.contextMenu(canvas, { clientX: 150, clientY: 100 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
    await waitFor(() => expect(chrome()).not.toBeNull());
    expect(document.querySelector(".world-canvas__context-bar")!.textContent).toContain("OlivinePort");
  });

  describe("with a dirty session", () => {
    it("Done opens the SaveDialog and stays in context; Cancel keeps editing", async () => {
      await dirtyContextOnCity();
      fireEvent.click(screen.getByRole("button", { name: "Done editing OlivineCity" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes" });
      expect(contextOverlay()).not.toBeNull();
      expect(chrome()).not.toBeNull();

      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
      expect(contextOverlay()).not.toBeNull();
      expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    });

    it("Escape opens the SaveDialog and stays in context; Escape inside the dialog cancels only the dialog", async () => {
      await dirtyContextOnCity();
      fireEvent.keyDown(document.body, { key: "Escape" });
      const dialog = await screen.findByRole("dialog", { name: "Save changes" });
      expect(contextOverlay()).not.toBeNull();

      fireEvent.keyDown(within(dialog).getByRole("button", { name: "Cancel" }), { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
      expect(contextOverlay()).not.toBeNull(); // not reopened by the same Escape reaching the window listener
    });

    it("a committed save refreshes exactly that map's world tile, as &v=1, marks the session clean, re-reads the payload", async () => {
      const { calls } = await dirtyContextOnCity();
      await waitFor(() => expect(FakeImage.instances.map((i) => i.src).sort()).toEqual(["/api/render/OlivineCity.png?time=day", "/api/render/OlivinePort.png?time=day"]));
      const before = FakeImage.instances.length;
      const mapReads = () => calls.filter((c) => c === "GET /api/map/OlivineCity").length;
      const readsBefore = mapReads();

      fireEvent.click(screen.getByRole("button", { name: "Done editing OlivineCity" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes" });
      await waitFor(() => expect((within(dialog).getByRole("button", { name: "Save Changes" }) as HTMLButtonElement).disabled).toBe(false));
      await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" })); });

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull());
      await waitFor(() => expect(FakeImage.instances.length).toBe(before + 1));
      expect(FakeImage.instances.at(-1)!.src).toBe("/api/render/OlivineCity.png?time=day&v=1");
      expect(calls).toContain("POST /api/edit/OlivineCity/commit");
      expect(screen.queryByTestId("dirty-indicator")).toBeNull(); // markClean ran
      await waitFor(() => expect(mapReads()).toBe(readsBefore + 1));
      expect(contextOverlay()).not.toBeNull(); // saved, still in context until Done
    });

    it("a mode switch leaves context without a prompt; the session persists (still dirty back in Map view)", async () => {
      await dirtyContextOnCity();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(screen.getByRole("button", { name: "Map" }));
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
      expect(contextOverlay()).toBeNull();
      await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
      expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
      // and back to World starts without the overlay
      fireEvent.click(screen.getByRole("button", { name: "World" }));
      await waitFor(() => expect(worldCanvas()).toBeTruthy());
      expect(contextOverlay()).toBeNull();
      expect(chrome()).toBeNull();
    });

    it("a tree click on another map leaves context only after the dirty guard (cancel keeps editing)", async () => {
      await dirtyContextOnCity();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(screen.getByText("OlivinePort"));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(contextOverlay()).not.toBeNull();
      expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("OlivineCity");
      confirmSpy.mockReturnValue(true);
      fireEvent.click(screen.getByText("OlivinePort"));
      await waitFor(() => expect(contextOverlay()).toBeNull());
      expect(chrome()).toBeNull();
    });


  });

  it("a double-click on another map with a dirty session and a cancelled confirm does not enter context", async () => {
    await startApp();
    await dirtyCityInMapView();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    // The overlay must never mount, not even for a frame that a later effect then cleans up.
    let overlaysMounted = 0;
    const observer = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => { if (n instanceof Element && (n.matches(".world-canvas__context") || n.querySelector(".world-canvas__context"))) overlaysMounted++; });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const canvas = await enterWorldAfterJump(); // OlivineCity is selected: the world jumps to [40,160)^2; OlivinePort starts at x 160
    fireEvent.doubleClick(canvas, { clientX: 180, clientY: 100 });

    await act(async () => { await Promise.resolve(); }); // let the observer deliver
    observer.disconnect();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(overlaysMounted).toBe(0);
    expect(contextOverlay()).toBeNull();
    expect(chrome()).toBeNull();
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("OlivineCity");
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("a confirmed discard enters context on the other map, discarding the server session first", async () => {
    const { calls } = await startApp();
    await dirtyCityInMapView();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const canvas = await enterWorldAfterJump();
    fireEvent.doubleClick(canvas, { clientX: 180, clientY: 100 });
    await waitFor(() => expect(contextOverlay()).not.toBeNull());
    expect(document.querySelector(".world-canvas__context-bar")!.textContent).toContain("OlivinePort");
    expect(calls).toContain("POST /api/edit/OlivineCity/discard");
  });

  it("a tree click on the map being edited also leaves context", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickPort(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "OlivinePort" }));
    await waitFor(() => expect(contextOverlay()).toBeNull());
    expect(chrome()).toBeNull();
  });
  it("keyboard Edit here keeps stepped zoom, wheel and Fit all obey the context contract", async () => {
    await startApp();
    const canvas = await enterWorld();
    fireEvent.click(canvas, { clientX: 150, clientY: 100 });
    fireEvent.keyDown(canvas, { key: "ContextMenu" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
    const stage = await overlayStage();
    expect(document.activeElement).toBe(canvas);

    fireEvent.keyDown(canvas, { key: "+" });
    await waitFor(() => expect(status()).toContain("zoom 200%"));
    fireEvent.keyDown(canvas, { key: "_" });
    await waitFor(() => expect(status()).toContain("zoom 100%"));
    fireEvent.wheel(stage, { deltaY: -100, clientX: 100, clientY: 100 });
    await waitFor(() => expect(status()).toContain("zoom 200%"));
    fireEvent.keyDown(canvas, { key: "=" });
    await waitFor(() => expect(status()).toContain("zoom 400%"));
    fireEvent.keyDown(canvas, { key: "-" });
    await waitFor(() => expect(status()).toContain("zoom 200%"));
    expect((screen.getByRole("button", { name: "Fit all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("pending context consumes zoom keys without continuous zoom", async () => {
    const { f } = await startApp();
    const original = f.getMockImplementation()!;
    f.mockImplementation((url, init) => url === "/api/map/OlivinePort" ? new Promise<Response>(() => {}) : original(url, init));
    const canvas = await enterWorld();
    dblClickPort(canvas);
    await waitFor(() => expect(screen.getByRole("button", { name: "Done editing OlivinePort" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("Loading OlivinePort");
    const before = status();
    for (const key of ["+", "=", "-", "_"]) {
      fireEvent.keyDown(canvas, { key });
      expect(status()).toBe(before);
    }
    expect((screen.getByRole("button", { name: "Fit all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(["rejection", "http", "shape"])("context payload %s is visible without remount, and exit permits recovery", async (kind) => {
    const { f } = await startApp();
    const original = f.getMockImplementation()!;
    f.mockImplementation((url, init) => {
      if (url !== "/api/map/OlivinePort") return original(url, init);
      if (kind === "rejection") return Promise.reject(new Error("payload unavailable"));
      if (kind === "http") return Promise.resolve({ ok: false, status: 503 } as Response);
      return ok({ family: "wrong" });
    });
    const canvas = await enterWorld();
    const body = document.querySelector(".app__map-editing-body");
    dblClickPort(canvas);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(kind === "rejection" ? "payload unavailable" : kind === "http" ? "503" : "unexpected shape");
    expect(worldCanvas()).toBe(canvas);
    expect(document.querySelector(".app__map-editing-body")).toBe(body);
    expect(contextOverlay()?.querySelector("canvas.map-canvas__stage")).toBeNull();
    if (kind === "http") fireEvent.keyDown(document.body, { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: "Done editing OlivinePort" }));
    await waitFor(() => expect(contextOverlay()).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    f.mockImplementation(original);
    fireEvent.click(screen.getByRole("button", { name: "OlivineCity" }));
    await waitFor(() => expect(status()).toContain("zoom 38%"));
    fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });
    await overlayStage();
    expect(worldCanvas()).toBe(canvas);
    expect(document.querySelector(".app__map-editing-body")).toBe(body);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("visible clean overlay paint uses 32px blocks and waits for begin before apply and end", async () => {
    const { f, calls } = await startApp();
    const original = f.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    f.mockImplementation((url, init) => {
      if (url.endsWith("/paint/begin")) {
        calls.push("POST " + url);
        return held.then(() => ok(CLEAN));
      }
      return original(url, init);
    });
    const canvas = await enterWorld();
    dblClickPort(canvas);
    const stage = await overlayStage();
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));
    fireEvent.click(screen.getByLabelText("metatile 0x1"));
    expect(screen.queryByTestId("dirty-indicator")).toBeNull();
    calls.length = 0;
    // Body (-10,-60); client (134,52) gives offset (144,112): block (4,3) at 32px.
    fireEvent.mouseDown(stage, { clientX: 134, clientY: 52, button: 0 });
    fireEvent.mouseUp(stage, { clientX: 134, clientY: 52, button: 0 });
    expect(calls).toEqual(["POST /api/edit/OlivinePort/paint/begin"]);
    expect(screen.queryByTestId("dirty-indicator")).toBeNull();
    await act(async () => { release(); });
    await waitFor(() => expect(calls).toContain("POST /api/edit/OlivinePort/paint/end"));
    expect(calls).toEqual(["POST /api/edit/OlivinePort/paint/begin", "POST /api/edit/OlivinePort/paint/apply", "POST /api/edit/OlivinePort/paint/end"]);
    const apply = f.mock.calls.find(([url]) => url.endsWith("/paint/apply"))!;
    expect(JSON.parse(apply[1]!.body as string)).toEqual({ tool: "pencil", targets: [{ x: 4, y: 3 }], origin: { x: 4, y: 3 }, stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] } });
    await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
  });

  it("overlay event drag uses 16px steps through the actual App move callback", async () => {
    const { f, calls } = await startApp();
    const original = f.getMockImplementation()!;
    f.mockImplementation((url, init) => url === "/api/map/OlivinePort"
      ? ok({ ...payload("OlivinePort"), events: { ...EMPTY_EVENTS, warps: [{ x: 9, y: 7, mapConst: "OLIVINE_CITY", destWarp: 1, lineIndex: 0 }] } })
      : original(url, init));
    const canvas = await enterWorld();
    dblClickPort(canvas);
    const stage = await overlayStage();
    // Offset (144,112) gives step (9,7); (160,128) gives (10,8).
    fireEvent.mouseDown(stage, { clientX: 134, clientY: 52, button: 0 });
    fireEvent.mouseMove(stage, { clientX: 150, clientY: 68, buttons: 1 });
    fireEvent.mouseUp(stage, { clientX: 150, clientY: 68, button: 0 });
    await waitFor(() => expect(calls).toContain("POST /api/edit/OlivinePort/event/move"));
    const move = f.mock.calls.find(([url]) => url.endsWith("/event/move"))!;
    expect(JSON.parse(move[1]!.body as string)).toEqual({ kind: "warp", index: 0, x: 10, y: 8 });
  });

  it("different-map tree visits retire a context stamp across A to B to A while preserving tool and host", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickPort(canvas);
    await overlayStage();
    const body = document.querySelector(".app__map-editing-body");
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));
    fireEvent.click(screen.getByLabelText("metatile 0x1"));
    fireEvent.click(screen.getByRole("button", { name: "OlivineCity" }));
    await waitFor(() => expect(contextOverlay()).toBeNull());
    await waitFor(() => expect(status()).toContain("zoom 38%"));
    fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });
    await overlayStage();
    expect(screen.getByLabelText("metatile 0x1").getAttribute("aria-current")).not.toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "OlivinePort" }));
    await waitFor(() => expect(contextOverlay()).toBeNull());
    await waitFor(() => expect(status()).toContain("zoom 38%"));
    fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });
    await overlayStage();
    expect(screen.getByLabelText("metatile 0x1").getAttribute("aria-current")).not.toBe("true");
    expect(screen.getByRole("button", { name: "pencil" }).getAttribute("aria-pressed")).toBe("true");
    expect(worldCanvas()).toBe(canvas);
    expect(document.querySelector(".app__map-editing-body")).toBe(body);
  });

});
