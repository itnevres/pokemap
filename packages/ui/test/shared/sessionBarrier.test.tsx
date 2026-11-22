import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { registerSettledSource, sessionMutationBarrier, useEditSessionCore } from "../../src/shared/useEditSessionCore.js";

const offs: Array<() => void> = [];
function register(map: string, settled: () => Promise<void>) { const off = registerSettledSource(map, settled); offs.push(off); return off; }
afterEach(() => { vi.unstubAllGlobals(); while (offs.length) offs.pop()!(); });
function deferred() { let resolve!: () => void; const promise = new Promise<void>((res) => { resolve = res; }); return { promise, resolve }; }
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function settledState(p: Promise<void>): Promise<boolean> {
  let done = false;
  void p.then(() => { done = true; });
  await tick(); await tick();
  return done;
}

describe("sessionMutationBarrier with registered settled sources", () => {
  it("waits for a source even when no session mutation is pending (paint-only session)", async () => {
    const link = deferred();
    const off = register("A", () => link.promise);
    const barrier = sessionMutationBarrier("A");
    expect(await settledState(barrier)).toBe(false);
    link.resolve();
    expect(await settledState(barrier)).toBe(true);
    off();
  });

  it("only waits for sources of its own map", async () => {
    const link = deferred();
    const off = register("B", () => link.promise);
    expect(await settledState(sessionMutationBarrier("A"))).toBe(true);
    link.resolve(); off();
  });

  it("re-checks sources after a pending event create settles", async () => {
    const create = deferred(), late = deferred();
    vi.stubGlobal("fetch", vi.fn(async () => { await create.promise; return { ok: true, status: 200, json: async () => ({}) } as Response; }));
    const { result } = renderHook(() => useEditSessionCore("/api/edit", "A", { n: 1 }));
    let calls = 0;
    // The first look finds the chain quiet; a stroke queued while the create ran makes the second look pending.
    const off = register("A", () => (++calls === 1 ? Promise.resolve() : late.promise));
    void result.current.post("/event/create", {});
    const barrier = sessionMutationBarrier("A");
    await tick();
    create.resolve();
    expect(await settledState(barrier)).toBe(false); // waits for the link that appeared during the create
    late.resolve();
    expect(await settledState(barrier)).toBe(true);
    expect(calls).toBe(2);
    off();
  });

  it("a source that rejects or throws does not deadlock the barrier", async () => {
    const offA = register("A", () => Promise.reject(new Error("link failed")));
    const offB = register("A", () => { throw new Error("sync"); });
    expect(await settledState(sessionMutationBarrier("A"))).toBe(true);
    offA(); offB();
  });

  it("unregister removes the source", async () => {
    const link = deferred();
    const off = register("A", () => link.promise);
    off();
    expect(await settledState(sessionMutationBarrier("A"))).toBe(true);
    link.resolve();
  });

  it("two registrations of one function unregister independently", async () => {
    const link = deferred();
    const source = () => link.promise;
    const first = register("A", source);
    register("A", source);
    first();
    expect(await settledState(sessionMutationBarrier("A"))).toBe(false); // the second registration still counts
    link.resolve();
    expect(await settledState(sessionMutationBarrier("A"))).toBe(true);
  });

  it("a null map never waits", async () => {
    expect(await settledState(sessionMutationBarrier(null))).toBe(true);
  });
});
