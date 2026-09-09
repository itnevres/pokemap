import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWorldVisibility } from "../src/hooks/useWorldVisibility.js";

afterEach(() => vi.unstubAllGlobals());

const WORLD_BODY = {
  placements: {
    Town: { map: "Town", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "MAP_TYPE_TOWN", manual: false },
  },
};

describe("useWorldVisibility", () => {
  it("fetches nothing when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWorldVisibility(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.placed).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches /api/world once enabled and exposes mapType/manual per placed map", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(WORLD_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWorldVisibility(true));
    await waitFor(() => expect(result.current.placed).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/world");
    expect(result.current.placed!.get("Town")).toEqual({ mapType: "MAP_TYPE_TOWN", manual: false });
    expect(result.current.placed!.has("NotPlaced")).toBe(false);
  });

  it("surfaces a non-ok response as an error, not a thrown exception", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWorldVisibility(true));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/500/);
    expect(result.current.placed).toBeNull();
  });

  it("starts fetching once enabled transitions to true, and resets placed/error back to null once disabled again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(WORLD_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ enabled }) => useWorldVisibility(enabled), { initialProps: { enabled: false } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.placed).toBeNull();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.placed).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/world");
    expect(result.current.placed!.get("Town")).toEqual({ mapType: "MAP_TYPE_TOWN", manual: false });

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.placed).toBeNull());
    expect(result.current.error).toBeNull();
  });
});
