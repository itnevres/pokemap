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

vi.mock("../src/components/WorldCanvas.js", () => ({ WorldCanvas: (props: { onOpenWarpDestination?: (name: string) => void }) => <button onClick={() => props.onOpenWarpDestination?.("PalletTown")}>Open warp destination</button> }));

it.each(["begin", "apply", "end"])("protects held %s in the GBA popup and shares save state", async (held) => {
  const f = makeFetchMock();
  const original = f.getMockImplementation()!;
  let release!: () => void;
  let dirty = false;
  const response = () => ok({ blocks: LAYOUT.blocks, border: [], map: LAYOUT.map, isDirty: dirty, canUndo: dirty, canRedo: false });
  f.mockImplementation((url, init) => {
    if (url.includes("/paint/")) {
      const respond = () => { if (url.endsWith("/apply")) dirty = true; return response(); };
      return url.endsWith(`/paint/${held}`) ? new Promise<Response>((resolve) => { release = () => { respond().then(resolve); }; }) : respond();
    }
    return original(url, init);
  });
  vi.stubGlobal("fetch", f);
  render(<App />);
  await screen.findByRole("button", { name: "PalletTown" });
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  const world = screen.getByRole("button", { name: "Open warp destination" });
  world.focus();
  fireEvent.click(world);
  const dialog = await screen.findByRole("dialog", { name: "PalletTown preview" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "collision" })).toBeTruthy());
  fireEvent.click(within(dialog).getByRole("button", { name: "collision" }));
  const stage = dialog.querySelector("canvas.map-canvas__stage")!;
  stage.getBoundingClientRect = () => RECT;
  fireEvent.mouseDown(stage, { clientX: 33, clientY: 33, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 33, clientY: 33, button: 0 });
  await waitFor(() => expect(release).toBeTypeOf("function"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(dialog.isConnected).toBe(true);
  expect(within(dialog).getByRole("button", { name: "Save Changes" }).closest("fieldset")!.disabled).toBe(true);
  if (held === "end") {
    fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 });
    fireEvent.mouseUp(stage, { clientX: 40, clientY: 40, button: 0 });
  }
  await act(async () => release());
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save Changes" }).closest("fieldset")!.disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  const save = await screen.findByRole("dialog", { name: /Save/ });
  fireEvent.keyDown(save, { key: "Escape" });
  expect(dialog.isConnected).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: /Save/ })).getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(screen.queryByTestId("dirty-indicator")).toBeNull());
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(f.mock.calls.filter(([url]) => url.endsWith("/paint/begin"))).toHaveLength(1);
  expect(document.activeElement).toBe(world);
  expect(dialog.isConnected).toBe(false);
  expect(screen.getByRole("button", { name: "Open warp destination" })).toBe(world);
});

it("protects a deferred event add and a deferred discard in the GBA popup", async () => {
  const f = makeFetchMock(); const original = f.getMockImplementation()!;
  let finishEvent!: () => void; let finishDiscard!: () => void;
  f.mockImplementation((url, init) => url.endsWith("/event/add") ? new Promise<Response>((resolve) => { finishEvent = () => { original(url, init).then(resolve); }; })
    : url.endsWith("/discard") ? new Promise<Response>((resolve) => { finishDiscard = () => { ok({}).then(resolve); }; }) : original(url, init));
  vi.stubGlobal("fetch", f); vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App />); await screen.findByRole("button", { name: "PalletTown" });
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  const dialog = await screen.findByRole("dialog", { name: "PalletTown preview" });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Add Event" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(dialog.isConnected).toBe(true);
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  await act(async () => finishEvent());
  await screen.findByTestId("dirty-indicator");
  fireEvent.click(within(dialog).getByRole("button", { name: "Discard Changes" }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(dialog.isConnected).toBe(true);
  await act(async () => finishDiscard());
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(dialog.isConnected).toBe(false);
});

it.each(["cancel", "failure", "success"])("guards dirty destination switching: %s", async (outcome) => {
  const f = makeFetchMock(); const original = f.getMockImplementation()!;
  let finishDiscard!: () => void;
  f.mockImplementation((url, init) => url === "/api/edit/Route1/event/add" ? ok({ map: ROUTE1.map, isDirty: true })
    : url === "/api/edit/Route1/discard" ? new Promise<Response>((resolve) => { finishDiscard = () => resolve({ ok: outcome !== "failure", status: outcome === "failure" ? 500 : 200 } as Response); }) : original(url, init));
  vi.stubGlobal("fetch", f); const confirm = vi.spyOn(window, "confirm").mockReturnValue(outcome !== "cancel");
  render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Route1" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Event" }));
  await screen.findByTestId("dirty-indicator");
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  const opener = screen.getByRole("button", { name: "Open warp destination" });
  opener.focus(); fireEvent.click(opener);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "PalletTown preview" })).toBeNull();
  if (outcome === "cancel") return;
  expect(screen.getByRole("dialog", { name: "Switching maps" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  fireEvent.click(screen.getByRole("button", { name: "Map" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  await act(async () => finishDiscard());
  if (outcome === "success") {
    const popup = await screen.findByRole("dialog", { name: "PalletTown preview" });
    fireEvent.click(within(popup).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(opener);
  }
  else { expect((await screen.findByRole("alert")).textContent).toMatch(/discard/); expect(screen.queryByRole("dialog", { name: "PalletTown preview" })).toBeNull(); expect(document.activeElement).toBe(opener); }
});

it("preserves a dirty same-map session when its destination opens", async () => {
  vi.stubGlobal("fetch", makeFetchMock()); const confirm = vi.spyOn(window, "confirm");
  render(<App />); fireEvent.click(await screen.findByRole("button", { name: "PalletTown" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Event" }));
  await screen.findByTestId("dirty-indicator");
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  const dialog = await screen.findByRole("dialog", { name: "PalletTown preview" });
  expect(within(dialog).getByTestId("dirty-indicator")).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
});

it("reloads the saved GBA seed before further paint and discard", async () => {
  const f = makeFetchMock(); const original = f.getMockImplementation()!;
  let disk = LAYOUT.blocks; let live = disk; let dirty = false; let committed = false; let finishReload!: () => void;
  f.mockImplementation((url, init) => {
    if (url === "/api/map/PalletTown" && committed) return new Promise<Response>((resolve) => { finishReload = () => { ok({ ...LAYOUT, blocks: disk }).then(resolve); }; });
    if (url.includes("/paint/")) {
      if (url.endsWith("/apply")) { live = live.map((block) => ({ ...block, metatileId: dirty ? 77 : 99 })); dirty = true; }
      return ok({ blocks: live, border: [], map: LAYOUT.map, isDirty: dirty, canUndo: dirty, canRedo: false });
    }
    if (url.endsWith("/commit")) { disk = live; dirty = false; committed = true; return ok({ changes: [], refusals: [] }); }
    if (url.endsWith("/discard")) { live = disk; dirty = false; return ok({}); }
    return original(url, init);
  });
  vi.stubGlobal("fetch", f); vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App />); await screen.findByRole("button", { name: "PalletTown" });
  fireEvent.click(screen.getByRole("button", { name: "World" })); fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  const dialog = await screen.findByRole("dialog", { name: "PalletTown preview" });
  fireEvent.click(await within(dialog).findByRole("button", { name: "collision" }));
  const stage = dialog.querySelector("canvas.map-canvas__stage")!; stage.getBoundingClientRect = () => RECT;
  const paint = () => { fireEvent.mouseDown(stage, { clientX: 33, clientY: 33, button: 0 }); fireEvent.mouseUp(stage, { clientX: 33, clientY: 33, button: 0 }); };
  paint(); await screen.findByTestId("dirty-indicator");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save Changes" }).closest("fieldset")!.disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Save changes" })).getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(finishReload).toBeTypeOf("function"));
  paint(); fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(dialog.isConnected).toBe(true);
  expect(f.mock.calls.filter(([url]) => url.endsWith("/paint/begin"))).toHaveLength(1);
  await act(async () => finishReload());
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save Changes" }).closest("fieldset")!.disabled).toBe(false));
  paint(); await screen.findByTestId("dirty-indicator");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Discard Changes" }).closest("fieldset")!.disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole("button", { name: "Discard Changes" }));
  await waitFor(() => expect(screen.queryByTestId("dirty-indicator")).toBeNull());
  fireEvent.mouseMove(stage, { clientX: 33, clientY: 33, buttons: 0 });
  expect(dialog.querySelector(".map-canvas__hover")?.textContent).toMatch(/id.*63/);
});


it("blocks GBA editing after failed saved-seed reload until retry succeeds", async () => {
  const f = makeFetchMock(); const original = f.getMockImplementation()!;
  let saved = false; let refreshes = 0;
  f.mockImplementation((url, init) => {
    if (url.endsWith("/commit")) saved = true;
    if (url === "/api/map/PalletTown" && saved) {
      if (++refreshes === 1) return Promise.resolve({ ok: false, status: 500 } as Response);
      return ok({ ...LAYOUT, blocks: LAYOUT.blocks.map((block) => ({ ...block, metatileId: 99 })) });
    }
    return original(url, init);
  });
  vi.stubGlobal("fetch", f); render(<App />);
  await screen.findByRole("button", { name: "PalletTown" });
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  const popup = await screen.findByRole("dialog", { name: "PalletTown preview" });
  fireEvent.click(await within(popup).findByRole("button", { name: "collision" }));
  fireEvent.click(within(popup).getByRole("button", { name: "Add Event" }));
  await screen.findByTestId("dirty-indicator");
  fireEvent.click(within(popup).getByRole("button", { name: "Save Changes" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Save changes" })).getByRole("button", { name: "Save Changes" }));
  const retry = await within(popup).findByRole("button", { name: "Retry reload" });
  expect(retry.closest("fieldset")).toBeNull();
  expect(within(popup).getByRole("alert").textContent).toMatch(/Saved, but could not reload/);
  expect(within(popup).getByRole("button", { name: "Add Event" }).closest("fieldset")!.disabled).toBe(true);
  const stage = popup.querySelector("canvas.map-canvas__stage")!; stage.getBoundingClientRect = () => RECT;
  fireEvent.mouseDown(stage, { clientX: 33, clientY: 33, button: 0 }); fireEvent.mouseUp(stage, { clientX: 33, clientY: 33, button: 0 });
  expect(f.mock.calls.some(([url]) => url.endsWith("/paint/begin"))).toBe(false);
  fireEvent.click(within(popup).getByRole("button", { name: "Close" })); fireEvent.keyDown(popup, { key: "Escape" });
  expect(popup.isConnected).toBe(true);
  retry.focus(); fireEvent.click(retry);
  await waitFor(() => expect(within(popup).queryByRole("button", { name: "Retry reload" })).toBeNull());
  expect(document.activeElement).toBe(within(popup).getByRole("button", { name: "Close" }));
  expect(within(popup).getByRole("button", { name: "Add Event" }).closest("fieldset")!.disabled).toBe(false);
  fireEvent.click(within(popup).getByRole("button", { name: "Close" })); expect(popup.isConnected).toBe(false);
});
