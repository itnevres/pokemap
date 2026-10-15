import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { FamilyApp } from "../src/shell/FamilyApp.js";
import { gbaAdapter } from "../src/gba/adapter.js";

// M5: GBA context exit waits for pending paint before deciding whether to open SaveDialog.
// Dirty mode switches leave context without prompting and preserve the edit session.

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
  render(<FamilyApp adapter={gbaAdapter} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
  return fetchMock;
}

/** Fresh World view: Route1's body is x in [11,21), so (16,5) is inside it. */
const dblClickRoute1 = (canvas: HTMLCanvasElement) => fireEvent.doubleClick(canvas, { clientX: 16, clientY: 5 });
const contextOverlay = () => document.querySelector(".world-canvas__context");

it("M5: Done waits for held paint/apply before deciding the dirty exit", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const fetchMock = makeFetchMock();
  const base = fetchMock.getMockImplementation()!;
  let state = { blocks: ROUTE1.blocks, border: [], map: ROUTE1.map, isDirty: false, canUndo: false, canRedo: false };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/edit/Route1/paint/apply") return held.then(() => {
      state = { ...state, isDirty: true, canUndo: true };
      return ok(state);
    });
    if (url.startsWith("/api/edit/Route1/paint/")) return ok(state);
    if (url === "/api/edit/Route1/plan") return ok({ changes: [], refusals: [] });
    return base(url, init);
  });
  await startApp(fetchMock);
  const canvas = await enterWorld();
  dblClickRoute1(canvas);
  await waitFor(() => expect(contextOverlay()?.querySelector("canvas.map-canvas__stage")).toBeTruthy());
  const stage = contextOverlay()!.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  stage.getBoundingClientRect = () => ({ ...RECT, left: 100, top: 100 });
  fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
  fireEvent.click(await screen.findByRole("button", { name: /metatile 0x1\b/i }));
  fireEvent.mouseDown(stage, { clientX: 44, clientY: 33, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 44, clientY: 33, button: 0 });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/paint/apply"))).toBe(true));
  expect(screen.queryByTestId("dirty-indicator")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Done editing Route1" }));
  await act(async () => {});
  expect(contextOverlay()).not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  await act(async () => { release(); });
  expect(await screen.findByRole("dialog", { name: "Save changes" })).toBeTruthy();
  expect(contextOverlay()).not.toBeNull();
});

it("dirty Map and Dungeon mode switches leave context without prompting and preserve the session", async () => {
  const fetchMock = makeFetchMock();
  const base = fetchMock.getMockImplementation()!;
  let state = { blocks: ROUTE1.blocks, border: [], map: ROUTE1.map, isDirty: false, canUndo: false, canRedo: false };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/edit/Route1/paint/apply") {
      state = { ...state, blocks: [{ ...state.blocks[0]!, metatileId: 1 }, ...state.blocks.slice(1)], isDirty: true, canUndo: true };
    }
    if (url.startsWith("/api/edit/Route1/paint/")) return ok(state);
    if (url === "/api/edit/Route1/plan") return ok({ changes: [], refusals: [] });
    if (url === "/api/dungeons") return ok([]);
    return base(url, init);
  });
  await startApp(fetchMock);
  const canvas = await enterWorld();
  dblClickRoute1(canvas);
  await waitFor(() => expect(contextOverlay()?.querySelector("canvas.map-canvas__stage")).toBeTruthy());
  const stage = contextOverlay()!.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  stage.getBoundingClientRect = () => ({ ...RECT, left: 100, top: 100 });
  fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
  fireEvent.click(await screen.findByRole("button", { name: /metatile 0x1\b/i }));
  fireEvent.mouseDown(stage, { clientX: 44, clientY: 33, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 44, clientY: 33, button: 0 });
  await screen.findByTestId("dirty-indicator");
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/paint/end"))).toBe(true));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  fireEvent.click(screen.getByRole("button", { name: "Map" }));
  await act(async () => {});
  expect(contextOverlay()).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  expect(screen.getByTestId("dirty-indicator")).toBeTruthy();

  const world = await enterWorld();
  await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
  const highlight = document.querySelector(".world-canvas__jump-highlight") as HTMLElement;
  fireEvent.doubleClick(world, {
    clientX: parseFloat(highlight.style.left) + parseFloat(highlight.style.width) / 2,
    clientY: parseFloat(highlight.style.top) + parseFloat(highlight.style.height) / 2,
  });
  await waitFor(() => expect(contextOverlay()?.querySelector("canvas.map-canvas__stage")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
  await act(async () => {});
  expect(contextOverlay()).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  expect(screen.getByRole("button", { name: "Dungeon" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Map" }));
  await act(async () => {});
  expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
});
