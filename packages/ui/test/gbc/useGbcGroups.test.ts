import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGbcGroups } from "../../src/gbc/useGbcGroups.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGbcGroups", () => {
  it("fetches /api/groups and returns the parsed body", async () => {
    const body = { groupOrder: ["OLIVINE", "MAHOGANY"], groups: { OLIVINE: ["OlivineCity"], MAHOGANY: ["MahoganyTown"] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcGroups());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/groups");
    expect(result.current.data).toEqual(body);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a non-ok response as an error naming the status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcGroups());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/500/);
    expect(result.current.data).toBeNull();
  });

  it("surfaces a thrown fetch as an error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcGroups());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/network down/);
  });

  it("surfaces a bad shape (a groupOrder entry missing from groups) as an error", async () => {
    const body = { groupOrder: ["OLIVINE", "MAHOGANY"], groups: { OLIVINE: ["OlivineCity"] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGbcGroups());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.data).toBeNull();
  });
});
