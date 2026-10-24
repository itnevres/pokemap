import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGbcWorld } from "../../src/gbc/hooks/useGbcWorld.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_BODY = {
  family: "gbc",
  blockPx: 32,
  placements: { NewBarkTown: { map: "NewBarkTown", x: 175, y: 251, width: 10, height: 9, component: 0, mapType: "TOWN", manual: false } },
  components: [{ index: 0, maps: ["NewBarkTown"], bounds: { x: 175, y: 251, width: 10, height: 9 } }],
  conflicts: [],
  sidecar: { dungeonAutoLayout: true },
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

  it("reload() refetches in place and keeps the current data until the new answer lands (Plan 10b SR9)", async () => {
    const second = { ...VALID_BODY, sidecar: { dungeonAutoLayout: false } };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(fetchMock.mock.calls.length > 1 ? second : VALID_BODY) }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcWorld());
    await waitFor(() => expect(result.current.data).toEqual(VALID_BODY));
    act(() => result.current.reload());
    expect(result.current.data).toEqual(VALID_BODY);
    await waitFor(() => expect(result.current.data).toEqual(second));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Plan 11 F1/F3: the canvas snapshots its placement ledger per generation, so it must know which GET produced `data`.
  it("reload() returns the new generation and loadedGen names the generation whose GET produced data", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcWorld());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.loadedGen).toBe(0);
    let first = -1, second = -1;
    act(() => { first = result.current.reload(); second = result.current.reload(); });
    expect([first, second]).toEqual([1, 2]);
    expect(result.current.loadedGen).toBe(0);
    await waitFor(() => expect(result.current.loadedGen).toBe(2));
  });
});
