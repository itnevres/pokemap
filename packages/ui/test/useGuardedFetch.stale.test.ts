import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { unguarded, useGuardedFetch } from "../src/hooks/useGuardedFetch.js";

afterEach(() => vi.unstubAllGlobals());

function isThing(x: unknown): x is { name: string } {
  return typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).name === "string";
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((release) => { resolve = release; });
  return { promise, resolve };
}

function response(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

describe("useGuardedFetch stale response contract", () => {
  it("returns null data and error while loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(deferred().promise));
    const { result } = renderHook(() => useGuardedFetch("/api/a", isThing));
    expect(result.current).toEqual({ data: null, error: null });
  });

  it("surfaces a rejected fetch as boom with null data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const { result } = renderHook(() => useGuardedFetch("/api/a", isThing));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.data).toBeNull();
  });

  it("keeps B when the old A response resolves after a URL change", async () => {
    const a = deferred();
    const b = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise));
    const { result, rerender } = renderHook(({ url }) => useGuardedFetch(url, isThing), {
      initialProps: { url: "/api/a" },
    });
    rerender({ url: "/api/b" });
    b.resolve(response({ name: "B" }));
    await waitFor(() => expect(result.current.data).toEqual({ name: "B" }));
    a.resolve(response({ name: "A" }));
    await act(async () => {});
    await act(async () => {});
    expect(result.current.data).toEqual({ name: "B" });
  });

  it("unguarded accepts an arbitrary server body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ weird: 1 })));
    const { result } = renderHook(() => useGuardedFetch("/api/x", unguarded));
    await waitFor(() => expect(result.current.data).toEqual({ weird: 1 }));
    expect(result.current.error).toBeNull();
  });
});
