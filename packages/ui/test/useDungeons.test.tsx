import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDungeons } from "../src/hooks/useDungeons.js";

afterEach(() => vi.unstubAllGlobals());

describe("useDungeons", () => {
  it("fetches nothing when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDungeons(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches the list once enabled, and reloads after create/rename/setMaps/remove", async () => {
    let dungeons = [{ id: "1", name: "Mt Moon", maps: ["A"] }];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/dungeons" && (!init || init.method === undefined)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeons) } as Response);
      }
      if (url === "/api/dungeons" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const created = { id: "2", name: body.name, maps: body.maps ?? [] };
        dungeons = [...dungeons, created];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(created) } as Response);
      }
      if (url.startsWith("/api/dungeons/") && init?.method === "PATCH") {
        const id = url.slice("/api/dungeons/".length);
        const body = JSON.parse(String(init.body));
        dungeons = dungeons.map((d) => (d.id === id ? { ...d, ...body } : d));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dungeons.find((d) => d.id === id)) } as Response);
      }
      if (url.startsWith("/api/dungeons/") && init?.method === "DELETE") {
        const id = url.slice("/api/dungeons/".length);
        dungeons = dungeons.filter((d) => d.id !== id);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDungeons(true));
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await result.current.create({ name: "New One", maps: ["B"] });
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    await result.current.rename("1", "Mt Moon Renamed");
    await waitFor(() => expect(result.current.data?.find((d) => d.id === "1")?.name).toBe("Mt Moon Renamed"));

    await result.current.setMaps("1", ["A", "C"]);
    await waitFor(() => expect(result.current.data?.find((d) => d.id === "1")?.maps).toEqual(["A", "C"]));

    await result.current.remove("2");
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it("surfaces a non-ok response as an error, not a thrown exception", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDungeons(true));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/500/);
    expect(result.current.data).toBeNull();
  });

  it("clears a previous error once a later fetch succeeds", async () => {
    let getCalls = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/dungeons" && (!init || init.method === undefined)) {
        getCalls += 1;
        if (getCalls === 1) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: "2", name: "New One", maps: [] }]),
        } as Response);
      }
      if (url === "/api/dungeons" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const created = { id: "2", name: body.name, maps: body.maps ?? [] };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(created) } as Response);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    // First GET fails -- error set.
    const { result } = renderHook(() => useDungeons(true));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/500/);

    // create() POSTs (succeeds) then calls reload(), which re-runs the GET
    // effect -- the second GET (per the mock above) succeeds, and that
    // success path must clear the stale error from the first GET.
    await result.current.create({ name: "New One", maps: [] });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.data).toEqual([{ id: "2", name: "New One", maps: [] }]);
  });
});
