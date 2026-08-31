import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMapGroups } from "../src/hooks/useMapGroups.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMapGroups", () => {
  it("fetches /api/groups and returns the parsed body", async () => {
    const body = { groupOrder: ["gMapGroup_A"], groups: { gMapGroup_A: ["Foo"] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapGroups());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/groups");
    expect(result.current.data).toEqual(body);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a non-ok response as an error, not a thrown exception", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMapGroups());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/500/);
    expect(result.current.data).toBeNull();
  });
});
