import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { App } from "../src/App.js";

// Plan 6c E4: GBA in-context editing at the App level -- the World view's double-click enters it, the editing chrome
// appears around the SAME world canvas, exits go through the dirty guard, and a save refreshes only that map's tile.
// Fixture/mocks follow AppWorldContextMenu.test.tsx (each App test file keeps its own).

const LAYOUT = {
  map: {
    id: "MAP_PALLET_TOWN", name: "PalletTown", layout: "LAYOUT_PALLET_TOWN",
    music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  layout: {
    id: "LAYOUT_PALLET_TOWN", name: "PalletTown_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1,
    primaryTileset: "gTileset_General", secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/PalletTown/border.bin", blockdataFilepath: "data/layouts/PalletTown/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x11, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x12, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0 },
  ],
  primaryCount: 4,
  secondaryCount: 2,
};
const ROUTE1 = { ...LAYOUT, map: { ...LAYOUT.map, id: "MAP_ROUTE1", name: "Route1" } };
const GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["PalletTown", "Route1"] } };
// PalletTown at world x 0, Route1 at x 11, both 10x10 tiles. Viewport 400x100, zoom 1: PalletTown [0,10), Route1 [11,21).
const WORLD = {
  placements: {
    PalletTown: { map: "PalletTown", x: 0, y: 0, width: 10, height: 10, component: 0 },
    Route1: { map: "Route1", x: 11, y: 0, width: 10, height: 10, component: 1 },
  },
  components: [
    { index: 0, maps: ["PalletTown"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
    { index: 1, maps: ["Route1"], bounds: { x: 11, y: 0, width: 10, height: 10 } },
  ],
  conflicts: [], verticalLinks: [], sidecar: { dungeonAutoLayout: true },
};

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function makeFetchMock() {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/groups") return ok(GROUPS);
    if (url === "/api/map/PalletTown") return ok(LAYOUT);
    if (url === "/api/map/Route1") return ok(ROUTE1);
    if (url === "/api/world") return ok(WORLD);
    if (url === "/api/edit/PalletTown/event/add" && method === "POST") return ok({ map: LAYOUT.map, isDirty: true });
    if (url === "/api/edit/PalletTown/plan") return ok({ changes: [{ path: "data/maps/PalletTown/map.json", kind: "json", summary: "map.json: 1 event added" }], refusals: [] });
    if (url === "/api/edit/PalletTown/commit" && method === "POST") return ok({ changes: [], refusals: [] });
    if (url === "/api/coverage") {
      return ok({ mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [],
        byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 } });
    }
    if (url === "/api/species") return ok([]);
    if (url.startsWith("/api/warps/")) return ok({ warps: [] });
    if (url.startsWith("/api/encounters/")) return ok({ methods: [] });
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
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
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 400, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
  if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
});

const RECT = { left: 0, top: 0, right: 400, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON() {} };
const worldCanvas = () => document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement | null;

async function enterWorld() {
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(worldCanvas()).toBeTruthy());
  const canvas = worldCanvas()!;
  canvas.getBoundingClientRect = () => RECT;
  await waitFor(() => expect(document.querySelector(".world-canvas__zoom-readout")).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(/Loading world/)).toBeNull());
  return canvas;
}

async function startApp(fetchMock = makeFetchMock()) {
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
  return fetchMock;
}

/** Fresh World view: Route1's body is x in [11,21), so (16,5) is inside it. */
const dblClickRoute1 = (canvas: HTMLCanvasElement) => fireEvent.doubleClick(canvas, { clientX: 16, clientY: 5 });
const contextOverlay = () => document.querySelector(".world-canvas__context");
const chrome = () => document.querySelector(".toolbar");

describe("App -- in-context editing (Plan 6c E4)", () => {
  it("double-clicking a map in World shows the editing chrome around the SAME world canvas, with no /api/world refetch", async () => {
    const fetchMock = await startApp();
    const canvas = await enterWorld();
    const worldFetches = () => fetchMock.mock.calls.filter(([url]) => url === "/api/world").length;
    const baseline = worldFetches(); // the canvas and the visibility hook each load it once
    expect(baseline).toBeGreaterThan(0);
    expect(chrome()).toBeNull();
    expect(document.querySelector(".event-inspector")).toBeNull();
    const body = document.querySelector(".app__map-editing-body");

    dblClickRoute1(canvas);

    await waitFor(() => expect(chrome()).not.toBeNull());
    expect(document.querySelector(".event-inspector")).not.toBeNull();
    expect(worldCanvas()).toBe(canvas); // same DOM node: the world canvas was not remounted
    expect(document.querySelector(".app__map-editing-body")).toBe(body);
    expect(worldFetches()).toBe(baseline);
    expect(contextOverlay()).not.toBeNull();
    expect(document.querySelector(".world-canvas__context-bar")!.textContent).toContain("Route1");
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("Route1");
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
    // The map's layout loads, then the overlay hosts a chromeless MapCanvas: no map toolbar, no status strip.
    await waitFor(() => expect(contextOverlay()!.querySelector("section.map-canvas.map-canvas--chromeless canvas.map-canvas__stage")).not.toBeNull());
    expect(contextOverlay()!.querySelector(".map-canvas__toolbar")).toBeNull();
    expect(contextOverlay()!.querySelector(".map-canvas__status")).toBeNull();
  });

  it("Done on a clean session removes the chrome and the overlay; World stays", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickRoute1(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Done editing Route1" }));

    await waitFor(() => expect(chrome()).toBeNull());
    expect(document.querySelector(".event-inspector")).toBeNull();
    expect(contextOverlay()).toBeNull();
    expect(worldCanvas()).toBe(canvas);
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Escape on a clean session leaves context too", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickRoute1(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(contextOverlay()).toBeNull());
    expect(chrome()).toBeNull();
  });

  describe("with a dirty session", () => {
    /** Enters context on Route1 and adds an event through the inspector, which dirties the (mocked) session. */
    async function dirtyRoute1() {
      const fetchMock = makeFetchMock();
      // Route1's add-event route, like PalletTown's.
      const base = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, init?: RequestInit) =>
        url === "/api/edit/Route1/event/add" ? ok({ map: ROUTE1.map, isDirty: true })
          : url === "/api/edit/Route1/plan" ? ok({ changes: [{ path: "data/maps/Route1/map.json", kind: "json", summary: "map.json: 1 event added" }], refusals: [] })
          : url === "/api/edit/Route1/commit" && init?.method === "POST" ? ok({ changes: [], refusals: [] })
          : base(url, init));
      await startApp(fetchMock);
      const canvas = await enterWorld();
      dblClickRoute1(canvas);
      await screen.findByRole("button", { name: "Add Event" });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Event" })); });
      await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
      return { canvas, fetchMock };
    }

    it("Escape opens the SaveDialog and stays in context; Escape inside the dialog cancels only the dialog", async () => {
      await dirtyRoute1();
      fireEvent.keyDown(document.body, { key: "Escape" });
      const dialog = await screen.findByRole("dialog", { name: "Save changes" });
      expect(contextOverlay()).not.toBeNull();
      expect(chrome()).not.toBeNull();

      fireEvent.keyDown(within(dialog).getByRole("button", { name: "Cancel" }), { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
      expect(contextOverlay()).not.toBeNull(); // not reopened by the same Escape reaching the window listener
    });

    it("Done opens the SaveDialog and stays in context", async () => {
      await dirtyRoute1();
      fireEvent.click(screen.getByRole("button", { name: "Done editing Route1" }));
      expect(await screen.findByRole("dialog", { name: "Save changes" })).toBeTruthy();
      expect(contextOverlay()).not.toBeNull();
    });

    it("a committed save refreshes exactly that map's world tile, as ?v=1", async () => {
      await dirtyRoute1();
      await waitFor(() => expect(FakeImage.instances.map((i) => i.src).sort()).toEqual(["/api/render/PalletTown.png", "/api/render/Route1.png"]));
      const before = FakeImage.instances.length;

      fireEvent.click(screen.getByRole("button", { name: "Done editing Route1" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes" });
      await waitFor(() => expect((within(dialog).getByRole("button", { name: "Save Changes" }) as HTMLButtonElement).disabled).toBe(false));
      await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" })); });

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull());
      await waitFor(() => expect(FakeImage.instances.length).toBe(before + 1));
      expect(FakeImage.instances.at(-1)!.src).toBe("/api/render/Route1.png?v=1");
      expect(screen.queryByTestId("dirty-indicator")).toBeNull(); // markClean ran (existing flow)
      expect(contextOverlay()).not.toBeNull(); // saved, still in context until Done
    });
  });

  it("a mode switch leaves context without a prompt; coming back to World starts without it", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickRoute1(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(contextOverlay()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "World" }));
    await waitFor(() => expect(worldCanvas()).toBeTruthy());
    expect(contextOverlay()).toBeNull();
    expect(document.querySelector(".world-canvas__context-bar")).toBeNull();
    expect(chrome()).toBeNull();
  });

  it("a tree click on the map being edited also leaves context (the jump it requests would move the world under the overlay)", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickRoute1(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Route1" }));

    await waitFor(() => expect(contextOverlay()).toBeNull());
    expect(chrome()).toBeNull();
  });

  it("a tree click on another map leaves context (no remount of the chrome, no overlay) and selects that map", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickRoute1(canvas);
    await waitFor(() => expect(chrome()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));

    await waitFor(() => expect(contextOverlay()).toBeNull());
    expect(chrome()).toBeNull();
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("PalletTown");
    expect(worldCanvas()).toBe(canvas);
  });

  it("a double-click on another map with a dirty session and a cancelled confirm does not enter context", async () => {
    await startApp();
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    await screen.findByRole("button", { name: "Add Event" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Event" })); });
    await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    // The overlay must never mount, not even for a frame that a later effect then cleans up.
    let overlaysMounted = 0;
    const observer = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => { if (n instanceof Element && (n.matches(".world-canvas__context") || n.querySelector(".world-canvas__context"))) overlaysMounted++; });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const canvas = await enterWorld(); // entering World with PalletTown selected jumps to it
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    const highlight = document.querySelector(".world-canvas__jump-highlight") as HTMLElement;
    const tile = parseFloat(highlight.style.width) / 10; // PalletTown is 10 tiles wide
    // Route1 starts 11 tiles right of PalletTown's left edge: its centre is 16 tiles right, 5 below the top.
    fireEvent.doubleClick(canvas, { clientX: parseFloat(highlight.style.left) + 16 * tile, clientY: parseFloat(highlight.style.top) + 5 * tile });

    await act(async () => { await Promise.resolve(); }); // let the observer deliver
    observer.disconnect();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(overlaysMounted).toBe(0);
    expect(contextOverlay()).toBeNull();
    expect(chrome()).toBeNull();
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("PalletTown");
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
  });
});
