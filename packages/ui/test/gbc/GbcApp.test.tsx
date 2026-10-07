import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { GbcApp } from "../../src/gbc/GbcApp.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

// jsdom does not implement scrollIntoView (GbcMetatilePalette calls it when
// the hover-driven highlight changes).
let originalScrollIntoView: typeof Element.prototype.scrollIntoView;
beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
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

const EMPTY_WORLD = { family: "gbc" as const, blockPx: 32 as const, placements: {}, components: [], conflicts: [] };

function makeFetchMock(opts: { groupsFail?: boolean; maps?: Record<string, GbcMapPayload | "fail">; world?: unknown } = {}) {
  return vi.fn((url: string) => {
    if (url === "/api/groups") {
      if (opts.groupsFail) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
    }
    if (url === "/api/world") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.world ?? EMPTY_WORLD) } as Response);
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
  it("offers Map, World, and Dungeon modes with a scoped empty-selection placeholder", async () => {
    const base = makeFetchMock();
    vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/dungeons"
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response)
      : base(url)));
    render(<GbcApp root="/x" />);
    const view = screen.getByRole("group", { name: "View" });
    expect(view.querySelectorAll("button").length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    await waitFor(() => expect(screen.getByText("Select or create a dungeon")).toBeTruthy());
    expect(screen.getByRole("navigation", { name: "Dungeons" })).toBeTruthy();
  });

  it("shows malformed dungeon list responses and rejected create actions", async () => {
    const base = makeFetchMock();
    let malformed = true;
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/dungeons" && !init) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(malformed ? [{ id: 1 }] : []) } as Response);
      if (url === "/api/dungeons" && init?.method === "POST") return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      return base(url);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<GbcApp root="/x" />);
    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    await waitFor(() => expect(screen.getByText(/Could not load dungeons:.*unexpected shape/)).toBeTruthy());
    malformed = false;
    fireEvent.click(screen.getByRole("button", { name: "+ New Dungeon" }));
    fireEvent.change(screen.getByPlaceholderText("Dungeon name"), { target: { value: "Tower" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.getByText(/POST \/api\/dungeons -> 500/)).toBeTruthy());
  });

  it("creates, opens, edits membership, renames, and deletes a GBC dungeon", async () => {
    const base = makeFetchMock();
    let entries: Array<{ id: string; name: string; maps: string[] }> = [];
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/dungeons" && !init) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(entries.map((entry) => ({ ...entry, maps: [...entry.maps] }))) } as Response);
      if (url === "/api/dungeons" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string; seedMap?: string };
        const created = { id: "d1", name: body.name, maps: body.seedMap ? [body.seedMap] : [] };
        entries = [created];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(created) } as Response);
      }
      if (url === "/api/dungeons/d1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { name?: string; maps?: string[] };
        entries = [{ ...entries[0]!, ...body }];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(entries[0]) } as Response);
      }
      if (url === "/api/dungeons/d1" && init?.method === "DELETE") {
        entries = [];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return base(url);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<GbcApp root="/x" />);
    fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
    fireEvent.click(screen.getByRole("button", { name: "+ New Dungeon" }));
    fireEvent.change(screen.getByPlaceholderText("Dungeon name"), { target: { value: "Tower" } });
    fireEvent.change(screen.getByPlaceholderText("Seed map (optional)"), { target: { value: "OlivineCity" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Connection lines" })).toBeTruthy());
    expect(screen.getByText("OlivineCity")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Add map…"), { target: { value: "OlivinePort" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByText("OlivinePort")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox", { name: "Dungeon name" }), { target: { value: "New Tower" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Dungeon name" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /New Tower/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remove OlivinePort" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove OlivinePort" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Delete dungeon" }));
    await waitFor(() => expect(screen.getByText("Select or create a dungeon")).toBeTruthy());
    expect(entries).toEqual([]);
  });

  it("preserves dungeon pan on rename and refits after membership changes", async () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
    try {
      const world = { family: "gbc" as const, blockPx: 32 as const, placements: {
        OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
        OlivinePort: { map: "OlivinePort", x: 30, y: 0, width: 10, height: 10, component: 1, mapType: "TOWN", manual: false },
      }, components: [], conflicts: [] };
      const base = makeFetchMock({ world });
      let dungeon = { id: "d1", name: "Tower", maps: ["OlivineCity"] };
      vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/dungeons" && !init) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ ...dungeon, maps: [...dungeon.maps] }]) } as Response);
        if (url === "/api/dungeons/d1" && init?.method === "PATCH") {
          dungeon = { ...dungeon, ...JSON.parse(String(init.body)) };
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeon) } as Response);
        }
        return base(url);
      }));
      const { container } = render(<GbcApp root="/x" />);
      fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
      await waitFor(() => expect(screen.getByRole("button", { name: /Tower/ })).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: /Tower/ }));
      const stage = container.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      await waitFor(() => expect(container.querySelector(".world-canvas__status")?.textContent).toContain("zoom 31%"));
      fireEvent.click(stage, { clientX: 20, clientY: 20 });
      fireEvent.mouseDown(stage, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(stage, { clientX: 20, clientY: 10 });
      fireEvent.mouseUp(stage);
      const outline = () => container.querySelector(".world-canvas__selection-outline:not(.world-canvas__jump-highlight)") as HTMLElement;
      expect([outline().style.left, outline().style.top]).toEqual(["20px", "10px"]);
      fireEvent.change(screen.getByRole("textbox", { name: "Dungeon name" }), { target: { value: "New Tower" } });
      fireEvent.blur(screen.getByRole("textbox", { name: "Dungeon name" }));
      await waitFor(() => expect(screen.getByRole("button", { name: /New Tower/ })).toBeTruthy());
      expect([outline().style.left, outline().style.top]).toEqual(["20px", "10px"]);
      fireEvent.change(screen.getByPlaceholderText("Add map…"), { target: { value: "OlivinePort" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => expect([outline().style.left, outline().style.top]).toEqual(["0px", "37.5px"]));
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
      if (height) Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
      else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    }
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")).toEqual(width);
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")).toEqual(height);
  });
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

  it("the World toggle swaps to the real GbcWorldCanvas", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const view = screen.getByRole("group", { name: "View" });
    const worldBtn = Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World");
    expect(worldBtn).toBeTruthy();
    fireEvent.click(worldBtn as HTMLElement);

    expect(document.querySelector(".world-canvas")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/0 components · 0 maps · zoom/)).toBeTruthy());
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

  // Plan 6b Task 5.
  const WORLD_ONE = {
    family: "gbc" as const,
    blockPx: 32 as const,
    placements: { OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false } },
    components: [{ index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } }],
    conflicts: [],
  };

  it("a tree click in World mode jumps GbcWorldCanvas there (jumpToMap/jumpToken wiring)", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ world: WORLD_ONE }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const view = screen.getByRole("group", { name: "View" });
    fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
    await waitFor(() => expect(screen.getByText(/1 components · 1 maps · zoom/)).toBeTruthy());

    fireEvent.click(screen.getByText("OlivineCity"));

    // GbcWorldCanvas's own jump-highlight outline renders once jumpToMap
    // resolves to a real placement -- proof the jumpToMap/jumpToken props
    // actually reached it (not just that `selected` changed).
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
  });

  it("double-clicking a map in World mode opens it in Map view (onOpenMap wiring)", async () => {
    // jsdom elements are 0x0 by default -- a real (non-zero) viewport is
    // needed so GbcWorldCanvas's own initial fit runs and OlivineCity's
    // placement is actually "visible" (culled in otherwise).
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
    try {
      vi.stubGlobal("fetch", makeFetchMock({ world: WORLD_ONE, maps: { OlivineCity: mapPayload("OlivineCity") } }));
      render(<GbcApp root="/x" />);
      await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

      const view = screen.getByRole("group", { name: "View" });
      fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
      // computeFit(10x10 bounds, 100x100 viewport, GBC_ZOOM_BOUNDS): zoom =
      // min(32, max(1/64, min(10,10))) = 10, pan = {0,0} -- OlivineCity fills
      // the whole 100x100 viewport, so (50,50) is inside it. Waiting for the
      // EXACT "31%" (round(10/32*100)) matters: a looser regex matching just
      // "zoom" is satisfied on the very first paint (zoom still the default
      // 1, "3%"), before the initial-fit effect (which runs one render
      // later, once both `world` and a real `viewport` are in) has actually
      // committed.
      await waitFor(() => expect(screen.getByText(/1 components · 1 maps · zoom 31%/)).toBeTruthy());

      const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} });
      fireEvent.doubleClick(canvas, { clientX: 50, clientY: 50 });

      await waitFor(() => expect(document.querySelector(".app__status")?.textContent).toBe("OlivineCity"));
      await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
    } finally {
      if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
  });

  it("a canvas click (no tree click yet) does not jump the view -- pinned exact view (spec review F1)", async () => {
    // jsdom elements are 0x0 by default -- a real viewport is needed so the
    // initial fit actually runs and OlivineCity is "visible".
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
    try {
      vi.stubGlobal("fetch", makeFetchMock({ world: WORLD_ONE }));
      render(<GbcApp root="/x" />);
      await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

      const view = screen.getByRole("group", { name: "View" });
      fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
      await waitFor(() => expect(screen.getByText(/1 components · 1 maps · zoom 31%/)).toBeTruthy());
      const statusBefore = document.querySelector(".world-canvas__status")!.textContent;

      // Before the fix, `GbcApp` passed `jumpToMap={selected}`, so this
      // very first canvas click (the first time `selected` goes from null
      // to a real name) made GbcWorldCanvas's own jump effect see a fresh,
      // never-applied token and perform a full 60%-fill jump -- confirmed
      // live (spec review probe P3: zoom 31% -> 38%, jump-highlight shown)
      // even though nothing here is a tree click.
      const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} });
      fireEvent.click(canvas, { clientX: 50, clientY: 50 }); // selects OlivineCity, which fills the whole fit

      await new Promise((r) => setTimeout(r, 50));
      expect(document.querySelector(".world-canvas__status")!.textContent).toBe(statusBefore); // zoom%/counts unchanged
      expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(); // no jump ever fired

      // Pin the EXACT view, not just "no highlight": the plain selection
      // outline that DOES appear must sit at the ORIGINAL fit's own rect
      // (zoom 10, pan {0,0} for OlivineCity's 10x10 blocks in a 100x100
      // viewport), proving the pan/zoom used for it were never touched.
      const outline = document.querySelector(".world-canvas__selection-outline:not(.world-canvas__jump-highlight)") as HTMLElement;
      expect([outline.style.left, outline.style.top, outline.style.width, outline.style.height]).toEqual(["0px", "0px", "100px", "100px"]);
    } finally {
      if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
  });

  it("a second tree click (a different map) still jumps -- selectVersion must bump on every tree click, not just the first (mutation check X12)", async () => {
    const WORLD_TWO = {
      family: "gbc" as const,
      blockPx: 32 as const,
      placements: {
        OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
        OlivinePort: { map: "OlivinePort", x: 100, y: 100, width: 10, height: 10, component: 1, mapType: "TOWN", manual: false },
      },
      components: [
        { index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
        { index: 1, maps: ["OlivinePort"], bounds: { x: 100, y: 100, width: 10, height: 10 } },
      ],
      conflicts: [],
    };
    vi.stubGlobal("fetch", makeFetchMock({ world: WORLD_TWO }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());

    const view = screen.getByRole("group", { name: "View" });
    fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
    await waitFor(() => expect(screen.getByText(/2 components · 2 maps · zoom/)).toBeTruthy());

    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
    // Let the first jump's own highlight fully fade before the second click,
    // so a spurious "it's still just the first one" false pass is impossible.
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull(), { timeout: 3000 });

    fireEvent.click(screen.getByText("OlivinePort"));
    // If `selectVersion` never bumped, `jumpToken` would still be the value
    // already applied for OlivineCity's own jump, and this second click
    // would silently do nothing at all.
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
  }, 10000);

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

  it("hovering the canvas highlights the matching palette cell (spec review finding 9, mutation check X13)", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ maps: { OlivineCity: mapPayload("OlivineCity") } }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(screen.getByText("TILESET_OLIVINE · 2 metatiles")).toBeTruthy());

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 128, bottom: 96, width: 128, height: 96, x: 0, y: 0, toJSON() {} });
    // Block 1 (metatile id 1) spans composite x [64,96) y [32,64); (80,48) is inside it.
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 48 });

    await waitFor(() => {
      const current = document.querySelector('.gbc-metatile-palette__cell[aria-current="true"]');
      expect(current?.getAttribute("aria-label")).toBe("metatile 0x1");
    });
  });

  it("the palette highlight resets when switching to a different map (spec review finding 9, mutation check X17)", async () => {
    vi.stubGlobal("fetch", makeFetchMock({
      maps: {
        OlivineCity: mapPayload("OlivineCity"),
        MahoganyTown: mapPayload("MahoganyTown", { tileset: { constName: "TILESET_MAHOGANY", name: "TilesetMahogany" } }),
      },
    }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(screen.getByText("TILESET_OLIVINE · 2 metatiles")).toBeTruthy());

    const canvas = document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 128, bottom: 96, width: 128, height: 96, x: 0, y: 0, toJSON() {} });
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 48 });
    await waitFor(() => expect(document.querySelector('.gbc-metatile-palette__cell[aria-current="true"]')).toBeTruthy());

    fireEvent.click(screen.getByText("MahoganyTown"));
    // Both conditions in ONE waitFor (not a waitFor followed by a separate
    // synchronous check): the new map's own palette must never inherit the
    // old highlight, and polling both together gives React's own passive
    // effects every chance to settle before the assertion is taken as final
    // (this selector is scoped to the palette itself -- MapTree's own
    // selected-row button also carries aria-current="true" for an unrelated
    // reason).
    await waitFor(() => {
      expect(screen.getByText("TILESET_MAHOGANY · 2 metatiles")).toBeTruthy();
      expect(document.querySelector('.gbc-metatile-palette__cell[aria-current="true"]')).toBeNull();
    });
    // NOTE (investigated during the fix round): GbcMapCanvas's own
    // pre-existing "fresh overlays/hover on a real map switch" effect
    // (unrelated to this fix round, present since Task 4's original
    // implementation) ALSO calls `hoveredMetatile(null)` whenever ITS OWN
    // `mapName` prop changes. Confirmed by direct instrumentation: that
    // effect fires for the newly-selected map EVEN WITH GbcApp's own reset
    // line (in `selectMap`) removed. This makes the two resets
    // behaviourally redundant for any switch where the new map's canvas
    // successfully mounts -- this test (and any black-box DOM assertion)
    // cannot cleanly attribute a passing result to GbcApp's own line versus
    // GbcMapCanvas's independent one, and the mutation harness confirms it:
    // this test alone reliably kills the mutation, but in a full suite run
    // (more scheduling contention) it can pass even with GbcApp's own reset
    // removed, because GbcMapCanvas's redundant reset still eventually
    // fires. GbcApp's own reset is not dead code -- it is what protects the
    // one case GbcMapCanvas's effect cannot cover (the new map's canvas
    // never mounts at all, e.g. a failed fetch) -- but no DOM-visible
    // symptom exists for that case either (the whole map view is replaced
    // by the error placeholder regardless of the stale value). Recorded
    // here, and in the fix round report, rather than silently claiming a
    // clean kill this test cannot reliably deliver.
  });

  it("only treats a payload as ready once its own map.name matches the current selection (spec review finding 3, stale payload)", async () => {
    const box: { release: (() => void) | null } = { release: null };
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/groups") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
      if (url === "/api/map/OlivineCity") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mapPayload("OlivineCity")) } as Response);
      if (url === "/api/map/OlivinePort") {
        return new Promise<Response>((resolve) => {
          box.release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(mapPayload("OlivinePort")) } as Response);
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(screen.getByText("TILESET_OLIVINE · 2 metatiles")).toBeTruthy());

    fireEvent.click(screen.getByText("OlivinePort"));
    // While OlivinePort's fetch is still pending, OlivineCity's own canvas/
    // palette must NOT still render under OlivinePort's name -- the status
    // span already says OlivinePort, but the map view falls back to Loading.
    expect(document.querySelector(".app__status")?.textContent).toBe("OlivinePort");
    expect(screen.getByText(/Loading OlivinePort/)).toBeTruthy();
    expect(document.querySelector("canvas.map-canvas__stage")).toBeNull();

    box.release?.();
    await waitFor(() => expect(document.querySelector("canvas.map-canvas__stage")).toBeTruthy());
  });
});

describe("GbcApp -- coverage lens list jump (Plan 6c C1)", () => {
  it("clicking an Empty maps list entry in World mode selects that map (tree row becomes current)", async () => {
    // Per-test override: makeFetchMock has no /api/coverage route (it would reject and hide the lenses).
    const world = {
      family: "gbc" as const,
      blockPx: 32 as const,
      placements: { OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false } },
      components: [{ index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } }],
      conflicts: [],
    };
    const base = makeFetchMock({ world });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
        if (url === "/api/coverage") {
          return ok({
            mapsWithEncounters: 0, mapsWithoutEncounters: ["OlivineCity"], sourcesByMethod: {},
            levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [],
          });
        }
        if (url === "/api/species") return ok([]);
        if (url.startsWith("/api/encounters/")) return ok({ family: "gbc", mapName: "OlivineCity", sources: [], defects: [] });
        return base(url);
      }),
    );
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    const currentTreeRow = () => screen.getAllByRole("button", { name: "OlivineCity" }).find((b) => b.getAttribute("aria-current") === "true");
    expect(currentTreeRow()).toBeUndefined();
    expect(document.querySelector(".world-canvas__jump-highlight")).toBeNull();

    const view = screen.getByRole("group", { name: "View" });
    fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
    fireEvent.click(await screen.findByLabelText(/empty maps lens/i));
    fireEvent.click(screen.getByRole("button", { name: "List them" }));
    const ul = screen.getByRole("list", { name: "Maps with no encounters" });
    fireEvent.click(ul.querySelector("button")!);

    await waitFor(() => expect(currentTreeRow()).toBeTruthy());
    // The same jump a tree click makes (see the jumpToMap/jumpToken wiring test above).
    await waitFor(() => expect(document.querySelector(".world-canvas__jump-highlight")).toBeTruthy());
  });
});

describe("GbcApp -- world click selects the map in the tree (Plan 6c C2)", () => {
  it("a canvas click on a map makes its tree row current and scrolls it into view", async () => {
    // jsdom elements are 0x0 by default -- a real viewport so the initial fit runs and OlivineCity is visible
    // (same recipe as the F1 test above).
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
    try {
      const world = {
        family: "gbc" as const,
        blockPx: 32 as const,
        placements: { OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false } },
        components: [{ index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } }],
        conflicts: [],
      };
      vi.stubGlobal("fetch", makeFetchMock({ world }));
      render(<GbcApp root="/x" />);
      await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
      const currentRow = () => document.querySelector<HTMLElement>('.map-tree__map[aria-current="true"]');
      expect(currentRow()).toBeNull();

      const view = screen.getByRole("group", { name: "View" });
      fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
      await waitFor(() => expect(screen.getByText(/1 components · 1 maps · zoom 31%/)).toBeTruthy());
      const scrollSpy = vi.mocked(Element.prototype.scrollIntoView); // the per-file vi.fn installed in beforeEach
      scrollSpy.mockClear();

      const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} });
      fireEvent.click(canvas, { clientX: 50, clientY: 50 });

      await waitFor(() => expect(currentRow()?.textContent).toBe("OlivineCity"));
      expect(scrollSpy.mock.contexts).toContain(currentRow());
      expect(scrollSpy).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
  });
});

describe("GbcApp -- GBC world visibility (Plan 6c D1)", () => {
  it("greys an automatic indoor map in World mode while leaving a town visible", async () => {
    const world = {
      family: "gbc" as const,
      blockPx: 32 as const,
      placements: {
        OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
        OlivinePort: { map: "OlivinePort", x: 11, y: 0, width: 10, height: 10, component: 1, mapType: "INDOOR", manual: false },
      },
      components: [
        { index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
        { index: 1, maps: ["OlivinePort"], bounds: { x: 11, y: 0, width: 10, height: 10 } },
      ],
      conflicts: [],
    };
    vi.stubGlobal("fetch", makeFetchMock({ world }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    const view = screen.getByRole("group", { name: "View" });
    fireEvent.click(Array.from(view.querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
    await waitFor(() => expect(screen.getByText("OlivinePort").className).toContain("greyed"));
    expect(screen.getByText("OlivineCity").className).not.toContain("greyed");
  });

  it("a successful hidden-map drop immediately ungreys its tree row", async () => {
    const world = {
      family: "gbc" as const,
      blockPx: 32 as const,
      placements: {
        OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
        OlivinePort: { map: "OlivinePort", x: 11, y: 0, width: 10, height: 10, component: 1, mapType: "INDOOR", manual: false },
      },
      components: [
        { index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
        { index: 1, maps: ["OlivinePort"], bounds: { x: 11, y: 0, width: 10, height: 10 } },
      ],
      conflicts: [],
    };
    const base = makeFetchMock({ world });
    const fetchMock = vi.fn((url: string) => url === "/api/world/placement"
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response)
      : base(url));
    vi.stubGlobal("fetch", fetchMock);
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(Array.from(screen.getByRole("group", { name: "View" }).querySelectorAll("button")).find((b) => b.textContent === "World") as HTMLElement);
    await waitFor(() => expect(screen.getByText("OlivinePort").className).toContain("greyed"));
    const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    const drop = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperties(drop, { clientX: { value: 100 }, clientY: { value: 100 }, dataTransfer: { value: { getData: () => "OlivinePort" } } });
    fireEvent(canvas, drop);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/world/placement", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getByText("OlivinePort").className).not.toContain("greyed"));
  });
});

describe("GbcApp -- entering World centres on the selection (Plan 6c C2 fix round)", () => {
  // OlivineCity at world x 0, OlivinePort at x 11 (10x10 blocks each). In a 100x100 viewport the initial fit is
  // zoom 100/21 ("15%"); a jump fills 60% (zoom 6, "19%"), centring the target at screen [20,80).
  const TWO = {
    family: "gbc" as const,
    blockPx: 32 as const,
    placements: {
      OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
      OlivinePort: { map: "OlivinePort", x: 11, y: 0, width: 10, height: 10, component: 1, mapType: "TOWN", manual: false },
    },
    components: [
      { index: 0, maps: ["OlivineCity"], bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { index: 1, maps: ["OlivinePort"], bounds: { x: 11, y: 0, width: 10, height: 10 } },
    ],
    conflicts: [],
  };
  async function withViewport(fn: () => Promise<void>) {
    const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 100, configurable: true });
    try {
      await fn();
    } finally {
      if (w) Object.defineProperty(HTMLElement.prototype, "clientWidth", w);
      if (h) Object.defineProperty(HTMLElement.prototype, "clientHeight", h);
    }
  }
  const clickMode = (name: "Map" | "World") =>
    fireEvent.click(Array.from(screen.getByRole("group", { name: "View" }).querySelectorAll("button")).find((b) => b.textContent === name) as HTMLElement);
  const zoomText = () => document.querySelector(".world-canvas__status")?.textContent ?? "";
  const jumpHighlight = () => document.querySelector(".world-canvas__jump-highlight");
  const currentRow = () => document.querySelector<HTMLElement>('.map-tree__map[aria-current="true"]');
  function stageCanvas() {
    const canvas = document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} });
    return canvas;
  }
  async function mountInWorld() {
    vi.stubGlobal("fetch", makeFetchMock({ world: TWO }));
    render(<GbcApp root="/x" />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    clickMode("World");
    await waitFor(() => expect(zoomText()).toContain("2 components · 2 maps · zoom 15%"));
    return stageCanvas();
  }

  it("tree-click A, world-click B, Map, World: the view centres on B, not on the stale tree target A", async () => {
    await withViewport(async () => {
      const canvas = await mountInWorld();
      fireEvent.click(screen.getByText("OlivineCity")); // A: a tree click
      await waitFor(() => expect(zoomText()).toContain("zoom 19%"));
      fireEvent.click(canvas, { clientX: 95, clientY: 50 }); // B = OlivinePort, at screen [86,146) after the jump
      await waitFor(() => expect(currentRow()?.textContent).toBe("OlivinePort"));

      clickMode("Map");
      clickMode("World");

      await waitFor(() => expect(jumpHighlight()).toBeTruthy());
      await waitFor(() => expect(zoomText()).toContain("zoom 19%"));
      fireEvent.click(stageCanvas(), { clientX: 50, clientY: 50 }); // the centre: B if centred on B, A if jumped to the stale A
      await act(async () => {});
      expect(currentRow()?.textContent).toBe("OlivinePort");
    });
  });

  it("world-click B only (no tree click ever), Map, World: jumps to B", async () => {
    await withViewport(async () => {
      const canvas = await mountInWorld();
      fireEvent.click(canvas, { clientX: 80, clientY: 50 }); // OlivinePort at the initial fit: screen x [52,100)
      await waitFor(() => expect(currentRow()?.textContent).toBe("OlivinePort"));
      expect(zoomText()).toContain("zoom 15%");

      clickMode("Map");
      clickMode("World");

      await waitFor(() => expect(zoomText()).toContain("zoom 19%")); // jumped; before, jumpTarget was null and the view stayed at the fit
      await waitFor(() => expect(jumpHighlight()).toBeTruthy());
    });
  });

  it("pressing World while already in World does not re-jump (no new highlight, view kept)", async () => {
    await withViewport(async () => {
      await mountInWorld();
      fireEvent.click(screen.getByText("OlivineCity"));
      await waitFor(() => expect(zoomText()).toContain("zoom 19%"));
      const first = jumpHighlight();
      expect(first).toBeTruthy();

      clickMode("World");
      await act(async () => {});

      const now = jumpHighlight(); // a re-jump mounts a fresh node (keyed on jumpToken); the first may have faded
      expect(now === null || now === first).toBe(true);
      expect(zoomText()).toContain("zoom 19%");
    });
  });
});
