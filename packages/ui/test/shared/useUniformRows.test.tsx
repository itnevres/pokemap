import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUniformRows, type ThumbSignature } from "../../src/shared/useUniformRows.js";

/** The signature is the image's alt text, so a test chooses which thumbnails "look" identical. */
const bySig: ThumbSignature = (img) => img.alt || null;
const img = (sig: string) => Object.assign(document.createElement("img"), { alt: sig });
const ROWS = [[0, 1], [2, 3], [4, 5]];

describe("useUniformRows (Plan 9 addendum R-F3)", () => {
  it("marks a row uniform once all its thumbnails loaded with one signature", async () => {
    const { result } = renderHook(() => useUniformRows(ROWS, "A", bySig));
    act(() => {
      result.current.onThumbLoad(0, img("grass"));
      result.current.onThumbLoad(1, img("tree"));
      result.current.onThumbLoad(2, img("blank"));
      result.current.onThumbLoad(3, img("blank"));
      result.current.onThumbLoad(4, img("blank"));
    });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([1]));
  });

  it("a thumbnail that failed to load never makes its row uniform (Review Focus 3)", async () => {
    const { result } = renderHook(() => useUniformRows(ROWS, "A", bySig));
    act(() => {
      result.current.onThumbLoad(2, img("blank"));
      result.current.onThumbError(3);
      result.current.onThumbLoad(4, img("x"));
      result.current.onThumbLoad(5, img("x"));
    });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([2]));
  });

  it("a key change forgets what the old thumbnails looked like (Review Focus 2)", async () => {
    const { result, rerender } = renderHook(({ k }) => useUniformRows(ROWS, k, bySig), { initialProps: { k: "Route1:day" } });
    act(() => {
      result.current.onThumbLoad(0, img("blank"));
      result.current.onThumbLoad(1, img("blank"));
    });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([0]));
    rerender({ k: "Route1:nite" });
    await waitFor(() => expect([...result.current.uniformRows]).toEqual([]));
  });

  it("a one-cell row is never uniform (nothing to compare)", async () => {
    const { result } = renderHook(() => useUniformRows([[7]], "A", bySig));
    act(() => result.current.onThumbLoad(7, img("blank")));
    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.uniformRows.size).toBe(0);
  });
});
