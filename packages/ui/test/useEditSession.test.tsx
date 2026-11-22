import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";
import type { Block } from "@pokemap/core/src/model/types.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Host({
  mapName, initialBlocks, initialMap, onResult,
}: { mapName: string | null; initialBlocks?: Block[]; initialMap?: MapData; onResult: (r: ReturnType<typeof useEditSession>) => void }) {
  const result = useEditSession(mapName, initialBlocks, initialMap);
  onResult(result);
  return null;
}

// Minimal but real-shaped MapData fixtures (Task 14) -- only the fields the
// event-op tests below actually touch vary between "before" and "after".
const MAP_BEFORE: MapData = {
  id: "MAP_FOO", name: "Foo", layout: "LAYOUT_FOO", music: "MUS_DUMMY",
  regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
  connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
};
const MAP_AFTER: MapData = {
  ...MAP_BEFORE,
  objectEvents: [
    { graphicsId: "OBJ_EVENT_GFX_BOY_1", x: 5, y: 5, elevation: 0, movementType: "MOVEMENT_TYPE_FACE_DOWN", movementRangeX: 1, movementRangeY: 1, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "NULL", flag: "0" },
  ],
};

describe("useEditSession", () => {
  it("beginStroke/applyPaint/endStroke round-trip through the server, updating blocks live", async () => {
    let served: any = { blocks: [{ metatileId: 1, collision: 0, elevation: 0 }], border: [], isDirty: false };
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/paint/apply")) served = { ...served, blocks: [{ metatileId: 9, collision: 0, elevation: 0 }] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" onResult={(r) => { last = r; }} />);

    await act(async () => { await last!.beginStroke(); });
    await act(async () => { await last!.applyPaint({ tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 9 }] }, origin: { x: 0, y: 0 } }); });
    await waitFor(() => expect(last?.blocks[0]?.metatileId).toBe(9));
    await act(async () => { await last!.endStroke(); });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/paint/begin"), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/paint/apply"), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/paint/end"), expect.anything());
  });

  it("undo/redo call the corresponding routes and update blocks/isDirty from the response", async () => {
    let served: any = { blocks: [{ metatileId: 1, collision: 0, elevation: 0 }], border: [], isDirty: true };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" onResult={(r) => { last = r; }} />);
    served = { blocks: [{ metatileId: 0, collision: 0, elevation: 0 }], border: [], isDirty: false };
    await act(async () => { await last!.undo(); });
    expect(last!.isDirty).toBe(false);
  });

  it("threads canUndo/canRedo from the response", async () => {
    const served = { blocks: [], border: [], isDirty: true, canUndo: true, canRedo: false };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response)));
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" onResult={(r) => { last = r; }} />);
    expect(last!.canUndo).toBe(false); // nothing has round-tripped yet
    await act(async () => { await last!.undo(); });
    expect(last!.canUndo).toBe(true);
    expect(last!.canRedo).toBe(false);
  });

  it("mapName === null makes every call a no-op that never touches fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName={null} onResult={(r) => { last = r; }} />);
    await act(async () => {
      await last!.beginStroke();
      await last!.applyPaint({ tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] }, origin: { x: 0, y: 0 } });
      await last!.endStroke();
      await last!.undo();
      await last!.redo();
      // Task 14: the three event-op methods must be no-ops here too, same
      // "nothing open on the server to talk to" guard `call` already has --
      // `callEvent` mirrors it independently (see that function's own doc
      // comment for why it isn't just `call` reused).
      await last!.moveEvent("object", 0, 1, 1);
      await last!.addEvent("object", { graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 0, y: 0, elevation: 0 });
      await last!.deleteEvent("object", 0);
      // Plan 2 follow-up 5: discard() has its own `if (!mapName) return`
      // guard (see its own doc comment) -- same "nothing open to talk to"
      // posture as every other method above.
      await last!.discard();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(last!.isDirty).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Task 14: moveEvent/addEvent/deleteEvent -- the client face of the
  // `/event/move|add|delete` routes (Task 9). Each gets its own test
  // because each posts a different body shape and the routes themselves
  // return a genuinely narrower response than paint/undo/redo's own
  // sendSession shape (see useEditSession.ts's own EventOpResponse doc
  // comment) -- these tests exist specifically to pin that this hook
  // compensates for the missing canUndo/canRedo rather than silently
  // losing them.
  // ---------------------------------------------------------------------

  it("moveEvent posts { kind, index, x, y } to /event/move and updates map/isDirty from the response", async () => {
    const served = { map: MAP_AFTER, isDirty: true };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);
    expect(last!.map).toEqual(MAP_BEFORE);

    await act(async () => { await last!.moveEvent("object", 0, 5, 5); });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/event/move"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ kind: "object", index: 0, x: 5, y: 5 }) }),
    );
    expect(last!.map).toEqual(MAP_AFTER);
    expect(last!.isDirty).toBe(true);
    // Not in the response (EventOpResponse carries only {map,isDirty}) --
    // set locally from EditCommandStack.push's own unconditional semantics,
    // see useEditSession.ts's own doc comment on callEvent.
    expect(last!.canUndo).toBe(true);
    expect(last!.canRedo).toBe(false);
  });

  it("moveEvent forwards a real elevation argument as an `elevation` key in the POST body", async () => {
    const served = { map: MAP_AFTER, isDirty: true };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);

    await act(async () => { await last!.moveEvent("object", 0, 5, 5, 3); });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/event/move"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ kind: "object", index: 0, x: 5, y: 5, elevation: 3 }) }),
    );
  });

  // Negative case (elevation omitted -> no `elevation` key sent) is already
  // pinned by "moveEvent posts { kind, index, x, y } to /event/move..."
  // above -- that test's own body assertion has no `elevation` key, which
  // fails just as loudly if this changed to always send one.

  it("addEvent posts { kind, value } to /event/add and updates map from the response", async () => {
    const served = { map: MAP_AFTER, isDirty: true };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response)));
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);

    const value = { graphics_id: "OBJ_EVENT_GFX_BOY_1", x: 5, y: 5, elevation: 0, movement_type: "MOVEMENT_TYPE_FACE_DOWN", movement_range_x: 1, movement_range_y: 1, trainer_type: "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: "0", script: "NULL", flag: "0" };
    await act(async () => { await last!.addEvent("object", value); });

    expect(last!.map).toEqual(MAP_AFTER);
    expect(last!.canUndo).toBe(true);
    expect(last!.canRedo).toBe(false);
  });

  it("deleteEvent posts { kind, index } to /event/delete and updates map from the response", async () => {
    const served = { map: MAP_BEFORE, isDirty: true };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_AFTER} onResult={(r) => { last = r; }} />);
    expect(last!.map).toEqual(MAP_AFTER);

    await act(async () => { await last!.deleteEvent("object", 0); });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/event/delete"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ kind: "object", index: 0 }) }),
    );
    expect(last!.map).toEqual(MAP_BEFORE);
  });

  // Review fix: deleteEvent used to discard `/event/delete`'s own
  // `warpRenumberWarnings` entirely -- Task 7/9's purpose-built cross-map
  // footgun warning (deleting a warp renumbers every later warp on that
  // map; this reports which OTHER maps' warps now point at the wrong one).
  // Threaded through as deleteEvent's own resolved value so App.tsx can
  // surface it -- see that file's own onDeleteEvent.
  it("deleteEvent resolves with the response's warpRenumberWarnings", async () => {
    const warpRenumberWarnings = [{ fromMapId: "MAP_BAR", warpIndex: 2 }];
    const served = { map: MAP_BEFORE, isDirty: true, warpRenumberWarnings };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response)));
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_AFTER} onResult={(r) => { last = r; }} />);

    let result: unknown;
    await act(async () => { result = await last!.deleteEvent("warp", 0); });
    expect(result).toEqual(warpRenumberWarnings);
  });

  it("deleteEvent resolves with an empty array when the response carries none (a non-warp delete, or the real happy path)", async () => {
    const served = { map: MAP_BEFORE, isDirty: true };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response)));
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_AFTER} onResult={(r) => { last = r; }} />);

    let result: unknown;
    await act(async () => { result = await last!.deleteEvent("object", 0); });
    expect(result).toEqual([]);
  });

  it("seeds map from initialMap on first render, and resets to the new map's own seed when mapName changes", async () => {
    vi.stubGlobal("fetch", vi.fn());
    let last: ReturnType<typeof useEditSession> | undefined;
    const { rerender } = render(<Host mapName="A" initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);
    expect(last!.map).toEqual(MAP_BEFORE);

    rerender(<Host mapName="B" initialMap={MAP_AFTER} onResult={(r) => { last = r; }} />);
    await waitFor(() => expect(last!.map).toEqual(MAP_AFTER));
  });

  it("markClean() resets isDirty/canUndo/canRedo to false without touching blocks or the network", async () => {
    const served = { blocks: [{ metatileId: 5, collision: 0, elevation: 0 }], border: [], isDirty: true, canUndo: true, canRedo: true };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" onResult={(r) => { last = r; }} />);
    await act(async () => { await last!.undo(); }); // isDirty/canUndo/canRedo all true, blocks populated
    expect(last!.isDirty).toBe(true);

    fetchMock.mockClear();
    act(() => { last!.markClean(); });
    expect(last!.isDirty).toBe(false);
    expect(last!.canUndo).toBe(false);
    expect(last!.canRedo).toBe(false);
    expect(last!.blocks).toEqual([{ metatileId: 5, collision: 0, elevation: 0 }]); // untouched
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("seeds blocks from initialBlocks on first render, and resets to the new map's own seed when mapName changes", async () => {
    vi.stubGlobal("fetch", vi.fn());
    let last: ReturnType<typeof useEditSession> | undefined;
    const seedA: Block[] = [{ metatileId: 9, collision: 0, elevation: 0 }];
    const seedB: Block[] = [{ metatileId: 3, collision: 1, elevation: 2 }];
    const { rerender } = render(<Host mapName="A" initialBlocks={seedA} onResult={(r) => { last = r; }} />);
    expect(last!.blocks).toEqual(seedA);

    rerender(<Host mapName="B" initialBlocks={seedB} onResult={(r) => { last = r; }} />);
    await waitFor(() => expect(last!.blocks).toEqual(seedB));
  });

  // ---------------------------------------------------------------------
  // Plan 2 follow-up 5: discard() -- deliberately bypasses call()/
  // applyResponse (see this method's own doc comment on
  // UseEditSessionResult for why). These tests exist specifically to pin
  // that it restores the PRE-EDIT seed, not the server's own `blocks: []`
  // "nothing open" response body -- the exact blank-canvas regression that
  // doc comment warns a naive `call("/discard")` implementation would cause.
  // ---------------------------------------------------------------------

  it("discard() POSTs to /discard and resets blocks/map/isDirty/canUndo/canRedo to the pre-edit seed, not the server's own empty response", async () => {
    // The server's real /discard response -- deliberately the "nothing
    // open" shape (blocks: [], map: null) that must NOT end up as this
    // hook's own post-discard state.
    const served = { blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const seedBlocks: Block[] = [{ metatileId: 7, collision: 0, elevation: 0 }];
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialBlocks={seedBlocks} initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);

    // Dirty the local state first via a real round trip (undo, reusing the
    // generic `call` path), so this test proves discard() actually resets
    // AWAY from a non-clean state, not just that it happens to already
    // match the seed.
    const dirtied = { blocks: [{ metatileId: 99, collision: 0, elevation: 0 }], border: [], isDirty: true, canUndo: true, canRedo: true };
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dirtied) } as Response));
    await act(async () => { await last!.undo(); });
    expect(last!.isDirty).toBe(true);

    await act(async () => { await last!.discard(); });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/discard"), expect.objectContaining({ method: "POST" }));
    expect(last!.blocks).toEqual(seedBlocks); // the PRE-EDIT seed, not []
    expect(last!.map).toEqual(MAP_BEFORE); // not null
    expect(last!.isDirty).toBe(false);
    expect(last!.canUndo).toBe(false);
    expect(last!.canRedo).toBe(false);
  });

  it("discard() throws on a failed response, without resetting local state as if it had succeeded", async () => {
    const dirtied = { blocks: [{ metatileId: 99, collision: 0, elevation: 0 }], border: [], isDirty: true, canUndo: true, canRedo: false };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dirtied) } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const seedBlocks: Block[] = [{ metatileId: 7, collision: 0, elevation: 0 }];
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialBlocks={seedBlocks} initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);
    await act(async () => { await last!.undo(); }); // dirty the local state
    expect(last!.isDirty).toBe(true);

    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response));
    await expect(act(async () => { await last!.discard(); })).rejects.toThrow();

    // A discard that appears to work but didn't actually close the
    // server-side session would desync client/server state -- local state
    // must be left exactly as it was, not silently reset to the seed.
    expect(last!.blocks).toEqual([{ metatileId: 99, collision: 0, elevation: 0 }]);
    expect(last!.isDirty).toBe(true);
  });
  it("blockApply applies the reply's blocks, border and map and resolves true", async () => {
    const served = {
      blocks: [{ metatileId: 42, collision: 1, elevation: 2 }],
      border: [{ metatileId: 43, collision: 3, elevation: 4 }],
      map: {
        id: "MAP_A", name: "A", layout: "LAYOUT_A", music: "MUS_TEST",
        regionMapSection: "MAPSEC_TEST", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
        connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
      },
      isDirty: true, canUndo: true, canRedo: false,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => served }));
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="A" initialBlocks={[{ metatileId: 7, collision: 0, elevation: 0 }]} onResult={(r) => { last = r; }} />);
    await act(async () => { expect(await last!.blockApply({ mode: "ok" }, "rev1")).toBe(true); });
    expect(last!.blocks).toEqual([{ metatileId: 42, collision: 1, elevation: 2 }]);
    expect(last!.border).toEqual([{ metatileId: 43, collision: 3, elevation: 4 }]);
    expect(last!.map).toEqual({
      id: "MAP_A", name: "A", layout: "LAYOUT_A", music: "MUS_TEST",
      regionMapSection: "MAPSEC_TEST", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
      connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
    });
    expect(last!.isDirty).toBe(true);
    expect(last!.canUndo).toBe(true);
    expect(last!.canRedo).toBe(false);
  });
});


describe("effective block counts (Plan 14.2 Task 16)", () => {
  it("copies counts from session replies and retains them across event replies", async () => {
    const session = { blocks: [], border: [], map: MAP_BEFORE, isDirty: true, canUndo: true, canRedo: false };
    const fetchMock = vi.fn((url: string) => {
      const served = url.endsWith("/block/apply")
        ? { ...session, primaryCount: 512, secondaryCount: 41 }
        : url.endsWith("/undo")
          ? { ...session, primaryCount: 512, secondaryCount: 40 }
          : { map: MAP_AFTER, isDirty: true };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(served) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useEditSession> | undefined;
    render(<Host mapName="Test" initialMap={MAP_BEFORE} onResult={(r) => { last = r; }} />);
    expect(last!.primaryCount).toBeUndefined();
    expect(last!.secondaryCount).toBeUndefined();

    await act(async () => { await last!.blockApply({ mode: "ok" }, "rev1"); });
    expect(last!.primaryCount).toBe(512);
    expect(last!.secondaryCount).toBe(41);
    await act(async () => { await last!.moveEvent("object", 0, 5, 5); });
    expect(last!.primaryCount).toBe(512);
    expect(last!.secondaryCount).toBe(41);
    await act(async () => { await last!.undo(); });
    expect(last!.primaryCount).toBe(512);
    expect(last!.secondaryCount).toBe(40);
  });
});


describe("Q1 passive session hydration", () => {
  const seedBlocks: Block[] = [{ metatileId: 1, collision: 0, elevation: 0 }];
  const staged = { blocks: [{ metatileId: 9, collision: 0, elevation: 0 }], border: [], map: MAP_AFTER, isDirty: true, canUndo: true, canRedo: false, primaryCount: 512, secondaryCount: 41 };
  const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

  it("restores a staged session on mount without a mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(staged));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useEditSession("A", seedBlocks, MAP_BEFORE));
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.blocks[0]?.metatileId).toBe(9);
    expect(result.current.map).toEqual(MAP_AFTER);
    expect(result.current.secondaryCount).toBe(41);
    expect(fetchMock.mock.calls).toEqual([["/api/edit/A/session"]]);
  });

  it.each([
    ["nothing open", { blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false }],
    ["wrong shape", { ...staged, blocks: "invalid" }],
  ])("ignores %s and preserves the seed", async (_label, data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(data)));
    const { result } = renderHook(() => useEditSession("A", seedBlocks, MAP_BEFORE));
    await act(async () => {});
    expect(result.current.blocks).toBe(seedBlocks);
    expect(result.current).toMatchObject({ isDirty: false, canUndo: false, canRedo: false });
  });

  it("a paint reply wins over an earlier slow session read", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });
    const painted = { ...staged, blocks: [{ ...staged.blocks[0], metatileId: 22 }], canUndo: false, canRedo: true };
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/session") ? pending : Promise.resolve(response(painted))));
    const { result } = renderHook(() => useEditSession("A", seedBlocks, MAP_BEFORE));
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
    const { result, rerender } = renderHook(({ blocks }) => useEditSession("A", blocks, MAP_BEFORE), { initialProps: { blocks: seedBlocks } });
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

});
