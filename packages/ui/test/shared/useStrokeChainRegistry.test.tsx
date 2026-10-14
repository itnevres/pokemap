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

  it("does not wait for a chain after it unmounts", async () => {
    const never: SettledChain = { settled: () => new Promise<void>(() => {}) };
    const { result } = renderHook(() => useStrokeChainRegistry());
    act(() => {
      result.current.onStrokeChain(never, true);
      result.current.onStrokeChain(never, false);
    });
    await expect(result.current.strokeSettled()).resolves.toBeUndefined();
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
