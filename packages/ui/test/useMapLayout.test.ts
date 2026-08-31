import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMapLayout } from "../src/hooks/useMapLayout.js";

afterEach(() => {
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
