import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEditSessionCore } from "../../src/shared/useEditSessionCore.js";

afterEach(() => vi.unstubAllGlobals());
const seed = { n: 1 };
const flags = { isDirty: true, canUndo: true, canRedo: false };
const response = (data: unknown = {}, status = 200) => ({ ok: status < 400, status, json: vi.fn().mockResolvedValue(data) }) as unknown as Response;
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });
  return { promise, resolve };
}
function mount(map: string | null = "A") {
  return renderHook((p) => useEditSessionCore("/api/edit", p.map, p.seed), { initialProps: { map, seed } });
}

describe("useEditSessionCore", () => {
  it.each(["map", "seed"])("rejects a reply after its %s changes", async (changed) => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { result, rerender } = mount();
    const reply = result.current.post("/x");
    const nextSeed = changed === "map" ? seed : { n: 2 };
    rerender({ map: changed === "map" ? "B" : "A", seed: nextSeed });
    pending.resolve(response());
    const landed = (await reply)!;
    act(() => { expect(result.current.apply({ state: () => ({ n: 9 }), ...flags }, landed.ticket)).toBe(false); });
    expect(result.current.state).toBe(nextSeed);
    expect(result.current.isDirty).toBe(false);
  });

  it("keeps the newer of two out-of-order replies", async () => {
    const first = deferred(); const second = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));
    const { result } = mount();
    const a = result.current.post("/x"); const b = result.current.post("/x");
    second.resolve(response());
    const newer = (await b)!;
    act(() => { expect(result.current.apply({ state: () => ({ n: 3 }) }, newer.ticket)).toBe(true); });
    first.resolve(response());
    const older = (await a)!;
    act(() => { expect(result.current.apply({ state: () => ({ n: 2 }) }, older.ticket)).toBe(false); });
    expect(result.current.state).toEqual({ n: 3 });
  });

  it("discard restores the seed and clears flags without applying the empty reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ blocks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = mount();
    act(() => { result.current.apply({ state: () => ({ n: 9 }), ...flags, canRedo: true }); });
    await act(() => result.current.discard());
    expect(result.current.state).toBe(seed);
    expect(result.current).toMatchObject({ isDirty: false, canUndo: false, canRedo: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/edit/A/discard", { method: "POST" });
  });

  it("discard throws on failure and keeps the applied state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 500)));
    const { result } = mount();
    act(() => { result.current.apply({ state: () => ({ n: 9 }), ...flags }); });
    await expect(result.current.discard()).rejects.toThrow("POST /api/edit/A/discard -> 500");
    expect(result.current.state).toEqual({ n: 9 });
    expect(result.current.isDirty).toBe(true);
  });

  it("discard prevents an in-flight reply from resurrecting the session", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response()));
    const { result } = mount();
    const reply = result.current.post("/x");
    await act(() => result.current.discard());
    pending.resolve(response());
    const landed = (await reply)!;
    act(() => { expect(result.current.apply({ state: () => ({ n: 9 }), ...flags }, landed.ticket)).toBe(false); });
    expect(result.current.state).toBe(seed);
  });

  it("markClean keeps state, clears flags and makes no request, including before any update", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { result } = mount();
    act(() => result.current.markClean());
    expect(result.current.state).toBe(seed);
    act(() => { result.current.apply({ state: () => ({ n: 9 }), ...flags, canRedo: true }); });
    const edited = result.current.state;
    act(() => result.current.markClean());
    expect(result.current.state).toBe(edited);
    expect(result.current).toMatchObject({ isDirty: false, canUndo: false, canRedo: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes flags from the update and preserves omitted state", () => {
    const { result } = mount();
    act(() => { result.current.apply(flags); });
    expect(result.current).toMatchObject(flags);
    expect(result.current.state).toBe(seed);
    act(() => { result.current.apply({ canUndo: false, canRedo: true }); });
    expect(result.current).toMatchObject({ isDirty: true, canUndo: false, canRedo: true });
  });

  it("null map makes post and discard network-free no-ops", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { result } = mount(null);
    expect(await result.current.post("/x")).toBeNull();
    await result.current.discard();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])("reads server error text only when enabled (%s)", async (readServerError) => {
    const r = response({ error: "nope" }, 400);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
    const { result } = renderHook(() => useEditSessionCore("/api/edit", "A", seed, { readServerError }));
    await expect(result.current.post("/x")).rejects.toThrow(readServerError ? "nope" : "POST /api/edit/A/x -> 400");
    expect(r.json).toHaveBeenCalledTimes(readServerError ? 1 : 0);
  });

  it("omits an undefined body but serializes an explicit empty object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetchMock);
    const { result } = mount();
    await result.current.post("/x");
    await result.current.post("/x", {});
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/edit/A/x", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/edit/A/x", { method: "POST", body: "{}" });
  });

  it("applies without a ticket to the current map, starting from its seed", () => {
    const { result, rerender } = mount();
    const apply = result.current.apply;
    act(() => { apply({ state: () => ({ n: 99 }), ...flags }); });
    rerender({ map: "B", seed: { n: 5 } });
    act(() => { expect(apply({ state: (prev) => ({ n: prev.n + 1 }) })).toBe(true); });
    expect(result.current.state).toEqual({ n: 6 });
    expect(result.current).toMatchObject({ isDirty: false, canUndo: false, canRedo: false });
  });
});
