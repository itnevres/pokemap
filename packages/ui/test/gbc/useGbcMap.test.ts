import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { currentTilesetVersion, resetTilesetVersion } from "../../src/shared/tilesetVersion.js";
import { useGbcMap } from "../../src/gbc/hooks/useGbcMap.js";

beforeEach(() => { resetTilesetVersion(); });

afterEach(() => {
  resetTilesetVersion();
  vi.unstubAllGlobals();
});

const VALID_BODY = {
  family: "gbc",
  map: { name: "NewBarkTown" },
  layout: { width: 10, height: 9, blkPath: "maps/NewBarkTown.blk" },
  blocks: Array.from({ length: 90 }, () => ({ metatileId: 0 })),
  metatileCount: 1,
  tileset: { constName: "TILESET_JOHTO", name: "TilesetJohto" },
  collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }],
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] },
  defects: [],
  incomplete: [], paddingWidth: 3,
};

describe("useGbcMap", () => {

  it("ignores a response from before reset and accepts a new-generation response", async () => {
    resetTilesetVersion();
    let resolveOld!: (response: Response) => void;
    const oldReply = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(oldReply).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ ...VALID_BODY, tilesetVersion: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useGbcMap("NewBarkTown"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => resetTilesetVersion());
    await act(async () => {
      resolveOld({ ok: true, status: 200, json: async () => ({ ...VALID_BODY, tilesetVersion: 20 }) } as Response);
      await oldReply;
      await Promise.resolve();
    });
    await waitFor(() => expect(first.result.current.data).not.toBeNull());
    expect(currentTilesetVersion()).toBe(0);
    const second = renderHook(() => useGbcMap("NewBarkTown"));
    await waitFor(() => expect(second.result.current.data).not.toBeNull());
    await waitFor(() => expect(currentTilesetVersion()).toBe(1));
  });

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

  it("spec m1: a late reload reply from a retired generation is not noted", async () => {
    let resolveReload!: (response: Response) => void;
    const reloadReply = new Promise<Response>((resolve) => { resolveReload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...VALID_BODY }) })
      .mockReturnValueOnce(reloadReply)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...VALID_BODY, tilesetVersion: 21 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGbcMap("NewBarkTown"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    let reload!: Promise<void>;
    await act(async () => {
      reload = result.current.reload();
      await Promise.resolve();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // The reply is in flight; the family unmounts (or any reset) retires its generation before it lands.
    act(() => resetTilesetVersion());
    await act(async () => {
      resolveReload({ ok: true, status: 200, json: async () => ({ ...VALID_BODY, tilesetVersion: 20 }) } as Response);
      await reload;
    });
    expect(currentTilesetVersion()).toBe(0);
    // A reload issued in the new generation answers 21 and is noted.
    await act(async () => { await result.current.reload(); });
    expect(currentTilesetVersion()).toBe(21);
  });

  it("quality m-1: a map switch clears A's error before B's fetch resolves (no sticky error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/map/MapA") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...VALID_BODY }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ name }: { name: string }) => useGbcMap(name), {
      initialProps: { name: "MapA" },
    });
    await waitFor(() => expect(result.current.error).toBe("GET /api/map/MapA -> 500"));

    rerender({ name: "MapB" });
    // The reset happens synchronously in the effect, before B's fetch even resolves.
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it("quality m-1: A's payload is not returned under B while B's fetch is pending", async () => {
    const bodyA = { ...VALID_BODY, map: { name: "MapA" } };
    const bodyB = { ...VALID_BODY, map: { name: "MapB" } };
    const box: { release: (() => void) | null } = { release: null };
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/map/MapA") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(bodyA) });
      return new Promise((resolve) => {
        box.release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(bodyB) });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ name }: { name: string }) => useGbcMap(name), {
      initialProps: { name: "MapA" },
    });
    await waitFor(() => expect(result.current.data).toBe(bodyA));

    rerender({ name: "MapB" });
    // While B's fetch is still pending, A's payload must not be returned under B -- it resets immediately.
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    box.release?.();
    await waitFor(() => expect(result.current.data).toBe(bodyB));
  });

  it("quality m-1: a cancelled same-generation reply is not noted", async () => {
    let resolveA!: (response: Response) => void;
    const oldReply = new Promise<Response>((resolve) => { resolveA = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldReply)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...VALID_BODY, tilesetVersion: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender, result } = renderHook(({ name }: { name: string }) => useGbcMap(name), {
      initialProps: { name: "MapA" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // No reset: A and B share one generation. B lands and is noted; A's late reply must be dropped.
    rerender({ name: "MapB" });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(currentTilesetVersion()).toBe(1);
    await act(async () => {
      resolveA({ ok: true, status: 200, json: async () => ({ ...VALID_BODY, tilesetVersion: 20 }) } as Response);
      await oldReply;
      await Promise.resolve();
    });
    expect(currentTilesetVersion()).toBe(1);
  });
});
