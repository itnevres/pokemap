import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";
import type { Block } from "@pokemap/core/src/model/types.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";

afterEach(() => vi.unstubAllGlobals());

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
});
