import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { currentTilesetVersion, noteTilesetStamp, resetTilesetVersion, useTilesetVersion } from "../src/shared/tilesetVersion.js";
import { useMapLayout } from "../src/hooks/useMapLayout.js";

beforeEach(() => { resetTilesetVersion(); });

afterEach(() => {
  resetTilesetVersion();
  vi.unstubAllGlobals();
});

const BODY = {
  map: { id: "MAP_FOO", name: "Foo", objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [] },
  layout: { id: "LAYOUT_FOO", name: "Foo_Layout", width: 2, height: 2, borderWidth: 2, borderHeight: 2 },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 1, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 2, collision: 1, elevation: 3, behavior: 0 },
    { metatileId: 3, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 4, collision: 0, elevation: 3, behavior: 0 },
  ],
};

describe("useMapLayout", () => {

  it("moves to a fresh version when the map handler restarted and updates subscribers", async () => {
    noteTilesetStamp({ tilesetVersion: 9, tilesetInstance: "old" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ...BODY, tilesetVersion: 1, tilesetInstance: "new" }),
    }));
    const probe = renderHook(() => useTilesetVersion());
    expect(probe.result.current).toBe(9);
    const map = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(map.result.current.data).not.toBeNull());
    await waitFor(() => expect(probe.result.current).toBe(10));
  });

  it("ignores a response from before reset and accepts a new-generation response", async () => {
    resetTilesetVersion();
    let resolveOld!: (response: Response) => void;
    const oldReply = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(oldReply).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ ...BODY, tilesetVersion: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => resetTilesetVersion());
    await act(async () => {
      resolveOld({ ok: true, status: 200, json: async () => ({ ...BODY, tilesetVersion: 20 }) } as Response);
      await oldReply;
      await Promise.resolve();
    });
    await waitFor(() => expect(first.result.current.data).not.toBeNull());
    expect(currentTilesetVersion()).toBe(0);
    const second = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(second.result.current.data).not.toBeNull());
    await waitFor(() => expect(currentTilesetVersion()).toBe(1));
  });

  it("does not announce a cancelled map response in the same generation", async () => {
    resetTilesetVersion();
    let resolveOld!: (response: Response) => void;
    const oldReply = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(oldReply).mockResolvedValueOnce({
      ok: true, json: async () => ({ ...BODY, tilesetVersion: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender, result } = renderHook(({ name }) => useMapLayout(name), { initialProps: { name: "Foo" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ name: "Bar" });
    await waitFor(() => expect(result.current.data?.tilesetVersion).toBe(1));
    await act(async () => {
      resolveOld({ ok: true, json: async () => ({ ...BODY, tilesetVersion: 20 }) } as Response);
      await oldReply;
      await Promise.resolve();
    });
    expect(currentTilesetVersion()).toBe(1);
  });

  it("returns null and does not fetch when name is null", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMapLayout(null));
    expect(result.current.data).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches /api/map/<name> and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/map/Foo");
    expect(result.current.data).toEqual(BODY);
    expect(result.current.error).toBeNull();
  });

  it("re-fetches when the name changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ name }) => useMapLayout(name), { initialProps: { name: "Foo" as string | null } });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    rerender({ name: "Bar" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/map/Bar"));
  });

  it("surfaces a non-ok response as an error, not a thrown exception", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapLayout("NoSuchMap"));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/404/);
    expect(result.current.data).toBeNull();
  });

  // Plan H Q7: `reload` is the in-place re-read the GBA commit path and the tileset-version
  // follow-up need (GBC's `useGbcMap.reload` equivalent), so the palette can follow an append
  // without a map switch.

  it("reload() refetches in place, keeping the old data and leaving loading alone until the reply lands", async () => {
    let resolveReload!: (response: Response) => void;
    const reloadReply = new Promise<Response>((resolve) => { resolveReload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockReturnValueOnce(reloadReply);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));

    let reload!: Promise<void>;
    await act(async () => { reload = result.current.reload(); await Promise.resolve(); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/map/Foo");
    // In place: the old payload is still there (never nulled) and no loading flag was raised.
    expect(result.current.data?.primaryCount).toBe(4);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveReload({ ok: true, json: async () => ({ ...BODY, primaryCount: 9 }) } as Response);
      await reload;
    });
    expect(result.current.data?.primaryCount).toBe(9);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reload() drops a reply for a map that is no longer selected", async () => {
    let resolveReload!: (response: Response) => void;
    const reloadReply = new Promise<Response>((resolve) => { resolveReload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockReturnValueOnce(reloadReply)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, map: { id: "MAP_BAR", name: "Bar" }, primaryCount: 2 }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ name }) => useMapLayout(name), { initialProps: { name: "Foo" as string | null } });
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));

    let reload!: Promise<void>;
    await act(async () => { reload = result.current.reload(); await Promise.resolve(); });
    rerender({ name: "Bar" });
    await waitFor(() => expect(result.current.data?.map.name).toBe("Bar"));

    await act(async () => {
      resolveReload({ ok: true, json: async () => ({ ...BODY, primaryCount: 9 }) } as Response);
      await reload;
    });
    expect(result.current.data?.map.name).toBe("Bar");
    expect(result.current.data?.primaryCount).toBe(2);
  });

  it("reload() resolves without throwing when the reply lands after unmount", async () => {
    let resolveReload!: (response: Response) => void;
    const reloadReply = new Promise<Response>((resolve) => { resolveReload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockReturnValueOnce(reloadReply);
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));
    let reload!: Promise<void>;
    await act(async () => { reload = result.current.reload(); await Promise.resolve(); });

    unmount();
    await act(async () => {
      resolveReload({ ok: true, json: async () => ({ ...BODY, primaryCount: 9, tilesetVersion: 50 }) } as Response);
      await reload; // a dropped reply must not reject at the caller
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentTilesetVersion()).toBe(0); // and must not announce its stamp either
  });

  it("reload() rejects on a failed fetch and leaves the current data untouched", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));

    await act(async () => {
      await expect(result.current.reload()).rejects.toThrow(/500/);
    });
    expect(result.current.data?.primaryCount).toBe(4);
    expect(result.current.error).toBeNull();
  });
  it("reload() stamps its reply into the tileset store", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 5, tilesetVersion: 7, tilesetInstance: "i" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));
    await act(async () => { await result.current.reload(); });
    expect(currentTilesetVersion()).toBe(7);
  });

  it("reload() reply is dropped after Foo -> Bar -> Foo (a newer load already landed)", async () => {
    let resolveReload!: (response: Response) => void;
    const reloadReply = new Promise<Response>((resolve) => { resolveReload = resolve; });
    const bar = { ...BODY, map: { ...BODY.map, id: "MAP_BAR", name: "Bar" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockReturnValueOnce(reloadReply)
      .mockResolvedValueOnce({ ok: true, json: async () => bar })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 6 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ name }) => useMapLayout(name), { initialProps: { name: "Foo" } });
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));
    let reload!: Promise<void>;
    await act(async () => { reload = result.current.reload(); await Promise.resolve(); });
    rerender({ name: "Bar" });
    await waitFor(() => expect(result.current.data?.map.name).toBe("Bar"));
    rerender({ name: "Foo" });
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(6));
    await act(async () => {
      resolveReload({ ok: true, json: async () => ({ ...BODY, primaryCount: 99 }) } as Response);
      await reload;
    });
    expect(result.current.data?.primaryCount).toBe(6);
  });

  it("reload() keeps the newest reload's payload when an older one lands last", async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 4 }) })
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 8 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));
    let r1!: Promise<void>;
    await act(async () => { r1 = result.current.reload(); await Promise.resolve(); });
    await act(async () => { await result.current.reload(); });
    expect(result.current.data?.primaryCount).toBe(8);
    await act(async () => {
      resolveFirst({ ok: true, json: async () => ({ ...BODY, primaryCount: 5 }) } as Response);
      await r1;
    });
    expect(result.current.data?.primaryCount).toBe(8);
  });

  it("reload() keeps the blocks and map identities when only the counts changed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => structuredClone({ ...BODY, primaryCount: 4 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => structuredClone({ ...BODY, primaryCount: 5 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...BODY, primaryCount: 5, blocks: [{ metatileId: 9, collision: 0, elevation: 3, behavior: 0 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(result.current.data?.primaryCount).toBe(4));
    const before = result.current.data!;
    await act(async () => { await result.current.reload(); });
    expect(result.current.data!.primaryCount).toBe(5);
    expect(result.current.data!.blocks).toBe(before.blocks); // seed identity kept
    expect(result.current.data!.map).toBe(before.map);
    await act(async () => { await result.current.reload(); });
    expect(result.current.data!.blocks).not.toBe(before.blocks); // real change -> new identity
    expect(result.current.data!.map).toBe(before.map);
  });
});
