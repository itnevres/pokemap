import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStrokeChainRegistry, type SettledChain } from "../../src/shared/useStrokeChain.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useStrokeChainRegistry", () => {
  it("waits for every chain registered when strokeSettled starts", async () => {
    const first = deferred();
    const second = deferred();
    const { result } = renderHook(() => useStrokeChainRegistry());
    act(() => {
      result.current.onStrokeChain({ settled: () => first.promise }, true);
      result.current.onStrokeChain({ settled: () => second.promise }, true);
    });

    let settled = false;
    void result.current.strokeSettled().then(() => { settled = true; });
    await act(async () => {});
    expect(settled).toBe(false);
    first.resolve();
    await act(async () => {});
    expect(settled).toBe(false);
    second.resolve();
    await act(async () => {});
    expect(settled).toBe(true);
  });

  it("keeps waiting for an unmounted chain until its links settle, then drops it", async () => {
    const link = deferred();
    let calls = 0;
    const chain: SettledChain = { settled: () => { calls++; return link.promise; } };
    const { result } = renderHook(() => useStrokeChainRegistry());
    act(() => { result.current.onStrokeChain(chain, true); result.current.onStrokeChain(chain, false); });
    let settled = false;
    void result.current.strokeSettled().then(() => { settled = true; });
    await act(async () => {});
    expect(settled).toBe(false);
    link.resolve();
    await act(async () => {});
    expect(settled).toBe(true);
    const before = calls;
    await result.current.strokeSettled();
    expect(calls).toBe(before); // dropped from the registry
  });

  it("a remount (StrictMode effect re-run) keeps the chain registered after its old links settle", async () => {
    let calls = 0;
    const chain: SettledChain = { settled: () => { calls++; return Promise.resolve(); } };
    const { result } = renderHook(() => useStrokeChainRegistry());
    act(() => { result.current.onStrokeChain(chain, true); result.current.onStrokeChain(chain, false); result.current.onStrokeChain(chain, true); });
    await act(async () => {});
    const before = calls;
    await result.current.strokeSettled();
    expect(calls).toBe(before + 1);
  });

  it("a rejecting or throwing unmounted chain is dropped without an unhandled rejection", async () => {
    const { result } = renderHook(() => useStrokeChainRegistry());
    act(() => {
      result.current.onStrokeChain({ settled: () => Promise.reject(new Error("x")) }, false);
      result.current.onStrokeChain({ settled: () => { throw new Error("y"); } }, false);
    });
    await act(async () => {});
  });

  it("keeps its callbacks stable across a rerender", () => {
    const { result, rerender } = renderHook(({ value }) => useStrokeChainRegistry(), { initialProps: { value: 1 } });
    const first = result.current;
    rerender({ value: 2 });
    expect(result.current.onStrokeChain).toBe(first.onStrokeChain);
    expect(result.current.strokeSettled).toBe(first.strokeSettled);
  });

  it("settles immediately with no registered chains", async () => {
    const { result } = renderHook(() => useStrokeChainRegistry());
    await expect(result.current.strokeSettled()).resolves.toBeUndefined();
  });
});
