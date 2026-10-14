import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useEditSession } from "../src/hooks/useEditSession.js";
import type { Block } from "@pokemap/core/src/model/types.js";

afterEach(() => vi.unstubAllGlobals());

const blk = (metatileId: number): Block => ({ metatileId, collision: 0, elevation: 0 });
const A = [blk(1)];
const B = [blk(2)];

function Host({ mapName, seed, onResult }: { mapName: string; seed: Block[]; onResult: (r: ReturnType<typeof useEditSession>) => void }) {
  onResult(useEditSession(mapName, seed));
  return null;
}

function setup() {
  let release!: (body: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => {
    release = (body) => resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  })));
  let last!: ReturnType<typeof useEditSession>;
  const onResult = (r: ReturnType<typeof useEditSession>) => { last = r; };
  const u = render(<Host mapName="A" seed={A} onResult={onResult} />);
  return { u, onResult, release: (b: unknown) => release(b), get: () => last };
}

describe("useEditSession response guard (Plan 8 Task 1: a retired stroke's end must not repaint the next map)", () => {
  it("a response for map A that lands after switching to map B is dropped", async () => {
    const h = setup();
    let p!: Promise<void>;
    act(() => { p = h.get().endStroke(); });
    h.u.rerender(<Host mapName="B" seed={B} onResult={h.onResult} />);
    await act(async () => { h.release({ blocks: [blk(99)], border: [], isDirty: true, canUndo: true }); await p; });
    expect(h.get().blocks).toEqual(B);
    expect(h.get().isDirty).toBe(false);
    expect(h.get().canUndo).toBe(false);
  });

  it("a same-map response still applies", async () => {
    const h = setup();
    let p!: Promise<void>;
    act(() => { p = h.get().endStroke(); });
    await act(async () => { h.release({ blocks: [blk(99)], border: [], isDirty: true }); await p; });
    expect(h.get().blocks).toEqual([blk(99)]);
    expect(h.get().isDirty).toBe(true);
  });
});
