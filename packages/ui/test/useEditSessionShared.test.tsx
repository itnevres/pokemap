import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";
import type { Block } from "@pokemap/core/src/model/types.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";

afterEach(() => vi.unstubAllGlobals());
type Session = ReturnType<typeof useEditSession>;
function Host({ mapName, blocks, map, onResult }: { mapName: string; blocks: Block[]; map: MapData; onResult: (s: Session) => void }) {
  onResult(useEditSession(mapName, blocks, map));
  return null;
}
const seed = [{ metatileId: 1, collision: 0, elevation: 0 }];
const mapA: MapData = { id: "MAP_A", name: "A", layout: "LAYOUT_A", music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE", connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [] };
const mapB: MapData = { ...mapA, id: "MAP_B", name: "B" };
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const painted = (id: number) => ({ blocks: [{ metatileId: id, collision: 0, elevation: 0 }], border: [], isDirty: true, canUndo: true, canRedo: false });
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("GBA shared edit-session witnesses", () => {
  it("discard throws on a failed response and keeps the dirtied session", async () => {
    const dirtied = painted(9);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(dirtied))
      .mockResolvedValueOnce({ ok: false, status: 500 }));
    let last!: Session;
    render(<Host mapName="A" blocks={seed} map={mapA} onResult={(s) => { last = s; }} />);
    await act(() => last.applyPaint({ tool: "shift", dx: 1, dy: 0 }));
    expect(last.blocks).toEqual(dirtied.blocks);
    expect(last.isDirty).toBe(true);

    let caught: unknown;
    await act(async () => {
      try { await last.discard(); } catch (e) { caught = e; }
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("POST /api/edit/A/discard -> 500");
    expect(last.blocks).toEqual(dirtied.blocks);
    expect(last.isDirty).toBe(true);
  });

  it("keeps only the newer out-of-order paint reply", async () => {
    const a = deferred(); const b = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise));
    let last!: Session;
    render(<Host mapName="A" blocks={seed} map={mapA} onResult={(s) => { last = s; }} />);
    const first = last.applyPaint({ tool: "shift", dx: 1, dy: 0 });
    const second = last.applyPaint({ tool: "shift", dx: 2, dy: 0 });
    await act(async () => { b.resolve(response(painted(3))); await second; });
    await act(async () => { a.resolve(response(painted(2))); await first; });
    expect(last.blocks[0]!.metatileId).toBe(3);
  });

  it("drops a moveEvent reply after switching maps", async () => {
    const pending = deferred(); vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    let last!: Session; const onResult = (s: Session) => { last = s; };
    const { rerender } = render(<Host mapName="A" blocks={seed} map={mapA} onResult={onResult} />);
    const reply = last.moveEvent("object", 0, 2, 3);
    rerender(<Host mapName="B" blocks={seed} map={mapB} onResult={onResult} />);
    await act(async () => { pending.resolve(response({ map: mapA, isDirty: true })); await reply; });
    expect(last.map).toBe(mapB);
    expect(last.isDirty).toBe(false);
  });

  it("drops a paint reply issued before a same-map seed refetch", async () => {
    const pending = deferred(); vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    let last!: Session; const onResult = (s: Session) => { last = s; };
    const { rerender } = render(<Host mapName="A" blocks={seed} map={mapA} onResult={onResult} />);
    const reply = last.applyPaint({ tool: "shift", dx: 1, dy: 0 });
    const refreshed = [{ metatileId: 7, collision: 0, elevation: 0 }];
    rerender(<Host mapName="A" blocks={refreshed} map={mapA} onResult={onResult} />);
    await act(async () => { pending.resolve(response(painted(9))); await reply; });
    expect(last.blocks).toBe(refreshed);
    expect(last.isDirty).toBe(false);
  });

  it("does not resurrect an in-flight edit after discard", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response({ blocks: [], map: null })));
    let last!: Session;
    render(<Host mapName="A" blocks={seed} map={mapA} onResult={(s) => { last = s; }} />);
    const reply = last.applyPaint({ tool: "shift", dx: 1, dy: 0 });
    await act(() => last.discard());
    await act(async () => { pending.resolve(response(painted(9))); await reply; });
    expect(last.blocks).toBe(seed);
    expect(last.isDirty).toBe(false);
  });

  it("shows the new seed on the very first render after a map switch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(painted(9))));
    let last!: Session; const renders: Session[] = [];
    const onResult = (s: Session) => { last = s; renders.push(s); };
    const { rerender } = render(<Host mapName="A" blocks={seed} map={mapA} onResult={onResult} />);
    await act(() => last.undo());
    renders.length = 0;
    const nextSeed = [{ metatileId: 7, collision: 0, elevation: 0 }];
    rerender(<Host mapName="B" blocks={nextSeed} map={mapB} onResult={onResult} />);
    expect(renders[0]!.blocks).toBe(nextSeed);
    expect(renders[0]!.map).toBe(mapB);
    expect(renders[0]!.isDirty).toBe(false);
  });
});
