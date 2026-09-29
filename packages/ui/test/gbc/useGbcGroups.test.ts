import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGbcGroups } from "../../src/gbc/hooks/useGbcGroups.js";

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

  it("does not update state after unmount, even if the fetch resolves later (the cancelled guard)", async () => {
    let resolveFetch!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useGbcGroups());
    expect(result.current).toEqual({ data: null, error: null });

    unmount();
    resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity"] } }) } as Response);

    // Let the now-resolved promise's .then chain run to completion.
    await pending;
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current).toEqual({ data: null, error: null });
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
