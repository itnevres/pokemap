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

  it("accepts a restarted map handler's lower version and updates subscribers", async () => {
    noteTilesetStamp({ tilesetVersion: 9, tilesetInstance: "old" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ...BODY, tilesetVersion: 1, tilesetInstance: "new" }),
    }));
    const probe = renderHook(() => useTilesetVersion());
    expect(probe.result.current).toBe(9);
    const map = renderHook(() => useMapLayout("Foo"));
    await waitFor(() => expect(map.result.current.data).not.toBeNull());
    await waitFor(() => expect(probe.result.current).toBe(1));
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
});
