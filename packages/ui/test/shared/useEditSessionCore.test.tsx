import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { currentTilesetVersion, noteTilesetStamp, resetTilesetVersion, useTilesetVersion } from "../../src/shared/tilesetVersion.js";
import { hasPendingSessionMutations, useEditSessionCore } from "../../src/shared/useEditSessionCore.js";

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
  it.each(["post", "discard", "load"] as const)("%s moves to a fresh version when the handler restarted", async (operation) => {
    resetTilesetVersion();
    noteTilesetStamp({ tilesetVersion: 9, tilesetInstance: "old" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ tilesetVersion: 1, tilesetInstance: "new" })));
    const probe = renderHook(() => useTilesetVersion());
    const { result } = mount();
    expect(probe.result.current).toBe(9);
    await act(async () => {
      if (operation === "post") await result.current.post("/x");
      else await result.current[operation]();
    });
    expect(probe.result.current).toBe(10); // above the old 9, never a repeat of a key this page used
    resetTilesetVersion();
  });

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

  it("a discard that settles after a map switch keeps the new map's record", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { result, rerender } = mount();
    const discard = result.current.discard();
    rerender({ map: "B", seed });
    act(() => { result.current.apply({ state: () => ({ n: 9 }), ...flags }); });
    pending.resolve(response());
    await act(async () => { await discard; });
    expect(result.current.state).toEqual({ n: 9 });
    expect(result.current.isDirty).toBe(true);
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


describe("passive session load", () => {
  it("does not fetch for a null map", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { result } = mount(null);
    await expect(result.current.load()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a single-argument GET and notes the tileset version", async () => {
    resetTilesetVersion();
    const fetchMock = vi.fn().mockResolvedValue(response({ tilesetVersion: 17 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = mount();
    const loaded = await result.current.load<{ tilesetVersion: number }>();
    expect(fetchMock.mock.calls).toEqual([["/api/edit/A/session"]]);
    expect(loaded?.data).toEqual({ tilesetVersion: 17 });
    expect(currentTilesetVersion()).toBe(17);
    resetTilesetVersion();
  });

  it("rejects a slow load that was issued before markClean (a commit closed the session)", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise));
    const { result } = mount();
    const loading = result.current.load<unknown>();
    act(() => result.current.markClean());
    pending.resolve(response({ isDirty: true }));
    const landed = (await loading)!;
    act(() => { expect(result.current.apply({ state: () => ({ n: 9 }), ...flags }, landed.ticket)).toBe(false); });
    expect(result.current.isDirty).toBe(false);
  });

  it.each(["post", "discard"])("rejects a slow load after %s wins", async (winner) => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response()));
    const { result } = mount();
    const loading = result.current.load();
    if (winner === "post") {
      const newer = (await result.current.post("/paint/apply"))!;
      act(() => { expect(result.current.apply({ state: () => ({ n: 3 }), ...flags }, newer.ticket)).toBe(true); });
    } else {
      await act(() => result.current.discard());
    }
    pending.resolve(response());
    const loaded = (await loading)!;
    act(() => { expect(result.current.apply({ state: () => ({ n: 9 }), ...flags }, loaded.ticket)).toBe(false); });
    expect(result.current.state).toEqual(winner === "post" ? { n: 3 } : seed);
  });

  it.each(["network", "status", "json"])("silently ignores %s failure", async (failure) => {
    const fetchMock = failure === "network" ? vi.fn().mockRejectedValue(new Error("offline"))
      : vi.fn().mockResolvedValue(failure === "status" ? response({}, 500)
        : { ok: true, json: () => { throw new Error("bad JSON"); } });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = mount();
    await expect(result.current.load()).resolves.toBeNull();
  });

  it("drops a retired visit's load", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { result, rerender } = mount();
    const loading = result.current.load();
    rerender({ map: "B", seed });
    pending.resolve(response());
    await expect(loading).resolves.toBeNull();
  });
  it("never registers a passive load with the mutation barrier", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { result } = mount();
    const loading = result.current.load();
    expect(hasPendingSessionMutations("A")).toBe(false);
    await result.current.barrier();
    pending.resolve(response());
    await loading;
  });

  it("does not announce a version from a retired project generation", async () => {
    resetTilesetVersion();
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { result } = mount();
    const loading = result.current.load();
    resetTilesetVersion();
    pending.resolve(response({ tilesetVersion: 99 }));
    await loading;
    expect(currentTilesetVersion()).toBe(0);
  });

});
