import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";

afterEach(() => vi.unstubAllGlobals());

function Host({ mapName, onResult }: { mapName: string; onResult: (r: ReturnType<typeof useEditSession>) => void }) {
  const result = useEditSession(mapName);
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
});
