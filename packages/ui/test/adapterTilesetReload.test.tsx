import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useGbaRuntime } from "../src/gba/adapter.js";
import { useGbcRuntime } from "../src/gbc/adapter.js";
import type { ShellSlots } from "../src/shell/adapter.js";
import { noteTilesetVersion, resetTilesetVersion } from "../src/shared/tilesetVersion.js";

// Plan H Q7, adapter level: the palette's metatile count is `session count ?? payload count`
// (MapEditingWorkspace / GbcMapEditing), so the payload has to be re-read whenever the count can have
// moved without this map's own session reply -- after a commit (which can append a metatile through the
// block editor's "Save as new") and whenever the hub's tileset version moves (another map's append or
// undo on a shared tileset). These drive the real adapters, not the hooks underneath.

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

const GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["PalletTown"] } };

const GBA_MAP = {
  id: "MAP_PALLET_TOWN", name: "PalletTown", layout: "LAYOUT_PALLET_TOWN", music: "MUS_DUMMY",
  regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
  connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
};
const GBA_LAYOUT = {
  map: GBA_MAP,
  layout: { id: "LAYOUT_PALLET_TOWN", name: "PalletTown_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1 },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: Array.from({ length: 4 }, () => ({ metatileId: 0, collision: 0, elevation: 3, behavior: 0 })),
  primaryCount: 4,
  secondaryCount: 2,
};
/** A session reply carrying the EFFECTIVE counts, as `sendSession` does after an append. */
const GBA_SESSION = { blocks: GBA_LAYOUT.blocks, border: [], map: GBA_MAP, isDirty: false, canUndo: false, canRedo: false, primaryCount: 5, secondaryCount: 2 };
/** "Nothing open" -- GBA's hydration ignores it, so the palette count comes from the map payload alone. */
const GBA_NOTHING_OPEN = { blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false };

const GBC_LAYOUT = {
  family: "gbc",
  // `gbc/mapSurface.tsx` reads `data.map.connections` (and the other map fields) unconditionally, so the
  // fixture carries the real wire shape rather than just `name`/`constName` -- a partial `map` throws in
  // the canvas instead of rendering the palette.
  map: {
    name: "PalletTown", constName: "PALLET_TOWN", group: 1, number: 1, width: 2, height: 1,
    blkPath: "maps/PalletTown.blk", tileset: "T", environment: "E", landmark: "L", music: "X",
    phoneFlag: "0", palette: "P", fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
  },
  layout: { width: 2, height: 1, blkPath: "maps/PalletTown.blk" },
  blocks: Array.from({ length: 2 }, () => ({ metatileId: 0 })), metatileCount: 4,
  tileset: { constName: "T", name: "T" },
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] },
  defects: [], incomplete: [], paddingWidth: 3,
};
/** `isGbcMapPayload` requires `collision.length === metatileCount`, so the count and the collision
 *  row list move together here. */
const gbcPayload = (metatileCount: number) => ({
  ...GBC_LAYOUT,
  metatileCount,
  collision: Array.from({ length: metatileCount }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 })),
});
const GBC_NOTHING_OPEN = { blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false };

const SLOTS = { onStrokeChain: () => {} } as unknown as ShellSlots;
const mapReads = (f: { mock: { calls: unknown[][] } }) => f.mock.calls.filter(([url]) => url === "/api/map/PalletTown").length;

function GbaHarness({ latest }: { latest: { current?: ReturnType<typeof useGbaRuntime> } }) {
  const runtime = useGbaRuntime({ selected: "PalletTown", mode: "map", requestPrompt: () => {} });
  latest.current = runtime;
  return <>{runtime.renderMap(SLOTS)}{runtime.banners}</>;
}

function GbcHarness({ latest }: { latest: { current?: ReturnType<typeof useGbcRuntime> } }) {
  const runtime = useGbcRuntime({ selected: "PalletTown", mode: "map", requestPrompt: () => {} });
  latest.current = runtime;
  return <>{runtime.renderMap(SLOTS)}{runtime.banners}</>;
}

beforeEach(() => { resetTilesetVersion(); });
// No reset in afterEach: it would fire the store's listeners while the adapters are still mounted
// (setup.ts's cleanup runs after this file's hooks), i.e. a re-render outside `act`. Each test starts
// from a clean store instead.
afterEach(() => { vi.unstubAllGlobals(); });

describe("GBA adapter -- the palette follows the reloaded map payload", () => {
  // (a): counts arrive from a session reply, then a commit ("Save as new" then Save) re-reads the map,
  // then Discard drops the session counts -- without the reload the palette falls back to the load-time
  // count and the appended metatile disappears until a map switch.
  it("keeps the appended metatile after a commit and a discard", async () => {
    let disk: unknown = { ...GBA_LAYOUT, primaryCount: 4 };
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(disk);
      if (url === "/api/edit/PalletTown/session") return ok(GBA_SESSION);
      if (url === "/api/edit/PalletTown/discard") return ok({});
      if (url.startsWith("/api/defects/")) return ok({ defects: [], incomplete: [] });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const latest: { current?: ReturnType<typeof useGbaRuntime> } = {};
    render(<GbaHarness latest={latest} />);
    await waitFor(() => expect(latest.current?.map.ready).toBe(true));

    // The session reply's count (5) is what the palette shows before the save.
    await waitFor(() => expect(screen.getByRole("button", { name: "metatile 0x4" })).toBeTruthy());

    // The commit wrote the appended metatile to disk; the payload now reports 5 too. FamilyApp's own
    // onCommitted runs `ctx.onCommitted()` (markClean) before the family's follow-up, so mirror that.
    disk = { ...GBA_LAYOUT, primaryCount: 5 };
    await act(async () => {
      latest.current!.session.markClean();
      latest.current!.saveDialog.onCommitted();
    });
    await waitFor(() => expect(mapReads(fetchMock)).toBe(2));

    // Discard closes the session: its counts go away, so the palette falls back to the payload's.
    await act(async () => { await latest.current!.session.discard(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "metatile 0x4" })).toBeTruthy());
  });

  it("surfaces a failed post-commit reload instead of throwing into the dialog", async () => {
    let mapCalls = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") {
        mapCalls += 1;
        return mapCalls === 1
          ? ok(GBA_LAYOUT)
          : Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      if (url === "/api/edit/PalletTown/session") return ok(GBA_NOTHING_OPEN);
      if (url.startsWith("/api/defects/")) return ok({ defects: [], incomplete: [] });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const latest: { current?: ReturnType<typeof useGbaRuntime> } = {};
    render(<GbaHarness latest={latest} />);
    await waitFor(() => expect(latest.current?.map.ready).toBe(true));

    await act(async () => { latest.current!.saveDialog.onCommitted(); });
    await waitFor(() => expect(screen.getByText(/Saved, but could not reload the map/)).toBeTruthy());
    expect(screen.getByText(/Saved, but could not reload the map/).textContent).toMatch(/500/);
  });

  it("re-reads the map payload when the tileset version moves, with no session open", async () => {
    let disk: unknown = { ...GBA_LAYOUT, primaryCount: 4 };
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(disk);
      if (url === "/api/edit/PalletTown/session") return ok(GBA_NOTHING_OPEN);
      if (url.startsWith("/api/defects/")) return ok({ defects: [], incomplete: [] });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const latest: { current?: ReturnType<typeof useGbaRuntime> } = {};
    render(<GbaHarness latest={latest} />);
    await waitFor(() => expect(latest.current?.map.ready).toBe(true));
    await waitFor(() => expect(mapReads(fetchMock)).toBe(1));
    expect(screen.queryByRole("button", { name: "metatile 0x4" })).toBeNull();

    disk = { ...GBA_LAYOUT, primaryCount: 6 };
    act(() => noteTilesetVersion(1));
    await waitFor(() => expect(mapReads(fetchMock)).toBe(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "metatile 0x5" })).toBeTruthy());
    // The mount value is not a change, so exactly one re-read happened for the one bump.
    act(() => noteTilesetVersion(1));
    expect(mapReads(fetchMock)).toBe(2);
  });
});

describe("GBC adapter -- the palette follows the reloaded map payload", () => {
  it("re-reads the map payload when the tileset version moves, with no session open", async () => {
    let disk: unknown = gbcPayload(4);
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(disk);
      if (url === "/api/edit/PalletTown/session") return ok(GBC_NOTHING_OPEN);
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const latest: { current?: ReturnType<typeof useGbcRuntime> } = {};
    render(<GbcHarness latest={latest} />);
    await waitFor(() => expect(latest.current?.map.ready).toBe(true));
    await waitFor(() => expect(mapReads(fetchMock)).toBe(1));
    // Scoped to the palette header: the canvas status strip also contains "4 metatiles" ("… · 4 metatiles · 2×1").
    const paletteCount = () => document.querySelector(".gbc-metatile-palette__header")?.textContent;
    expect(paletteCount()).toBe("T \u00b7 4 metatiles");

    disk = gbcPayload(6);
    act(() => noteTilesetVersion(1));
    await waitFor(() => expect(mapReads(fetchMock)).toBe(2));
    await waitFor(() => expect(paletteCount()).toBe("T \u00b7 6 metatiles"));
  });

  it("re-reads the map payload after a commit", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/groups") return ok(GROUPS);
      if (url === "/api/map/PalletTown") return ok(gbcPayload(4));
      if (url === "/api/edit/PalletTown/session") return ok(GBC_NOTHING_OPEN);
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const latest: { current?: ReturnType<typeof useGbcRuntime> } = {};
    render(<GbcHarness latest={latest} />);
    await waitFor(() => expect(latest.current?.map.ready).toBe(true));
    await waitFor(() => expect(mapReads(fetchMock)).toBe(1));

    await act(async () => { latest.current!.saveDialog.onCommitted(); });
    await waitFor(() => expect(mapReads(fetchMock)).toBe(2));
  });
});