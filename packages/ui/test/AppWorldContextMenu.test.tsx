import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { App } from "../src/App.js";

// Plan 6c E3: the GBA world canvas's context-menu "Open in Map view", wired through App's
// openMapFromWorld (dirty-confirm guarded). Fetch-mock shape borrowed from App.test.tsx /
// AppEditingWiring.test.tsx (both keep theirs module-private).

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
// PalletTown at world x 0, Route1 at x 11, both 10x10 tiles.
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

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

function makeFetchMock() {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/groups") return ok(GROUPS);
    if (url === "/api/map/PalletTown") return ok(LAYOUT);
    if (url === "/api/map/Route1") return ok(ROUTE1);
    if (url === "/api/world") return ok(WORLD);
    if (url === "/api/edit/PalletTown/event/add" && method === "POST") return ok({ map: LAYOUT.map, isDirty: true });
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

const sizes = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};
function withViewport() {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 400, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
  if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
});

/** The world canvas, enabled for hit testing (jsdom has no layout). */
async function enterWorld() {
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(document.querySelector("canvas.world-canvas__stage")).toBeTruthy());
  const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON() {} });
  return canvas;
}

describe("App -- world context menu Open in Map view (Plan 6c E3)", () => {
  it("opens the right-clicked map in Map mode with that map selected", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    withViewport();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Route1" })).toBeTruthy());
    const canvas = await enterWorld();
    // Fresh World view (nothing selected): zoom 1, pan 0 -- PalletTown [0,10), Route1 [11,21).
    await waitFor(() => expect(document.querySelector(".world-canvas__zoom-readout")).toBeTruthy());
    fireEvent.contextMenu(canvas, { clientX: 16, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in Map view" }));

    await waitFor(() => expect(document.querySelector("canvas.world-canvas__stage")).toBeNull()); // left World mode
    expect(screen.getByRole("button", { name: "Map" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".app__status")?.textContent).toBe("Route1");
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("Route1");
  });

  it("a dirty session with a cancelled confirm keeps World mode and the selection", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    withViewport();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    await screen.findByRole("button", { name: "Add Event" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Event" })); });
    await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());

    const canvas = await enterWorld(); // entering World with PalletTown selected jumps to it
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    const highlight = document.querySelector(".world-canvas__jump-highlight") as HTMLElement;
    const tile = parseFloat(highlight.style.width) / 10; // PalletTown is 10 tiles wide
    // Route1's centre: 16 tiles right of PalletTown's left edge, 5 tiles below its top.
    const point = { clientX: parseFloat(highlight.style.left) + 16 * tile, clientY: parseFloat(highlight.style.top) + 5 * tile };
    fireEvent.contextMenu(canvas, point);
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in Map view" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector("canvas.world-canvas__stage")).toBeTruthy(); // still World mode
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("PalletTown");
  });
});
