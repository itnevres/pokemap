import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

// GbcWorldCanvas replaced by two buttons that call its real selection props, so the World-path dirty guards
// (selectMapFromWorld / openMapFromWorld) are driven without a world fixture (spec review F1).
vi.mock("../../src/gbc/GbcWorldCanvas.js", async () => {
  const R = await import("react");
  return {
    GbcWorldCanvas: (p: { onSelectMap?: (n: string) => void; onOpenMap?: (n: string) => void; onEditHere?: (n: string) => void }) =>
      R.createElement("div", { "data-testid": "world" },
        R.createElement("button", { type: "button", onClick: () => p.onSelectMap?.("OlivinePort") }, "world-select-port"),
        R.createElement("button", { type: "button", onClick: () => p.onOpenMap?.("OlivinePort") }, "world-open-port"),
        R.createElement("button", { type: "button", onClick: () => p.onEditHere?.("OlivineCity") }, "world-edit-city")),
  };
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const GROUPS = { groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", "OlivinePort"] } };
const EMPTY_EVENTS = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const GUARD_TEXT = "You have unsaved changes on this map. Discard them and switch maps?";

function payload(name: string): GbcMapPayload {
  return {
    family: "gbc",
    map: { name, constName: name.toUpperCase(), group: 1, number: 1, width: 2, height: 1, blkPath: `maps/${name}.blk`, tileset: "T", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P", fishGroup: "0", border: 3, connectionFlags: "0", connections: [] },
    layout: { blkPath: `maps/${name}.blk`, width: 2, height: 1, writable: true },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }], metatileCount: 2, tileset: { constName: "TILESET_OLIVINE", name: "T" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], paddingWidth: 3,
  };
}
const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response);
const DIRTY = { blocks: [{ metatileId: 1 }, { metatileId: 1 }], events: EMPTY_EVENTS, isDirty: true, canUndo: true, canRedo: false };

function mockFetch(opts: { discardFails?: boolean } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/groups") return ok(GROUPS);
    const m = /^\/api\/map\/(.+)$/.exec(url);
    if (m) return ok(payload(decodeURIComponent(m[1]!)));
    if (/\/discard$/.test(url)) return opts.discardFails ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response) : ok({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false });
    if (/\/plan$/.test(url)) return ok({ changes: [{ path: "p", kind: "binary", summary: "1 block changed" }], refusals: [] });
    if (/\/commit$/.test(url)) return ok({ changes: [], refusals: [] });
    if (/\/api\/edit\//.test(url)) return ok(DIRTY);
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }));
  return calls;
}

async function paintThenWorld() {
  await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
  fireEvent.click(screen.getByText("OlivineCity"));
  await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
  fireEvent.click(screen.getByLabelText("metatile 0x1"));
  const canvas = document.querySelector("canvas.map-canvas__stage")!;
  fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
  fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 });
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(screen.getByTestId("world")).toBeTruthy());
}
const status = () => document.querySelector(".app__status")?.textContent;
const beforeUnload = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c) => c[0] === "beforeunload").length;

describe("GbcApp World-path dirty guards (spec review F1, F3, F7)", () => {
  it("a world click on another map: GBA confirm; cancel keeps the selection and discards nothing", async () => {
    const calls = mockFetch();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-select-port"));
    expect(confirm).toHaveBeenCalledWith(GUARD_TEXT);
    expect(calls.some((c) => c.includes("/discard"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(status()).toBe("OlivineCity"));
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
  });

  it("a world click, confirmed: POST /discard goes out BEFORE the new map is fetched", async () => {
    const calls = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-select-port"));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(status()).toBe("OlivinePort"));
    await waitFor(() => expect(calls).toContain("GET /api/map/OlivinePort"));
    const d = calls.indexOf("POST /api/edit/OlivineCity/discard");
    expect(d).toBeGreaterThan(-1);
    expect(d).toBeLessThan(calls.indexOf("GET /api/map/OlivinePort"));
  });

  it("a world double-click (open): cancel stays in World; confirm discards then opens Map on the new map", async () => {
    const calls = mockFetch();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-open-port"));
    expect(confirm).toHaveBeenCalledWith(GUARD_TEXT);
    expect(screen.getByTestId("world")).toBeTruthy();
    expect(calls.some((c) => c.includes("/discard"))).toBe(false);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("world-open-port"));
    await waitFor(() => expect(status()).toBe("OlivinePort"));
    await waitFor(() => expect(calls).toContain("GET /api/map/OlivinePort"));
    expect(calls.indexOf("POST /api/edit/OlivineCity/discard")).toBeLessThan(calls.indexOf("GET /api/map/OlivinePort"));
  });

  it("the dirty session and its beforeunload handler are held while in World", async () => {
    mockFetch();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    expect(beforeUnload(add)).toBe(1);
    expect(beforeUnload(remove)).toBe(0);
    // ...and a world click is therefore guarded (an un-dirty hook would skip the confirm)
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText("world-select-port"));
    expect(confirm).toHaveBeenCalled();
  });

  it("beforeunload is removed after a discard", async () => {
    mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = vi.spyOn(window, "removeEventListener");
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-select-port"));
    await waitFor(() => expect(beforeUnload(remove)).toBe(1));
  });

  it("beforeunload is removed after a committed save", async () => {
    mockFetch();
    const remove = vi.spyOn(window, "removeEventListener");
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.getByText("1 block changed")).toBeTruthy());
    expect(beforeUnload(remove)).toBe(0);
    fireEvent.click(screen.getByRole("dialog").querySelector(".save-dialog__btn--primary")!);
    await waitFor(() => expect(beforeUnload(remove)).toBe(1));
  });

  it("a failed discard from World is shown in World and keeps the selection", async () => {
    mockFetch({ discardFails: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-select-port"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("discard -> 500"));
    expect(screen.getByTestId("world")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(status()).toBe("OlivineCity"));
  });

  // Plan 9 characterisation: GbcApp.tsx:194-197 -- entering context on the SELECTED map clears switchError first.
  it("characterisation (Plan 9): Edit here on the selected map clears a discard error shown in World", async () => {
    mockFetch({ discardFails: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FamilyApp adapter={gbcAdapter} />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-select-port"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("discard -> 500"));

    fireEvent.click(screen.getByText("world-edit-city"));
    await waitFor(() => expect(screen.queryByText(/discard -> 500/)).toBeNull());
    expect(screen.getByTestId("world")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(status()).toBe("OlivineCity"));
  });
});
