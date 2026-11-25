import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";
import { noteTilesetVersion, resetTilesetVersion } from "../../src/shared/tilesetVersion.js";
import type { GbcMapEvents } from "@pokemap/core/gbc/model/types";

// Keep mutation fixtures and call-order assertions scoped to their routes; hydration has no open session.
function stubMutationFetch(fetcher: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", (url: string, ...args: [RequestInit?]) => url.endsWith("/session")
    ? Promise.resolve({ ok: true, status: 200, json: async () => ({ blocks: [], border: [], map: null, events: null, isDirty: false, canUndo: false, canRedo: false }) } as Response)
    : fetcher(url, ...args));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const EV: GbcMapEvents = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const SEED_A = [{ metatileId: 1 }, { metatileId: 2 }];
const SEED_B = [{ metatileId: 7 }];
const body = (over: Record<string, unknown> = {}) => ({ blocks: [{ metatileId: 9 }, { metatileId: 2 }], events: EV, isDirty: true, canUndo: true, canRedo: false, ...over });
const reply = (b: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(b) } as Response);

function stub(b: unknown = body(), status = 200) {
  const f = vi.fn((_url: string, _init?: RequestInit) => reply(b, status));
  stubMutationFetch(f);
  return f;
}
const lastBody = (f: ReturnType<typeof stub>) => JSON.parse(String(f.mock.calls.at(-1)![1]!.body));

describe("useGbcEditSession", () => {
  it("seeds blocks/events from the payload, clean", () => {
    stub();
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    expect(result.current.blocks).toBe(SEED_A);
    expect(result.current.events).toBe(EV);
    expect(result.current.isDirty).toBe(false);
  });

  it("every method POSTs the right path and body, and applies the response", async () => {
    const f = stub();
    const { result } = renderHook(() => useGbcEditSession("New Bark", SEED_A, EV));
    const stamp = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
    await act(() => result.current.beginStroke());
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/paint/begin");
    await act(() => result.current.applyPaint({ tool: "pencil", targets: [{ x: 0, y: 0 }], stamp, origin: { x: 0, y: 0 } }));
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/paint/apply");
    expect(lastBody(f)).toEqual({ tool: "pencil", targets: [{ x: 0, y: 0 }], stamp, origin: { x: 0, y: 0 } });
    expect(result.current.blocks[0]).toEqual({ metatileId: 9 });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
    await act(() => result.current.endStroke());
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/paint/end");
    await act(() => result.current.undo());
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/undo");
    await act(() => result.current.redo());
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/redo");
    await act(() => result.current.moveEvent("object", 2, 5, 6));
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/event/move");
    expect(lastBody(f)).toEqual({ kind: "object", index: 2, x: 5, y: 6 });
    await act(() => result.current.addEvent("bg", ["1", "2", "BGEVENT_READ", "Script"]));
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/event/add");
    expect(lastBody(f)).toEqual({ kind: "bg", args: ["1", "2", "BGEVENT_READ", "Script"] });
    await act(() => result.current.addEvent("object", ["a"], "MY_CONST"));
    expect(lastBody(f)).toEqual({ kind: "object", args: ["a"], objectConst: "MY_CONST" });
    await act(() => result.current.deleteEvent("coord", 0));
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/New%20Bark/event/delete");
    expect(lastBody(f)).toEqual({ kind: "coord", index: 0 });
  });

  it("deleteEvent returns the server's warpRenumberWarnings (empty when absent)", async () => {
    const w = [{ fromMap: "Other", warpIndex: 1, destWarp: 3 }];
    stub(body({ warpRenumberWarnings: w }));
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    let out: unknown;
    await act(async () => { out = await result.current.deleteEvent("warp", 0); });
    expect(out).toEqual({ warpRenumberWarnings: w });
    stub(body());
    await act(async () => { out = await result.current.deleteEvent("object", 0); });
    expect(out).toEqual({ warpRenumberWarnings: [] });
  });

  it("a malformed response throws and leaves the state unchanged", async () => {
    stub({ blocks: "nope", events: EV, isDirty: true, canUndo: true, canRedo: false });
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(async () => { await expect(result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 })).rejects.toThrow(/unexpected shape/); });
    expect(result.current.blocks).toBe(SEED_A);
    expect(result.current.isDirty).toBe(false);
  });

  it("an error response throws the server's own message (event refusals)", async () => {
    stub({ error: "NewBarkTown object[0]: const is still referenced" }, 400);
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(async () => { await expect(result.current.deleteEvent("object", 0)).rejects.toThrow("const is still referenced"); });
    expect(result.current.isDirty).toBe(false);
  });

  it("undo on a closed session (events: null) is a no-op, not a blank canvas", async () => {
    stub({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false });
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(() => result.current.undo());
    expect(result.current.blocks).toBe(SEED_A);
  });

  it("forMap keying: a map switch never shows the previous map's blocks", async () => {
    stub();
    const { result, rerender } = renderHook(({ n, s }: { n: string; s: typeof SEED_A }) => useGbcEditSession(n, s, EV), { initialProps: { n: "A", s: SEED_A } });
    await act(() => result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    expect(result.current.isDirty).toBe(true);
    rerender({ n: "B", s: SEED_B });
    expect(result.current.blocks).toBe(SEED_B);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("a response landing after the map changed is dropped", async () => {
    let resolve!: (r: Response) => void;
    stubMutationFetch(vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const { result, rerender } = renderHook(({ n, s }: { n: string; s: typeof SEED_A }) => useGbcEditSession(n, s, EV), { initialProps: { n: "A", s: SEED_A } });
    let p!: Promise<void>;
    act(() => { p = result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }); });
    rerender({ n: "B", s: SEED_B });
    await act(async () => { resolve({ ok: true, status: 200, json: () => Promise.resolve(body()) } as Response); await p; });
    expect(result.current.blocks).toBe(SEED_B);
    expect(result.current.isDirty).toBe(false);
  });

  it("discard POSTs /discard and restores the seed, not an empty grid", async () => {
    const f = stub();
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(() => result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    expect(result.current.blocks).not.toBe(SEED_A);
    f.mockImplementation(() => reply({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false }));
    await act(() => result.current.discard());
    expect(f.mock.calls.at(-1)![0]).toBe("/api/edit/A/discard");
    expect(result.current.blocks).toBe(SEED_A);
    expect(result.current.blocks.length).toBe(2);
    expect(result.current.isDirty).toBe(false);
  });

  it("a failed discard throws and keeps the dirty state", async () => {
    const f = stub();
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(() => result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    f.mockImplementation(() => reply({}, 500));
    await act(async () => { await expect(result.current.discard()).rejects.toThrow(/discard -> 500/); });
    expect(result.current.isDirty).toBe(true);
  });

  it("markClean clears the flags but keeps the (now on-disk) blocks", async () => {
    stub();
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(() => result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    act(() => result.current.markClean());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.blocks[0]).toEqual({ metatileId: 9 });
  });

  it("a refetched payload (new seed) replaces the session view", async () => {
    stub();
    const next = [{ metatileId: 5 }, { metatileId: 5 }];
    const { result, rerender } = renderHook(({ s }: { s: typeof SEED_A }) => useGbcEditSession("A", s, EV), { initialProps: { s: SEED_A } });
    await act(() => result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    act(() => result.current.markClean());
    rerender({ s: next });
    await waitFor(() => expect(result.current.blocks).toBe(next));
  });

  it("with no map open every call is a no-op that never touches the network", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useGbcEditSession(null));
    await act(() => result.current.beginStroke());
    expect(f).not.toHaveBeenCalled();
  });
  it("responses resolved out of order: only the newer request's response is applied", async () => {
    const resolvers: ((r: Response) => void)[] = [];
    stubMutationFetch(vi.fn(() => new Promise<Response>((r) => { resolvers.push(r); })));
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => { p1 = result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }); });
    act(() => { p2 = result.current.applyPaint({ tool: "shift", dx: 2, dy: 0 }); });
    const res = (m: number) => ({ ok: true, status: 200, json: () => Promise.resolve(body({ blocks: [{ metatileId: m }, { metatileId: 2 }] })) } as Response);
    await act(async () => { resolvers[1]!(res(22)); await p2; });
    expect(result.current.blocks[0]).toEqual({ metatileId: 22 });
    await act(async () => { resolvers[0]!(res(11)); await p1; });
    expect(result.current.blocks[0]).toEqual({ metatileId: 22 });
  });
  it("blockApply applies the reply's blocks and events and resolves true", async () => {
    stub({
      blocks: [{ metatileId: 42 }],
      events: {
        warps: [{ x: 2, y: 3, mapConst: "MAP_B", destWarp: 1, lineIndex: 4 }],
        coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [],
      },
      isDirty: true, canUndo: true, canRedo: false,
    });
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    await act(async () => { expect(await result.current.blockApply({ mode: "ok" }, "rev1")).toBe(true); });
    expect(result.current.blocks).toEqual([{ metatileId: 42 }]);
    expect(result.current.events).toEqual({
      warps: [{ x: 2, y: 3, mapConst: "MAP_B", destWarp: 1, lineIndex: 4 }],
      coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [],
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });
});


describe("effective block counts (Plan 14.2 Task 16)", () => {
  it("copies counts from session replies and retains them across event replies", async () => {
    const fetchMock = vi.fn((url: string) => reply(
      url.endsWith("/block/apply") ? body({ metatileCount: 41 })
        : url.endsWith("/undo") ? body({ metatileCount: 40 })
          : body(),
    ));
    stubMutationFetch(fetchMock);
    const { result } = renderHook(() => useGbcEditSession("A", SEED_A, EV));
    expect(result.current.metatileCount).toBeUndefined();

    await act(async () => { await result.current.blockApply({ mode: "ok" }, "rev1"); });
    expect(result.current.metatileCount).toBe(41);
    await act(async () => { await result.current.moveEvent("object", 0, 5, 5); });
    expect(result.current.metatileCount).toBe(41);
    await act(async () => { await result.current.undo(); });
    expect(result.current.metatileCount).toBe(40);
  });
});


describe("Q1 passive session hydration", () => {
  const seedBlocks = SEED_A;
  const staged = body({ metatileCount: 41 });
  const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

  it("restores a staged session on mount without a mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(staged));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGbcEditSession("A", seedBlocks, EV));
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.blocks[0]?.metatileId).toBe(9);
    expect(result.current.events).toEqual(EV);
    expect(result.current.metatileCount).toBe(41);
    expect(fetchMock.mock.calls).toEqual([["/api/edit/A/session"]]);
  });

  it.each([
    ["nothing open", { blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false }],
    ["wrong shape", { ...staged, blocks: "invalid" }],
  ])("ignores %s and preserves the seed", async (_label, data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(data)));
    const { result } = renderHook(() => useGbcEditSession("A", seedBlocks, EV));
    await act(async () => {});
    expect(result.current.blocks).toBe(seedBlocks);
    expect(result.current).toMatchObject({ isDirty: false, canUndo: false, canRedo: false });
  });

  it("a paint reply wins over an earlier slow session read", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });
    const painted = { ...staged, blocks: [{ ...staged.blocks[0], metatileId: 22 }], canUndo: false, canRedo: true };
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/session") ? pending : Promise.resolve(response(painted))));
    const { result } = renderHook(() => useGbcEditSession("A", seedBlocks, EV));
    await act(() => result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    expect(result.current.blocks[0]?.metatileId).toBe(22);
    await act(async () => { resolve(response(staged)); await pending; });
    expect(result.current.blocks[0]?.metatileId).toBe(22);
    expect(result.current).toMatchObject({ isDirty: true, canUndo: false, canRedo: true });
  });
  it("retries hydration when the fetched seed arrives", async () => {
    const resolvers: ((r: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolvers.push(resolve); }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ blocks }) => useGbcEditSession("A", blocks, EV), { initialProps: { blocks: seedBlocks } });
    const refreshed = seedBlocks.map(block => ({ ...block, metatileId: 3 }));
    rerender({ blocks: refreshed });
    expect(fetchMock.mock.calls).toEqual([["/api/edit/A/session"], ["/api/edit/A/session"]]);
    await act(async () => { resolvers[0]!(response(staged)); });
    expect(result.current.blocks).toBe(refreshed);
    expect(result.current.isDirty).toBe(false);
    await act(async () => { resolvers[1]!(response(staged)); });
    expect(result.current.blocks[0]?.metatileId).toBe(9);
    expect(result.current.isDirty).toBe(true);
  });

  // Plan H Q7 (b): a shared-tileset append/undo on ANOTHER map moves the hub's tileset version and this
  // map's effective metatile count with it, so the session must be re-read (its reply carries the count
  // through the same apply path) -- while the value this hook mounted with must not trigger a read.
  it("re-reads the session when the tileset version moves and applies its metatile count", async () => {
    resetTilesetVersion();
    let served: unknown = staged;
    const fetchMock = vi.fn((url: string) => url.endsWith("/session")
      ? Promise.resolve(response(served))
      : Promise.reject(new Error(`unexpected fetch ${url}`)));
    vi.stubGlobal("fetch", fetchMock);
    const reads = () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/session")).length;

    const { result } = renderHook(() => useGbcEditSession("A", seedBlocks, EV));
    await waitFor(() => expect(result.current.metatileCount).toBe(41));
    expect(reads()).toBe(1); // the mount read only: the mount value is not a change

    served = body({ metatileCount: 55 });
    act(() => noteTilesetVersion(1));
    await waitFor(() => expect(result.current.metatileCount).toBe(55));
    expect(reads()).toBe(2); // exactly one re-read per version change

    act(() => noteTilesetVersion(1)); // the same value again is not a change
    expect(reads()).toBe(2);
  });

});
