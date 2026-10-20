import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { FamilyApp } from "../src/shell/FamilyApp.js";
import { useGbcRuntime } from "../src/gbc/adapter.js";
import { useGbaRuntime } from "../src/gba/adapter.js";
import type { ShellSlots } from "../src/shell/adapter.js";
import { gbaAdapter } from "../src/gba/adapter.js";

// Plan 6c E2 fix round (review F1/F4): App-level wiring pins for the state
// that moved into useMapEditing / MapEditingWorkspace. App.test.tsx never
// opens SaveDialog/PokemonIndicatorDialog from the Toolbar, never exercises a cancelled
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
  render(<FamilyApp adapter={gbaAdapter} />);
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
  it("Toolbar Save opens SaveDialog and not PokemonIndicatorDialog", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await openPalletTown();
    await addEventAndWaitDirty();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("dialog", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Pok\u00e9mon Indicator" })).toBeNull();
  });

  it("Toolbar Pok\u00e9mon Indicator opens PokemonIndicatorDialog and not SaveDialog", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await openPalletTown();
    await addEventAndWaitDirty(); // dirty, so a wrongly-wired Save flag would be a live path too

    fireEvent.click(screen.getByRole("button", { name: "Pok\u00e9mon Indicator" }));

    expect(await screen.findByRole("dialog", { name: "Pok\u00e9mon Indicator" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  });
});

describe("App -- selection resets", () => {
  // Pins that the per-map reset runs AFTER the dirty guard: a cancelled
  // switch must not wipe the selected event or the chosen stamp.
  it("a cancelled map switch (dirty session) keeps the selected event and the chosen stamp", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await openPalletTown();

    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeTruthy());
    const picked = screen.getByRole("button", { name: /metatile 0x1\b/i }) as HTMLButtonElement;
    fireEvent.click(picked);
    await waitFor(() => expect(picked.getAttribute("aria-pressed")).toBe("true"));
    await addEventAndWaitDirty();

    fireEvent.click(screen.getByRole("button", { name: "Route1" }));

    expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
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

const GBC_LAYOUT = {
  family: "gbc", map: { name: "PalletTown", constName: "PALLET_TOWN", group: 1, number: 1, width: 2, height: 1, blkPath: "maps/PalletTown.blk", tileset: "T", environment: "E", landmark: "L", music: "X", phoneFlag: "0", palette: "P", fishGroup: "0", border: 1, connectionFlags: "0", connections: [] },
  layout: { blkPath: "maps/PalletTown.blk", width: 2, height: 1 },
  blocks: [{ metatileId: 0 }, { metatileId: 1 }], metatileCount: 2, tileset: { constName: "T", name: "T" },
  collision: Array.from({ length: 2 }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 })), collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] }, defects: [], paddingWidth: 3,
};
const SUGGESTIONS = { species: [{ species: "RATTATA", name: "Rattata", percent: 40 }], placement: { x: 1, y: 0 } };
const SCRIPT = "PalletTownPokemonIndicator1";
const GBC_OBJECT = { x: 1, y: 0, sprite: "SPRITE_MONSTER", moveData: "SPRITEMOVEDATA_POKEMON", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: SCRIPT, eventFlag: "-1", lineIndex: 0 };
const GBA_OBJECT = { x: 1, y: 0, elevation: 0, graphicsId: "OBJ_EVENT_GFX_SPECIES(RATTATA)", movementType: "MOVEMENT_TYPE_FACE_DOWN", script: SCRIPT, localId: 1 };

function RuntimeHarness({ family }: { family: "gba" | "gbc" }) {
  const useRuntime = family === "gba" ? useGbaRuntime : useGbcRuntime;
  const runtime = useRuntime({ selected: "PalletTown", mode: "map", requestPrompt: vi.fn() });
  return <>{runtime.renderMap({ onStrokeChain: vi.fn() } as unknown as ShellSlots)}{runtime.modals}<pre data-testid="session">{JSON.stringify(runtime.session)}</pre></>;
}

describe.each(["gba", "gbc"] as const)("%s Indicator adapter", family => {
  it("applies Place payload to the family's live session, including undo and dirty state", async () => {
    const payload = family === "gba"
      ? { map: { ...LAYOUT.map, objectEvents: [GBA_OBJECT] }, isDirty: true, scriptLabel: SCRIPT }
      : { blocks: GBC_LAYOUT.blocks, events: { ...GBC_LAYOUT.events, objects: [GBC_OBJECT] }, isDirty: true, canUndo: true, canRedo: false, scriptLabel: SCRIPT };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(family === "gba" ? LAYOUT : GBC_LAYOUT);
      if (url === "/api/indicator/PalletTown/suggestions") return ok(SUGGESTIONS);
      if (url === "/api/edit/PalletTown/indicator/add") return ok(payload);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));
    render(<RuntimeHarness family={family} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pok\u00e9mon Indicator" }));
    fireEvent.click(await screen.findByRole("button", { name: /Rattata/ }));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain(`Placed Pok\u00e9mon Indicator: ${SCRIPT}`);
    const session = JSON.parse(screen.getByTestId("session").textContent!);
    expect(session.isDirty).toBe(true);
    expect(session.canUndo).toBe(true);
    expect(session.canRedo).toBe(false);
    if (family === "gba") expect(session.map.objectEvents).toEqual([GBA_OBJECT]);
    else {
      expect(session.events.objects).toEqual([GBC_OBJECT]);
      expect(session.blocks).toEqual(GBC_LAYOUT.blocks);
    }
  });
  it("keeps malformed session payloads out of the live session and leaves the dialog open", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(family === "gba" ? LAYOUT : GBC_LAYOUT);
      if (url === "/api/indicator/PalletTown/suggestions") return ok(SUGGESTIONS);
      if (url === "/api/edit/PalletTown/indicator/add") return ok({ map: {}, events: {}, blocks: [], isDirty: true, scriptLabel: SCRIPT });
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));
    render(<RuntimeHarness family={family} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pok\u00e9mon Indicator" }));
    fireEvent.click(await screen.findByRole("button", { name: /Rattata/ }));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await screen.findByText(/Invalid Indicator session response/);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(JSON.parse(screen.getByTestId("session").textContent!).isDirty).toBe(false);
  });
  const lists = family === "gba" ? ["objectEvents", "warpEvents", "coordEvents", "bgEvents", "connections"] : ["objects", "warps", "coords", "bgs"];
  it.each(lists.flatMap(list => [null, [], {}, { x: "1", y: 0 }, { x: NaN, y: 0 }, { x: 0, y: Infinity }].map(entry => ({ list, entry }))))("rejects malformed $list entry $entry before applying the session", async ({ list, entry }) => {
    const payload = family === "gba"
      ? { map: { ...LAYOUT.map, [list]: [entry] }, isDirty: true, scriptLabel: SCRIPT }
      : { blocks: GBC_LAYOUT.blocks, events: { ...GBC_LAYOUT.events, [list]: [entry] }, isDirty: true, canUndo: true, canRedo: false, scriptLabel: SCRIPT };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(family === "gba" ? LAYOUT : GBC_LAYOUT);
      if (url === "/api/indicator/PalletTown/suggestions") return ok(SUGGESTIONS);
      if (url === "/api/edit/PalletTown/indicator/add") return ok(payload);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));
    render(<RuntimeHarness family={family} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pok\u00e9mon Indicator" }));
    fireEvent.click(await screen.findByRole("button", { name: /Rattata/ }));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    const before = screen.getByTestId("session").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await screen.findByText(/Invalid Indicator session response/);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("session").textContent).toBe(before);
  });
  it("rejects an object with valid coordinates but a malformed displayed field", async () => {
    const payload = family === "gba"
      ? { map: { ...LAYOUT.map, objectEvents: [{ ...GBA_OBJECT, graphicsId: {} }] }, isDirty: true, scriptLabel: SCRIPT }
      : { blocks: GBC_LAYOUT.blocks, events: { ...GBC_LAYOUT.events, objects: [{ ...GBC_OBJECT, sprite: {} }] }, isDirty: true, canUndo: true, canRedo: false, scriptLabel: SCRIPT };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(family === "gba" ? LAYOUT : GBC_LAYOUT);
      if (url === "/api/indicator/PalletTown/suggestions") return ok(SUGGESTIONS);
      if (url === "/api/edit/PalletTown/indicator/add") return ok(payload);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));
    render(<RuntimeHarness family={family} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pok\u00e9mon Indicator" }));
    fireEvent.click(await screen.findByRole("button", { name: /Rattata/ }));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    const before = screen.getByTestId("session").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    await screen.findByText(/Invalid Indicator session response/);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("session").textContent).toBe(before);
  });
  it("keeps the dialog mounted during a deferred POST despite Escape and Cancel, then applies the session", async () => {
    let resolve!: (response: Response) => void;
    const payload = family === "gba"
      ? { map: { ...LAYOUT.map, objectEvents: [GBA_OBJECT] }, isDirty: true, scriptLabel: SCRIPT }
      : { blocks: GBC_LAYOUT.blocks, events: { ...GBC_LAYOUT.events, objects: [GBC_OBJECT] }, isDirty: true, canUndo: true, canRedo: false, scriptLabel: SCRIPT };
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(family === "gba" ? LAYOUT : GBC_LAYOUT);
      if (url === "/api/indicator/PalletTown/suggestions") return ok(SUGGESTIONS);
      if (url === "/api/edit/PalletTown/indicator/add") return new Promise<Response>(r => { resolve = r; });
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }));
    render(<RuntimeHarness family={family} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pok\u00e9mon Indicator" }));
    fireEvent.click(await screen.findByRole("button", { name: /Rattata/ }));
    fireEvent.change(screen.getByLabelText("Dialogue"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(cancel);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(JSON.parse(screen.getByTestId("session").textContent!).isDirty).toBe(false);
    await act(async () => resolve(await ok(payload)));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const session = JSON.parse(screen.getByTestId("session").textContent!);
    expect(session.isDirty).toBe(true);
    expect(session.canUndo).toBe(true);
    if (family === "gba") expect(session.map.objectEvents).toEqual([GBA_OBJECT]);
    else expect(session.events.objects).toEqual([GBC_OBJECT]);
  });

});
