import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGuardedFetch, describeReceived, fetchGuarded } from "../src/hooks/useGuardedFetch.js";

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

  it("a failed url's error does not survive switching to a good url (spec review finding 3, sticky error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bad") return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "Good" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ url }: { url: string | null }) => useGuardedFetch(url, isThing), {
      initialProps: { url: "/api/bad" as string | null },
    });
    await waitFor(() => expect(result.current.error).toBe("GET /api/bad -> 500"));

    rerender({ url: "/api/good" });
    // The reset happens synchronously in the effect, before the new fetch
    // even resolves -- so the stale error is gone immediately, not just
    // eventually.
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual({ name: "Good" }));
    expect(result.current.error).toBeNull();
  });

  it("the previous url's data is not shown while the next url's fetch is still pending (spec review finding 3, stale payload)", async () => {
    const bodyA = { name: "A" };
    const box: { release: (() => void) | null } = { release: null };
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/a") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(bodyA) });
      return new Promise((resolve) => {
        box.release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ name: "B" }) });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ url }: { url: string | null }) => useGuardedFetch(url, isThing), {
      initialProps: { url: "/api/a" as string | null },
    });
    await waitFor(() => expect(result.current.data).toEqual(bodyA));

    rerender({ url: "/api/b" });
    // While B's fetch is still pending, A's data must NOT still be returned
    // under B's name -- it resets to null immediately, not once B resolves.
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    box.release?.();
    await waitFor(() => expect(result.current.data).toEqual({ name: "B" }));
  });
});

// Fix round (spec review F4): fetchGuarded is the non-hook core useGuardedFetch
// itself now wraps -- unit-tested directly so a per-item fetch loop (e.g.
// GbcWorldCanvas's own encounter cache) has its own coverage of the shared
// fetch->ok->guard->error logic, not just via the hook.
describe("fetchGuarded", () => {
  it("resolves the guarded value on a 200 that passes the guard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ name: "A" }) }));
    await expect(fetchGuarded("/api/a", isThing)).resolves.toEqual({ name: "A" });
  });

  it("rejects with a real Error naming the URL and status on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    await expect(fetchGuarded("/api/a", isThing)).rejects.toThrow("GET /api/a -> 500");
  });

  it("rejects with a real Error naming the received shape when the guard fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ nope: true }) }));
    await expect(fetchGuarded("/api/a", isThing)).rejects.toThrow(/unexpected shape/);
  });

  it("uses label instead of the raw url in its error message when given one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) }));
    await expect(fetchGuarded("/api/a%20b", isThing, "/api/a b")).rejects.toThrow("GET /api/a b -> 404");
  });

  it("guards POST status, JSON, response shape, and network errors", async () => {
    const init = { method: "POST", body: "{}" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    await expect(fetchGuarded("/api/save", isThing, undefined, init)).rejects.toThrow("POST /api/save -> 500");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(new Error("bad JSON")) }));
    await expect(fetchGuarded("/api/save", isThing, undefined, init)).rejects.toThrow("bad JSON");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ nope: true }) }));
    await expect(fetchGuarded("/api/save", isThing, undefined, init)).rejects.toThrow("POST /api/save returned an unexpected shape");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network down")));
    await expect(fetchGuarded("/api/save", isThing, undefined, init)).rejects.toThrow("network down");
  });
});
