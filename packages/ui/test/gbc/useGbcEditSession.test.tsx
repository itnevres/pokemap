import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";

afterEach(() => vi.unstubAllGlobals());

const EV: GbcMapEvents = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const SEED_A = [{ metatileId: 1 }, { metatileId: 2 }];
const SEED_B = [{ metatileId: 7 }];
const body = (over: Record<string, unknown> = {}) => ({ blocks: [{ metatileId: 9 }, { metatileId: 2 }], events: EV, isDirty: true, canUndo: true, canRedo: false, ...over });
const reply = (b: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(b) } as Response);

function stub(b: unknown = body(), status = 200) {
  const f = vi.fn((_url: string, _init?: RequestInit) => reply(b, status));
  vi.stubGlobal("fetch", f);
  return f;
}
const lastBody = (f: ReturnType<typeof stub>) => JSON.parse(String(f.mock.calls.at(-1)![1]!.body));

describe("useGbcEditSession", () => {
  it("seeds blocks/events from the payload, clean", () => {
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
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
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
    const f = stub();
    const { result } = renderHook(() => useGbcEditSession(null));
    await act(() => result.current.beginStroke());
    expect(f).not.toHaveBeenCalled();
  });
});
