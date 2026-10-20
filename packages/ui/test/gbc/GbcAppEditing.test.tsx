import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const GROUPS = { groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", "OlivinePort"] } };
const EMPTY_EVENTS = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const EMPTY_WORLD = { family: "gbc", blockPx: 32, placements: {}, components: [], conflicts: [] };

function payload(name: string, over: Partial<GbcMapPayload> = {}): GbcMapPayload {
  return {
    family: "gbc",
    map: {
      name, constName: name.toUpperCase(), group: 1, number: 1, width: 2, height: 1, blkPath: `maps/${name}.blk`,
      tileset: "TILESET_OLIVINE", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P",
      fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
    },
    layout: { blkPath: `maps/${name}.blk`, width: 2, height: 1 },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }],
    metatileCount: 2,
    tileset: { constName: "TILESET_OLIVINE", name: "TilesetOlivine" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], paddingWidth: 3, ...over,
  };
}

const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response);
const DIRTY = { blocks: [{ metatileId: 1 }, { metatileId: 1 }], events: EMPTY_EVENTS, isDirty: true, canUndo: true, canRedo: false };

/** A fetch mock for the whole GBC app plus the edit routes; `calls` records `METHOD url` in order. */
function mockFetch(maps: Record<string, GbcMapPayload>) {
  const calls: string[] = [];
  const f = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/groups") return ok(GROUPS);
    if (url === "/api/world") return ok(EMPTY_WORLD);
    const m = /^\/api\/map\/(.+)$/.exec(url);
    if (m) return ok(maps[decodeURIComponent(m[1]!)]);
    if (/\/discard$/.test(url)) return ok({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false });
    if (/\/plan$/.test(url)) return ok({ changes: [{ path: "maps/OlivineCity.blk", kind: "binary", summary: "1 block changed" }], refusals: [] });
    if (/\/commit$/.test(url)) return ok({ changes: [], refusals: [] });
    if (/\/api\/edit\//.test(url)) return ok(DIRTY);
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", f);
  return { calls, f };
}

async function openCity() {
  await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
  fireEvent.click(screen.getByText("OlivineCity"));
  await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
}

async function paintOnce() {
  fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
  fireEvent.click(screen.getByLabelText("metatile 0x1"));
  const canvas = document.querySelector("canvas.map-canvas__stage")!;
  fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
  fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 });
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
}

describe("GbcApp editing (Plan 7 Task 5)", () => {
  it("dirty guard: cancel keeps the map; Discard discards the server session BEFORE switching", async () => {
    const { calls } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();

    fireEvent.click(screen.getByText("OlivinePort"));
    expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
    expect(calls.some((c) => c.includes("/discard"))).toBe(false);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();

    fireEvent.click(screen.getByText("OlivinePort"));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(document.querySelector(".app__status")!.textContent).toBe("OlivinePort"));
    await waitFor(() => expect(calls).toContain("GET /api/map/OlivinePort"));
    const discardAt = calls.indexOf("POST /api/edit/OlivineCity/discard");
    expect(discardAt).toBeGreaterThan(-1);
    expect(discardAt).toBeLessThan(calls.indexOf("GET /api/map/OlivinePort"));
  });

  it("a failed discard keeps the user on the map and says why", async () => {
    const { f } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();
    const base = f.getMockImplementation()!;
    f.mockImplementation((url: string, init?: RequestInit) => /\/discard$/.test(url) ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response) : base(url, init));
    fireEvent.click(screen.getByText("OlivinePort"));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.getByText(/discard -> 500/)).toBeTruthy());
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
  });

  // Plan 9 characterisation: GbcApp.tsx:159 -- `if (name === selected) go()`: no confirm, no discard.
  it("characterisation (Plan 9): re-clicking the selected map while dirty neither asks nor discards", async () => {
    const { calls } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();

    fireEvent.click(screen.getByRole("button", { name: "OlivineCity" }));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).toBeNull();
    expect(calls.some((c) => c.includes("/discard"))).toBe(false);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
  });

  // Plan 9 characterisation: GbcApp.tsx:152 -- selectMap's go() clears switchError first.
  it("characterisation (Plan 9): a tree re-click of the selected map clears a failed-discard error", async () => {
    const { f } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();
    const base = f.getMockImplementation()!;
    f.mockImplementation((url: string, init?: RequestInit) => /\/discard$/.test(url) ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response) : base(url, init));

    fireEvent.click(screen.getByText("OlivinePort"));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.getByText(/discard -> 500/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "OlivineCity" }));
    await waitFor(() => expect(screen.queryByText(/discard -> 500/)).toBeNull());
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
  });

  // Plan 9 follow-up O1: the toolbar's Discard Changes succeeding on the same map makes the failed-discard error stale.
  it("a successful toolbar discard on the same map clears a failed-discard error", async () => {
    const { f } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();
    const base = f.getMockImplementation()!;
    f.mockImplementation((url: string, init?: RequestInit) => /\/discard$/.test(url) ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response) : base(url, init));
    fireEvent.click(screen.getByText("OlivinePort"));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.getByText(/discard -> 500/)).toBeTruthy());

    f.mockImplementation(base);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    await waitFor(() => expect(screen.queryByTestId("dirty-indicator")).toBeNull());
    await waitFor(() => expect(screen.queryByText(/discard -> 500/)).toBeNull());
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
  });

  // Plan 9 characterisation: GBC's tool lives in GbcMapEditing, which remounts between the Map branch and the
  // World host (GbcApp.tsx:297-335), so a mode round trip resets it. FamilyApp must keep that.
  it("characterisation (Plan 9): the chosen tool resets on a Map -> World -> Map round trip", async () => {
    mockFetch({ OlivineCity: payload("OlivineCity") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "World" }));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("false"));
  });

  it("a clean session switches with no prompt", async () => {
    mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    fireEvent.click(screen.getByText("OlivinePort"));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).toBeNull();
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivinePort");
  });

  it("beforeunload is registered only while dirty", async () => {
    mockFetch({ OlivineCity: payload("OlivineCity") });
    const add = vi.spyOn(window, "addEventListener");
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    expect(add.mock.calls.filter((c) => c[0] === "beforeunload").length).toBe(0);
    await paintOnce();
    expect(add.mock.calls.filter((c) => c[0] === "beforeunload").length).toBe(1);
  });

  it("World <-> Map preserves the session (dirty flag and painted blocks survive)", async () => {
    mockFetch({ OlivineCity: payload("OlivineCity") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();
    fireEvent.click(screen.getByRole("button", { name: "World" }));
    await waitFor(() => expect(document.querySelector("canvas.map-canvas__stage")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("an oversized layout keeps paint tools enabled and shows its size defect", async () => {
    mockFetch({
      OlivineCity: payload("OlivineCity", {
        layout: { blkPath: "maps/OlivineCity.blk", width: 2, height: 1 },
        defects: [{ file: "maps/OlivineCity.blk", kind: "size", fix: "Correct the blockdata size in maps/OlivineCity.blk.", message: "maps/OlivineCity.blk: actual size 9 bytes, expected 2 bytes" }],
      }),
    });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    for (const tool of ["Pencil", "Rect", "Bucket", "Dropper", "Shift"]) {
      const b = screen.getByRole("button", { name: tool }) as HTMLButtonElement;
      expect(b.disabled).toBe(false);
    }
    expect(screen.getByRole("alert").textContent).toContain("maps/OlivineCity.blk: actual size 9 bytes, expected 2 bytes");
    await paintOnce();
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect(screen.getByText(/Select an event to duplicate it/)).toBeTruthy();
  });

  it("Save -> commit -> markClean -> the map payload is re-read", async () => {
    const { calls } = mockFetch({ OlivineCity: payload("OlivineCity") });
    render(<FamilyApp adapter={gbcAdapter} />);
    await openCity();
    await paintOnce();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.getByText("1 block changed")).toBeTruthy());
    const mapReads = () => calls.filter((c) => c === "GET /api/map/OlivineCity").length;
    expect(mapReads()).toBe(1);
    fireEvent.click(screen.getByRole("dialog").querySelector(".save-dialog__btn--primary")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toContain("POST /api/edit/OlivineCity/commit");
    expect(screen.queryByTestId("dirty-indicator")).toBeNull();
    await waitFor(() => expect(mapReads()).toBe(2));
    // the canvas stayed mounted through the reload
    expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy();
  });
});
