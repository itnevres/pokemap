import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useDungeons } from "../src/hooks/useDungeons.js";

afterEach(() => vi.unstubAllGlobals());

function Host({ enabled, onResult }: { enabled: boolean; onResult: (r: ReturnType<typeof useDungeons>) => void }) {
  const result = useDungeons(enabled);
  onResult(result);
  return null;
}

describe("useDungeons", () => {
  it("fetches nothing when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Host enabled={false} onResult={() => {}} />);
    expect(fetchMock).not.toHaveBeenCalled();
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

    let last: ReturnType<typeof useDungeons> | undefined;
    render(<Host enabled={true} onResult={(r) => { last = r; }} />);
    await waitFor(() => expect(last?.data).toHaveLength(1));

    await last!.create({ name: "New One", maps: ["B"] });
    await waitFor(() => expect(last?.data).toHaveLength(2));

    await last!.rename("1", "Mt Moon Renamed");
    await waitFor(() => expect(last?.data?.find((d) => d.id === "1")?.name).toBe("Mt Moon Renamed"));

    await last!.setMaps("1", ["A", "C"]);
    await waitFor(() => expect(last?.data?.find((d) => d.id === "1")?.maps).toEqual(["A", "C"]));

    await last!.remove("2");
    await waitFor(() => expect(last?.data).toHaveLength(1));
  });
});
