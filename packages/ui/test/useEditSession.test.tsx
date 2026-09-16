import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";
import type { Block } from "@pokemap/core/src/model/types.js";

afterEach(() => vi.unstubAllGlobals());

function Host({
  mapName, initialBlocks, onResult,
}: { mapName: string | null; initialBlocks?: Block[]; onResult: (r: ReturnType<typeof useEditSession>) => void }) {
  const result = useEditSession(mapName, initialBlocks);
  onResult(result);
  return null;
}

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
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(last!.isDirty).toBe(false);
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
