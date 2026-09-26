import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGuardedFetch, describeReceived } from "../src/hooks/useGuardedFetch.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Thing {
  name: string;
}

function isThing(x: unknown): x is Thing {
  return typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).name === "string";
}

describe("describeReceived", () => {
  it("stringifies a value as-is when it's 200 characters or shorter", () => {
    expect(describeReceived({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
  });

  it("truncates a longer stringified value to exactly 200 characters", () => {
    const big = { junk: "x".repeat(500) };
    const result = describeReceived(big);
    expect(result.length).toBe(200);
    expect(result).toBe(JSON.stringify(big).slice(0, 200));
  });

  it("falls back to String(x) if JSON.stringify throws (a circular value)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeReceived(circular)).not.toThrow();
  });
});

describe("useGuardedFetch", () => {
  it("fetches the url and returns the parsed body once it passes the guard", async () => {
    const body = { name: "OlivineCity" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGuardedFetch("/api/thing", isThing));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledWith("/api/thing");
    expect(result.current.data).toEqual(body);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a non-ok response as an error naming the status and the url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGuardedFetch("/api/thing", isThing));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("GET /api/thing -> 503");
    expect(result.current.data).toBeNull();
  });

  it("surfaces a thrown fetch as an error, not an unhandled rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGuardedFetch("/api/thing", isThing));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("network down");
    expect(result.current.data).toBeNull();
  });

  it("surfaces a bad shape as an error naming the received value, truncated to 200 characters", async () => {
    const body = { wrong: "shape", junk: "y".repeat(500) };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGuardedFetch("/api/thing", isThing));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    const expectedFragment = JSON.stringify(body).slice(0, 200);
    expect(result.current.error).toBe(`GET /api/thing returned an unexpected shape: ${expectedFragment}`);
    expect(result.current.data).toBeNull();
  });

  it("uses the optional label, not the url, in its error messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGuardedFetch("/api/thing/enc%2Fname", isThing, "/api/thing/enc/name"));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("GET /api/thing/enc/name -> 404");
    expect(fetchMock).toHaveBeenCalledWith("/api/thing/enc%2Fname");
  });

  it("a null url fetches nothing and idles at { data: null, error: null } (Task 4's useGbcMap: null name)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGuardedFetch(null, isThing));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switching from a real url back to null resets to idle, not the previous data/error", async () => {
    const body = { name: "OlivineCity" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ url }: { url: string | null }) => useGuardedFetch(url, isThing), {
      initialProps: { url: "/api/thing" as string | null },
    });
    await waitFor(() => expect(result.current.data).toEqual(body));

    rerender({ url: null });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
