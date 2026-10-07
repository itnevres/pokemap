import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { App } from "../src/App.js";

// Plan 6c E2 fix round (review F1/F4): App-level wiring pins for the state
// that moved into useMapEditing / MapEditingWorkspace. App.test.tsx never
// opens SaveDialog/SignComposer from the Toolbar, never exercises a cancelled
// map switch with a selected event, and never deletes a selected event.
// Same fetch-mock shape as App.test.tsx's makeEditFetchMock (module-private
// there, so re-stated here, trimmed to what these tests reach).

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

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

function makeFetchMock() {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/groups") return ok(GROUPS);
    if (url === "/api/map/PalletTown") return ok(LAYOUT);
    if (url === "/api/map/Route1") return ok(ROUTE1);
    // add/delete both report a dirty session, like the real server.
    if (url === "/api/edit/PalletTown/event/add" && method === "POST") return ok({ map: LAYOUT.map, isDirty: true });
    if (url === "/api/edit/PalletTown/event/delete" && method === "POST") {
      return ok({ map: LAYOUT.map, isDirty: true, warpRenumberWarnings: [] });
    }
    // The two dialogs fetch on mount; their load-failure paths are not under test.
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openPalletTown() {
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
  await screen.findByRole("button", { name: "Add Event" });
}

/** Add Event selects the new event and (per the mock) dirties the session. */
async function addEventAndWaitDirty() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Event" })); });
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
  await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy());
}

describe("App -- editing dialogs wiring", () => {
  it("Toolbar Save opens SaveDialog and not SignComposer", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await openPalletTown();
    await addEventAndWaitDirty();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("dialog", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Add wild sign" })).toBeNull();
  });

  it("Toolbar Add Sign opens SignComposer and not SaveDialog", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await openPalletTown();
    await addEventAndWaitDirty(); // dirty, so a wrongly-wired Save flag would be a live path too

    fireEvent.click(screen.getByRole("button", { name: "Add Sign" }));

    expect(await screen.findByRole("dialog", { name: "Add wild sign" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  });
});

describe("App -- selection resets", () => {
  // Pins that the per-map reset runs AFTER the dirty guard: a cancelled
  // switch must not wipe the selected event or the chosen stamp.
  it("a cancelled map switch (dirty session) keeps the selected event and the chosen stamp", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openPalletTown();

    fireEvent.click(screen.getByRole("button", { name: "pencil" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());
    const picked = screen.getByRole("button", { name: /metatile 0x1\b/i }) as HTMLButtonElement;
    fireEvent.click(picked);
    await waitFor(() => expect(picked.getAttribute("aria-pressed")).toBe("true"));
    await addEventAndWaitDirty();

    fireEvent.click(screen.getByRole("button", { name: "Route1" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy(); // event still selected
    expect(screen.queryByText("No event selected.")).toBeNull();
    expect((screen.getByRole("button", { name: /metatile 0x1\b/i }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
  });

  it("deleting the selected event clears the selection", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await openPalletTown();
    await addEventAndWaitDirty();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete" })); });

    await waitFor(() => expect(screen.getByText("No event selected.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
