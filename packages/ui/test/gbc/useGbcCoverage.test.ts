import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGbcCoverage } from "../../src/gbc/hooks/useGbcCoverage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const VALID_BODY = {
  mapsWithEncounters: 125,
  mapsWithoutEncounters: ["PlayersHouse1F"],
  sourcesByMethod: { grass: 288, water: 62, fish: 40, headbutt: 10, rock: 5 },
  levelByMap: [{ mapName: "Route29", averageLevel: 3.5 }],
  unusedSpecies: ["CELEBI"],
  fishGroupWithoutWater: [],
  defects: [],
};

describe("useGbcCoverage", () => {
  it("fetches /api/coverage once and returns the payload once it passes the guard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcCoverage());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/coverage");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(VALID_BODY);
    expect(result.current.error).toBeNull();
  });

  it("a shape that fails isGbcCoveragePayload becomes a visible error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ mapsWithoutEncounters: "x" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcCoverage());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toContain("/api/coverage");
    expect(result.current.data).toBeNull();
  });

  it("a 500 becomes a visible error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcCoverage());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("GET /api/coverage -> 500");
  });

  it("does not refetch across a re-render", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(VALID_BODY) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() => useGbcCoverage());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender();
    rerender();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
