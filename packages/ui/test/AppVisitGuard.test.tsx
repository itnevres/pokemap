import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FamilyApp } from "../src/shell/FamilyApp.js";
import { gbaAdapter } from "../src/gba/adapter.js";

const PALLET = {
  map: { id: "MAP_PALLET", name: "PalletTown", layout: "LAYOUT_PALLET", music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE", connections: [], objectEvents: [{ graphicsId: "OBJ_EVENT_GFX_BOY_1", movementType: "MOVEMENT_TYPE_FACE_DOWN", x: 0, y: 0, elevation: 0, script: "NULL", flag: "0", movementRangeX: 1, movementRangeY: 1, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0" }], warpEvents: [], coordEvents: [], bgEvents: [] },
  layout: { id: "LAYOUT_PALLET", name: "Pallet_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1, primaryTileset: "gTileset_General", secondaryTileset: "gTileset_Petalburg", borderFilepath: "data/layouts/Pallet/border.bin", blockdataFilepath: "data/layouts/Pallet/map.bin" },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 }, blocks: [], primaryCount: 4, secondaryCount: 2,
};
const ROUTE = { ...PALLET, map: { ...PALLET.map, id: "MAP_ROUTE", name: "Route1" } };
const GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["PalletTown", "Route1"] } };

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function response(ok: boolean, body: unknown) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response;
}
function fetchMock(move: ReturnType<typeof deferred>) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/groups") return Promise.resolve(response(true, GROUPS));
    if (url === "/api/map/PalletTown") return Promise.resolve(response(true, PALLET));
    if (url === "/api/map/Route1") return Promise.resolve(response(true, ROUTE));
    if (url === "/api/edit/PalletTown/event/move" && init?.method === "POST") return move.promise;
    if (url === "/api/edit/PalletTown/indicator/at?index=0") return Promise.resolve(response(true, { indicator: null }));
    if (url.startsWith("/api/defects/")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ defects: [], incomplete: [] }) } as Response);
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}
async function openPallet() {
  fireEvent.click(await screen.findByRole("button", { name: "PalletTown" }));
  await screen.findByRole("button", { name: "Pencil" });
}
async function switchTo(name: "PalletTown" | "Route1") {
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(document.querySelector(`[aria-label="${name} canvas"]`)).toBeTruthy());
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });

describe("App GBA visit guard", () => {
  it("ignores a deferred A to B to A move success", async () => {
    const move = deferred(); vi.stubGlobal("fetch", fetchMock(move)); render(<FamilyApp adapter={gbaAdapter} />); await openPallet();
    const canvas = document.querySelector("canvas.map-canvas__stage")!;
    fireEvent.mouseDown(canvas, { clientX: 24, clientY: 24, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 40, clientY: 24, button: 0 });
    await switchTo("Route1"); await switchTo("PalletTown");
    // The new visit selects the same object (click, no drag) at its real position (0,0). Without the visit check
    // the old (0,0)->(1,0) success would rewrite this selection to X 1.
    const fresh = document.querySelector("canvas.map-canvas__stage")!;
    fireEvent.mouseDown(fresh, { clientX: 24, clientY: 24, button: 0 });
    fireEvent.mouseUp(fresh, { clientX: 24, clientY: 24, button: 0 });
    const x = await screen.findByRole("spinbutton", { name: "X" }) as HTMLInputElement;
    expect(x.value).toBe("0");
    await act(async () => move.resolve(response(true, { map: PALLET.map, isDirty: true })));
    await act(async () => {});
    expect((screen.getByRole("spinbutton", { name: "X" }) as HTMLInputElement).value).toBe("0");
    expect((screen.getByRole("spinbutton", { name: "Y" }) as HTMLInputElement).value).toBe("0");
  });

  it("ignores a deferred A to B to A move failure", async () => {
    const move = deferred(); vi.stubGlobal("fetch", fetchMock(move)); render(<FamilyApp adapter={gbaAdapter} />); await openPallet();
    const canvas = document.querySelector("canvas.map-canvas__stage")!;
    fireEvent.mouseDown(canvas, { clientX: 24, clientY: 24, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 40, clientY: 24, button: 0 });
    await switchTo("Route1"); await switchTo("PalletTown");
    await act(async () => move.resolve(response(false, { error: "old failure" })));
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retires an event error when switching visits", async () => {
    const move = deferred(); vi.stubGlobal("fetch", fetchMock(move)); render(<FamilyApp adapter={gbaAdapter} />); await openPallet();
    const canvas = document.querySelector("canvas.map-canvas__stage")!;
    fireEvent.mouseDown(canvas, { clientX: 24, clientY: 24, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 40, clientY: 24, button: 0 });
    await act(async () => move.resolve(response(false, { error: "old failure" })));
    await screen.findByRole("alert");
    await switchTo("Route1");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
