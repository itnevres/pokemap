import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGbcGroups } from "../../src/gbc/hooks/useGbcGroups.js";
import { useGbcCoverage } from "../../src/gbc/hooks/useGbcCoverage.js";

afterEach(() => vi.unstubAllGlobals());

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((release) => { resolve = release; });
  return { promise, resolve };
}

function response(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

const coverageA = {
  mapsWithEncounters: 125, mapsWithoutEncounters: ["PlayersHouse1F"],
  sourcesByMethod: { grass: 288, water: 62, fish: 40, headbutt: 10, rock: 5 },
  levelByMap: [{ mapName: "Route29", averageLevel: 3.5 }],
  unusedSpecies: ["CELEBI"], fishGroupWithoutWater: [], defects: [],
};
const coverageB = {
  mapsWithEncounters: 126, mapsWithoutEncounters: ["PlayersHouse1F"],
  sourcesByMethod: { grass: 289, water: 62, fish: 40, headbutt: 10, rock: 5 },
  levelByMap: [{ mapName: "Route30", averageLevel: 4.5 }],
  unusedSpecies: ["CELEBI"], fishGroupWithoutWater: [], defects: [],
};

describe("GBC fetched family", () => {
  it("useGbcGroups keeps the second StrictMode response when the first resolves late", async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGbcGroups(), { reactStrictMode: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    second.resolve(response({ groupOrder: ["B"], groups: { B: [] } }));
    await waitFor(() => expect(result.current.data).toEqual({ groupOrder: ["B"], groups: { B: [] } }));
    first.resolve(response({ groupOrder: ["A"], groups: { A: [] } }));
    await act(async () => {});
    await act(async () => {});
    expect(result.current.data).toEqual({ groupOrder: ["B"], groups: { B: [] } });
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("useGbcCoverage keeps the second StrictMode response when the first resolves late", async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGbcCoverage(), { reactStrictMode: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    second.resolve(response(coverageB));
    await waitFor(() => expect(result.current.data).toEqual(coverageB));
    first.resolve(response(coverageA));
    await act(async () => {});
    await act(async () => {});
    expect(result.current.data).toEqual(coverageB);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
