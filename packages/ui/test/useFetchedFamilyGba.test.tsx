import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMapGroups } from "../src/hooks/useMapGroups.js";
import { useCoverage } from "../src/hooks/useCoverage.js";

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
  mapsWithEncounters: 1, encounterTables: 1, mapsWithoutEncounters: [],
  levelByMap: [{ mapId: "A", mapName: "A", averageLevel: 3 }], unusedSpecies: [],
  byMethod: { land_mons: 1, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 },
};
const coverageB = {
  mapsWithEncounters: 2, encounterTables: 2, mapsWithoutEncounters: [],
  levelByMap: [{ mapId: "B", mapName: "B", averageLevel: 4 }], unusedSpecies: [],
  byMethod: { land_mons: 2, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 },
};

describe("GBA fetched family", () => {
  it("useMapGroups keeps the second StrictMode response when the first resolves late", async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMapGroups(), { reactStrictMode: true });
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

  it("useCoverage keeps the second StrictMode response when the first resolves late", async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCoverage(), { reactStrictMode: true });
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

  it("useMapGroups trusts a malformed server body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ nope: true })));
    const { result } = renderHook(() => useMapGroups());
    await waitFor(() => expect(result.current.data).toEqual({ nope: true }));
    expect(result.current.error).toBeNull();
  });

  it("useCoverage surfaces the exact 404 error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { result } = renderHook(() => useCoverage());
    await waitFor(() => expect(result.current.error).toBe("GET /api/coverage -> 404"));
    expect(result.current.data).toBeNull();
  });
});
