import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGbcWorld } from "../../src/gbc/hooks/useGbcWorld.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_BODY = {
  family: "gbc",
  blockPx: 32,
  placements: { NewBarkTown: { map: "NewBarkTown", x: 175, y: 251, width: 10, height: 9, component: 0 } },
  components: [{ index: 0, maps: ["NewBarkTown"], bounds: { x: 175, y: 251, width: 10, height: 9 } }],
  conflicts: [],
};

describe("useGbcWorld", () => {
  it("fetches /api/world once and returns the payload once it passes the guard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcWorld());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/world");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(VALID_BODY);
    expect(result.current.error).toBeNull();
  });

  it("a shape that fails isGbcWorldPayload becomes a visible error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ family: "gbc" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcWorld());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toContain("/api/world");
    expect(result.current.data).toBeNull();
  });

  it("a 500 becomes a visible error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcWorld());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("GET /api/world -> 500");
  });

  it("does not refetch across a re-render", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() => useGbcWorld());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender();
    rerender();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
