import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GbcApp } from "../../src/gbc/GbcApp.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const GROUPS = {
  groupOrder: ["OLIVINE", "MAHOGANY"],
  groups: { OLIVINE: ["OlivineCity", "OlivinePort"], MAHOGANY: ["MahoganyTown"] },
};

function mapPayload(name: string, overrides: Partial<GbcMapPayload> = {}): GbcMapPayload {
  return {
    family: "gbc",
    map: {
      name, constName: name.toUpperCase(), group: 1, number: 1, width: 2, height: 1,
      blkPath: `maps/${name}.blk`, tileset: "TILESET_OLIVINE", environment: "ENVIRONMENT_TOWN",
      landmark: "LANDMARK_NONE", music: "MUSIC_NONE", phoneFlag: "0", palette: "PAL_MAP_TOWN",
      fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
    },
    layout: { blkPath: `maps/${name}.blk`, width: 2, height: 1, writable: true },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }],
    metatileCount: 2,
    tileset: { constName: "TILESET_OLIVINE", name: "TilesetOlivine" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: {
      "0": { name: "COLL_FLOOR", category: "land", talk: false },
      "7": { name: "COLL_WALL", category: "wall", talk: false },
    },
    events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] },
    defects: [],
    paddingWidth: 3,
    ...overrides,
  };
}

/** jsdom's CSS attribute-selector parsing chokes on a raw `&`/`?` inside the
 *  quoted value (`querySelector('img[src="...&..."]')` silently returns
 *  null even for a byte-exact match, confirmed against jsdom directly, not
 *  a real absence) -- every exact-src check below goes through this instead
 *  of a CSS attribute selector. */
function imgWithSrc(src: string): HTMLImageElement | undefined {
  return Array.from(document.querySelectorAll("img")).find((i) => i.getAttribute("src") === src);
}

function makeFetchMock(opts: { groupsFail?: boolean; maps?: Record<string, GbcMapPayload | "fail"> } = {}) {
  return vi.fn((url: string) => {
    if (url === "/api/groups") {
      if (opts.groupsFail) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
    }
    const mapMatch = /^\/api\/map\/(.+)$/.exec(url);
    if (mapMatch) {
      const name = decodeURIComponent(mapMatch[1]!);
      const entry = opts.maps?.[name];
      if (entry === "fail" || entry === undefined) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: `no map ${name}` }) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(entry) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe("GbcApp", () => {
  it("shows the real-shaped fixture groups in the tree", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/root/pokemap-corpus/pokecrystal-PerfPlus" />);

    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    expect(screen.getByText("OlivinePort")).toBeTruthy();
    expect(screen.getByText("MahoganyTown")).toBeTruthy();
  });

  it("shows the loading state before groups resolve", () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    expect(screen.getByText(/Loading map groups/)).toBeTruthy();
  });

  it("shows the sidebar error when /api/groups fails", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ groupsFail: true }));
    render(<GbcApp root="/x" />);

    await waitFor(() => expect(screen.getByText(/Could not load map groups/)).toBeTruthy());
  });

  it("clicking a map sets the status and, once the map loads, renders the real canvas", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);

    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));

    // The status span in the header names the selected map immediately.
    const status = document.querySelector(".app__status");
    expect(status?.textContent).toBe("OlivineCity");

    // Once /api/map/OlivineCity resolves, the real canvas mounts (its status
    // strip is always rendered, independent of the <img> ever loading).
    await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE · 2 metatiles · 2×1/)).toBeTruthy());
    expect(imgWithSrc("/api/render/OlivineCity.png?border=1&time=day")).toBeTruthy();
  });

  it("shows a loading placeholder between selecting a map and its payload resolving", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    expect(screen.getByText(/Loading OlivineCity/)).toBeTruthy();
  });

  it("shows a canvas placeholder error when the map payload fails to load", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: "fail" } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(screen.getByText(/Could not load OlivineCity/)).toBeTruthy());
  });

  it("shows 'Select a map' when nothing is selected yet", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    expect(screen.getByText("Select a map")).toBeTruthy();
  });

  it("time buttons: exactly one is aria-pressed, and it starts as Day", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const group = screen.getByRole("group", { name: "Time of day" });
    const buttons = group.querySelectorAll("button");
    expect(buttons.length).toBe(3);

    const pressed = Array.from(buttons).filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed.length).toBe(1);
    expect(pressed[0]?.textContent).toBe("Day");
  });

  it("time reaches the canvas URL: clicking Nite changes it to …time=nite, pinned exactly", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(imgWithSrc("/api/render/OlivineCity.png?border=1&time=day")).toBeTruthy());

    const niteBtn = screen.getByRole("group", { name: "Time of day" }).querySelector("button:nth-child(3)");
    expect(niteBtn?.textContent).toBe("Nite");
    fireEvent.click(niteBtn as HTMLElement);

    expect(imgWithSrc("/api/render/OlivineCity.png?border=1&time=nite")).toBeTruthy();
    expect(niteBtn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("the World toggle swaps to the world placeholder", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const view = screen.getByRole("group", { name: "View" });
    const worldBtn = Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World");
    expect(worldBtn).toBeTruthy();
    fireEvent.click(worldBtn as HTMLElement);

    const placeholder = screen.getByTestId("gbc-world-placeholder");
    expect(placeholder.textContent).toBe("World view (Task 5)");
  });

  it("switching to World view hides the selected-map status", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    expect(document.querySelector(".app__status")?.textContent).toBe("OlivineCity");

    const view = screen.getByRole("group", { name: "View" });
    const worldBtn = Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World");
    fireEvent.click(worldBtn as HTMLElement);

    expect(document.querySelector(".app__status")).toBeNull();
  });

  it("shows the family tag", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    expect(screen.getByText("Crystal")).toBeTruthy();
  });

  it("the defect banner appears for a payload with defects, naming every message", async () => {
    // The banner cares about the PAYLOAD's own defects field, not the map's
    // own name -- so a real tree entry (OlivinePort) is given a
    // CeruleanCave2F-shaped defect list, deliberately, to keep this test's
    // fetch mock aligned with the fixture GROUPS tree above.
    const withDefects = mapPayload("OlivinePort", {
      layout: { blkPath: "maps/OlivinePort.blk", width: 2, height: 1, writable: false },
      defects: [
        { file: "maps/CeruleanCave2F.blk", message: "maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable" },
        { file: "maps/CeruleanCave2F.asm", message: "maps/CeruleanCave2F.asm: warp[0] at (23,7) is outside the 18x30 step grid" },
      ],
    });
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivinePort: withDefects } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    fireEvent.click(screen.getByText("OlivinePort"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("not writable");
    expect(alert.textContent).toContain("outside the 18x30 step grid");
  });

  it("the defect banner is absent when there are no defects", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mounts the metatile palette alongside the canvas, header naming the tileset and count", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));

    await waitFor(() => expect(screen.getByText("TILESET_OLIVINE · 2 metatiles")).toBeTruthy());
    expect(document.querySelectorAll(".gbc-metatile-palette__cell").length).toBe(2);
  });
});
