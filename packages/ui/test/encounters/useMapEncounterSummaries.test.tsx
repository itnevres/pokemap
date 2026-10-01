import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMapEncounterSummaries } from "../../src/encounters/useMapEncounterSummaries.js";
import { summariseGba, summariseGbc } from "../../src/encounters/summary.js";

const GBA_METHODS = [
  { method: "land_mons" as const, chances: [{ species: "SPECIES_ESPEON", percent: 37.5, minLevel: 2, maxLevel: 4, slots: [0, 1] }, { species: "SPECIES_RATTATA", percent: 12.5, minLevel: 3, maxLevel: 3, slots: [2] }] },
];
const GBC_SOURCES = [
  { method: "grass" as const, time: "nite" as const, encounterRate: 9.765625, chances: [{ species: "ZUBAT", percent: 10, minLevel: 3, maxLevel: 7 }] },
  { method: "water" as const, encounterRate: 1.953125, chances: [{ species: "POLIWAG", percent: 75, minLevel: 15, maxLevel: 24 }] },
];
const GBA_BODY = { mapName: "Foo", mapId: "MAP_FOO", methods: GBA_METHODS };
const GBC_BODY = { family: "gbc", sources: GBC_SOURCES };

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
let fetchMock: ReturnType<typeof vi.fn>;
const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  fetchMock = vi.fn((url: string) => ok(url.includes("Gbc") ? GBC_BODY : GBA_BODY));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useMapEncounterSummaries", () => {
  it("does not fetch while enabled is false", async () => {
    const { result } = renderHook(() => useMapEncounterSummaries("Foo", "gba", false));
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ summaries: undefined, error: null });
  });

  it("fetches exactly once after enabling, and not again after toggling off and on", async () => {
    const { result, rerender } = renderHook(({ on }) => useMapEncounterSummaries("Foo", "gba", on), { initialProps: { on: false } });
    rerender({ on: true });
    await waitFor(() => expect(result.current.summaries).toBeDefined());
    expect(urls()).toEqual(["/api/encounters/Foo"]);
    rerender({ on: false });
    rerender({ on: true });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.summaries).toBeDefined(); // still served from the cache
  });

  it("a re-toggle while the first fetch is still in flight does not fetch again (the placeholder)", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (release = res)));
    const { result, rerender } = renderHook(({ on }) => useMapEncounterSummaries("Foo", "gba", on), { initialProps: { on: true } });
    rerender({ on: false });
    rerender({ on: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify(GBA_BODY), { status: 200 }));
    await waitFor(() => expect(result.current.summaries).toBeDefined());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("switching map then back fetches each map once", async () => {
    const { result, rerender } = renderHook(({ m }) => useMapEncounterSummaries(m, "gba", true), { initialProps: { m: "Foo" } });
    await waitFor(() => expect(result.current.summaries).toBeDefined());
    rerender({ m: "Bar" });
    await waitFor(() => expect(urls()).toContain("/api/encounters/Bar"));
    await waitFor(() => expect(result.current.summaries).toBeDefined());
    rerender({ m: "Foo" });
    expect(result.current.summaries).toBeDefined();
    await Promise.resolve();
    expect(urls()).toEqual(["/api/encounters/Foo", "/api/encounters/Bar"]);
  });

  it("a late response for a map no longer current is cached but does not change what is shown", async () => {
    let releaseFoo!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (releaseFoo = res)));
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ m }) => {
        renders++;
        return useMapEncounterSummaries(m, "gba", true);
      },
      { initialProps: { m: "Foo" } },
    );
    rerender({ m: "Bar" });
    await waitFor(() => expect(result.current.summaries).toBeDefined()); // Bar's own data
    const before = renders;
    releaseFoo(new Response(JSON.stringify({ methods: [] }), { status: 200 })); // Foo arrives late, empty
    await waitFor(() => expect(renders).toBeGreaterThan(before)); // positive evidence: Foo's answer landed (version bump)
    expect(result.current.summaries).toEqual(summariseGba(GBA_METHODS)); // ...yet Bar is still what is shown
    rerender({ m: "Foo" });
    expect(result.current.summaries).toEqual([]); // Foo's cached late answer
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a GBC-shaped payload for family gba sets error, and is not retried", async () => {
    fetchMock.mockImplementation(() => ok(GBC_BODY));
    const { result, rerender } = renderHook(({ on }) => useMapEncounterSummaries("Foo", "gba", on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/\/api\/encounters\/Foo.*unexpected shape/);
    expect(result.current.summaries).toBeUndefined();
    rerender({ on: false });
    rerender({ on: true });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
  });

  it("a non-OK status sets error with the status", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("nope", { status: 500 })));
    const { result } = renderHook(() => useMapEncounterSummaries("Foo", "gbc", true));
    await waitFor(() => expect(result.current.error).toBe("GET /api/encounters/Foo -> 500"));
  });

  it("the summaries equal summariseGba of a GBA fixture", async () => {
    const { result } = renderHook(() => useMapEncounterSummaries("Foo", "gba", true));
    await waitFor(() => expect(result.current.summaries).toBeDefined());
    expect(result.current.summaries).toEqual(summariseGba(GBA_METHODS));
    expect(result.current.error).toBeNull();
  });

  it("the summaries equal summariseGbc of a GBC fixture (and a GBA-shaped payload is the error there)", async () => {
    const { result } = renderHook(() => useMapEncounterSummaries("Gbc", "gbc", true));
    await waitFor(() => expect(result.current.summaries).toBeDefined());
    expect(result.current.summaries).toEqual(summariseGbc(GBC_SOURCES));
    fetchMock.mockImplementation(() => ok(GBA_BODY));
    const wrong = renderHook(() => useMapEncounterSummaries("Foo", "gbc", true));
    await waitFor(() => expect(wrong.result.current.error).not.toBeNull());
  });

  it("the cache is keyed by family too: the same map name under another family is fetched, not served from the first", async () => {
    const { result, rerender } = renderHook(({ fam }) => useMapEncounterSummaries("Gbc", fam, true), { initialProps: { fam: "gbc" as "gba" | "gbc" } });
    await waitFor(() => expect(result.current.summaries).toEqual(summariseGbc(GBC_SOURCES)));
    rerender({ fam: "gba" });
    expect(result.current.summaries).toBeUndefined(); // not the GBC entry
    await waitFor(() => expect(result.current.error).not.toBeNull()); // GBC body fails the GBA guard
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("encodes the map name in the URL", async () => {
    renderHook(() => useMapEncounterSummaries("A B/C", "gba", true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urls()).toEqual(["/api/encounters/A%20B%2FC"]);
  });
});
