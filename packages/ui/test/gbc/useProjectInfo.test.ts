import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProjectInfo } from "../../src/hooks/useProjectInfo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useProjectInfo", () => {
  it("fetches /api/project and returns the parsed body", async () => {
    const body = { family: "gbc", root: "/root/pokemap-corpus/pokecrystal-PerfPlus" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProjectInfo());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/project");
    expect(result.current.data).toEqual(body);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a non-ok response as an error naming the status, not a thrown exception", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProjectInfo());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/500/);
    expect(result.current.data).toBeNull();
  });

  it("surfaces a thrown fetch as an error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProjectInfo());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/network down/);
    expect(result.current.data).toBeNull();
  });

  it("surfaces a bad shape as an error naming the received value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ family: "n64" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProjectInfo());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toMatch(/n64/);
    expect(result.current.data).toBeNull();
  });

  it("truncates a long bad-shape value to 200 characters", async () => {
    const body = { family: "gba", root: 42, junk: "x".repeat(500) };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProjectInfo());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    const expectedFragment = JSON.stringify(body).slice(0, 200);
    expect(result.current.error).toContain(expectedFragment);
    expect(result.current.error).not.toContain(JSON.stringify(body).slice(0, 201));
  });
});
