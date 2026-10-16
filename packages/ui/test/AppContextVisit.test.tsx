// Plan 8 Task 6 (spec Tests 3 item 4): GBA mirror of GbcAppContext "different-map tree visits retire a context stamp".
// A regression pin, not a red witness: GBA's visit reset already cleared the stamp before Task 6. Harness copied
// from AppContextEdit.test.tsx (each App test file keeps its own).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FamilyApp } from "../src/shell/FamilyApp.js";
import { gbaAdapter } from "../src/gba/adapter.js";
import { restoreViewport, stubViewport } from "./viewport.js";

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

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  stubViewport(400, 100);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreViewport();
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
const chrome = () => document.querySelector(".toolbar");


describe("App -- in-context visits (Plan 8 Task 6)", () => {
  it("different-map tree visits retire a context stamp across A to B to A while preserving tool and host", async () => {
    await startApp();
    const canvas = await enterWorld();
    dblClickRoute1(canvas);
    await waitFor(() => expect(contextOverlay()!.querySelector("canvas.map-canvas__stage")).not.toBeNull());
    const body = document.querySelector(".app__map-editing-body");
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    const picked = await screen.findByRole("button", { name: /metatile 0x1\b/i });
    fireEvent.click(picked);
    await waitFor(() => expect(picked.getAttribute("aria-pressed")).toBe("true")); // positive control

    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    await waitFor(() => expect(contextOverlay()).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Route1" }));
    await waitFor(() => expect(document.querySelector('.map-tree__map[aria-current="true"]')?.textContent).toContain("Route1"));
    fireEvent.doubleClick(canvas, { clientX: 200, clientY: 50 }); // the tree jump centres Route1 in the 400x100 stage
    await waitFor(() => expect(contextOverlay()!.querySelector("canvas.map-canvas__stage")).not.toBeNull());

    expect(screen.getByRole("button", { name: /metatile 0x1\b/i }).getAttribute("aria-pressed")).not.toBe("true");
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true");
    expect(worldCanvas()).toBe(canvas);
    expect(document.querySelector(".app__map-editing-body")).toBe(body);
  });
});
