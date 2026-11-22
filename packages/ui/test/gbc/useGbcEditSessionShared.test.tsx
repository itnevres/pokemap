import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";

// Keep mutation fixtures and call-order assertions scoped to their routes; hydration has no open session.
function stubMutationFetch(fetcher: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", (url: string, ...args: [RequestInit?]) => url.endsWith("/session")
    ? Promise.resolve({ ok: true, status: 200, json: async () => ({ blocks: [], border: [], map: null, events: null, isDirty: false, canUndo: false, canRedo: false }) } as Response)
    : fetcher(url, ...args));
}

afterEach(() => vi.unstubAllGlobals());
it("GBC does not resurrect an in-flight edit after discard", async () => {
  const seed = [{ metatileId: 1 }];
  const events = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
  let resolve!: (r: Response) => void;
  const pending = new Promise<Response>((r) => { resolve = r; });
  const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
  stubMutationFetch(vi.fn().mockReturnValueOnce(pending).mockResolvedValue(response({ blocks: [], events: null })));
  const { result } = renderHook(() => useGbcEditSession("A", seed, events));
  const reply = result.current.applyPaint({ tool: "shift", dx: 1, dy: 0 });
  await act(() => result.current.discard());
  await act(async () => {
    resolve(response({ blocks: [{ metatileId: 9 }], events, isDirty: true, canUndo: true, canRedo: false }));
    await reply;
  });
  expect(result.current.blocks).toBe(seed);
  expect(result.current.events).toBe(events);
  expect(result.current.isDirty).toBe(false);
});
