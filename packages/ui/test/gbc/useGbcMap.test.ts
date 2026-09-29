import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGbcMap } from "../../src/gbc/hooks/useGbcMap.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_BODY = {
  family: "gbc",
  map: { name: "NewBarkTown" },
  layout: { width: 10, height: 9, writable: true, blkPath: "maps/NewBarkTown.blk" },
  blocks: Array.from({ length: 90 }, () => ({ metatileId: 0 })),
  metatileCount: 1,
  tileset: { constName: "TILESET_JOHTO", name: "TilesetJohto" },
  collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }],
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] },
  defects: [],
  paddingWidth: 3,
};

describe("useGbcMap", () => {
  it("name === null fetches nothing and idles", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcMap(null));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches /api/map/:name (encoded) and returns the payload once it passes the guard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcMap("New Bark Town"));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/map/New%20Bark%20Town");
    expect(result.current.data).toEqual(VALID_BODY);
    expect(result.current.error).toBeNull();
  });

  it("a shape that fails isGbcMapPayload becomes a visible error naming /api/map/:name, not the encoded url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ family: "gbc" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcMap("New Bark Town"));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toContain("/api/map/New Bark Town");
    expect(result.current.data).toBeNull();
  });

  it("a 404 becomes a visible error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcMap("NoSuchMap"));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("GET /api/map/NoSuchMap -> 404");
  });

  it("switching from a real name to null resets to idle", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ name }: { name: string | null }) => useGbcMap(name), {
      initialProps: { name: "NewBarkTown" as string | null },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    rerender({ name: null });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
