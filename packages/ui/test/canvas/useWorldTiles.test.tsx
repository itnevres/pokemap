import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One small LOD tile per decoded image: counted through the module the hook imports.
vi.mock("../../src/shared/worldTiles.js", () => ({
  buildSmallTile: vi.fn(() => document.createElement("canvas")),
}));

import { buildSmallTile } from "../../src/shared/worldTiles.js";
import { useWorldTiles, type UseWorldTilesOptions } from "../../src/canvas/useWorldTiles.js";

interface P { map: string; width: number; height: number }

/** Never loads by itself: the test fires `onload`/`onerror` by hand. */
class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() { FakeImage.made.push(this); }
}

const A: P = { map: "A", width: 2, height: 3 };
const B: P = { map: "B", width: 4, height: 1 };

// GBC-shaped URL: time of day in the query, `&v=` once a tile version exists.
const imageUrl = (p: P, version: number | undefined) => `/r/${p.map}.png?k=${currentKey}${version ? `&v=${version}` : ""}`;
let currentKey = "day";

type Props = Omit<UseWorldTilesOptions<P>, "imageUrl" | "sizeOf" | "nativePx">;

function setup(initial: Props, strict = false) {
  return renderHook(
    (props: Props) => {
      currentKey = String(props.cacheKey);
      // A fresh imageUrl / sizeOf closure every render, as an inline adapter would pass.
      return useWorldTiles<P>({ ...props, imageUrl: (p, v) => imageUrl(p, v), sizeOf: (p) => ({ width: p.width, height: p.height }), nativePx: 16 });
    },
    // reactStrictMode, not a <StrictMode> wrapper: only the option replays the hook's effects.
    { initialProps: initial, reactStrictMode: strict },
  );
}

function requested(): string[] { return FakeImage.made.map((i) => i.src); }
function images(src: string): FakeImage[] { return FakeImage.made.filter((i) => i.src === src); }
function image(src: string): FakeImage {
  const found = images(src);
  expect(found.length).toBe(1);
  return found[0]!;
}
function land(src: string) { act(() => { image(src).onload?.(); }); }
function fail(src: string) { act(() => { image(src).onerror?.(); }); }

beforeEach(() => {
  FakeImage.made = [];
  currentKey = "day";
  vi.mocked(buildSmallTile).mockClear();
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWorldTiles", () => {
  it("requests each visible map once and draws nothing until its load fires", () => {
    const { result } = setup({ visible: [A, B], cacheKey: "day" });
    expect(requested()).toEqual(["/r/A.png?k=day", "/r/B.png?k=day"]);
    expect(result.current.tileFor("A")).toBeUndefined();
    expect(result.current.version).toBe(0);

    land("/r/A.png?k=day");
    const tile = result.current.tileFor("A");
    expect(tile?.img).toBe(image("/r/A.png?k=day"));
    expect(tile?.small).toBeInstanceOf(HTMLCanvasElement);
    expect(result.current.tileFor("B")).toBeUndefined();
    expect(result.current.version).toBe(1);
  });

  it("requests nothing for a map outside the visible list (culling is the caller's list)", () => {
    setup({ visible: [A], cacheKey: "day" });
    expect(requested()).toEqual(["/r/A.png?k=day"]);
  });

  it("requests once under StrictMode's double effects, and that one request still lands", () => {
    const { result } = setup({ visible: [A], cacheKey: "day" }, true);
    expect(requested()).toEqual(["/r/A.png?k=day"]);
    land("/r/A.png?k=day");
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day"));
  });

  it("does not re-request or bump the version on unrelated re-renders", () => {
    const { result, rerender } = setup({ visible: [A], cacheKey: "day" });
    land("/r/A.png?k=day");
    expect(result.current.version).toBe(1);
    rerender({ visible: [A], cacheKey: "day" });
    rerender({ visible: [A], cacheKey: "day", tileVersions: {} });
    expect(requested()).toEqual(["/r/A.png?k=day"]);
    expect(result.current.version).toBe(1);
  });

  it("P12-7: a tile-version bump keeps the old image drawing until the new image loads, then swaps", () => {
    const { result, rerender } = setup({ visible: [A, B], cacheKey: "day" });
    land("/r/A.png?k=day");
    land("/r/B.png?k=day");
    const oldA = result.current.tileFor("A");
    const oldB = result.current.tileFor("B");
    expect(result.current.version).toBe(2);

    rerender({ visible: [A, B], cacheKey: "day", tileVersions: { A: 1 } });
    // Only A refetches.
    expect(requested()).toEqual(["/r/A.png?k=day", "/r/B.png?k=day", "/r/A.png?k=day&v=1"]);
    expect(result.current.tileFor("A")).toBe(oldA);
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day"));
    expect(result.current.version).toBe(2);

    land("/r/A.png?k=day&v=1");
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day&v=1"));
    expect(result.current.tileFor("A")?.small).not.toBe(oldA?.small);
    expect(result.current.tileFor("B")).toBe(oldB);
    expect(result.current.version).toBe(3);
  });

  it("refetches a map whose version changed while it was off screen once it is visible again", () => {
    const { result, rerender } = setup({ visible: [A], cacheKey: "day" });
    land("/r/A.png?k=day");
    rerender({ visible: [], cacheKey: "day", tileVersions: { A: 1 } });
    expect(requested()).toEqual(["/r/A.png?k=day"]);
    rerender({ visible: [A], cacheKey: "day", tileVersions: { A: 1 } });
    expect(requested()).toEqual(["/r/A.png?k=day", "/r/A.png?k=day&v=1"]);
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day"));
  });

  it("ignores a load for a superseded URL, before or after the current one lands", () => {
    const { result, rerender } = setup({ visible: [A], cacheKey: "day" });
    land("/r/A.png?k=day");
    rerender({ visible: [A], cacheKey: "day", tileVersions: { A: 1 } });
    rerender({ visible: [A], cacheKey: "day", tileVersions: { A: 2 } });
    expect(requested()).toEqual(["/r/A.png?k=day", "/r/A.png?k=day&v=1", "/r/A.png?k=day&v=2"]);

    land("/r/A.png?k=day&v=1");
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day"));
    expect(result.current.version).toBe(1);

    land("/r/A.png?k=day&v=2");
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day&v=2"));
    expect(result.current.version).toBe(2);

    land("/r/A.png?k=day&v=1");
    expect(result.current.tileFor("A")?.img).toBe(image("/r/A.png?k=day&v=2"));
    expect(result.current.version).toBe(2);
  });

  it("keeps the previous image when the refreshed load errors, and does not retry it", () => {
    const { result, rerender } = setup({ visible: [A], cacheKey: "day" });
    land("/r/A.png?k=day");
    const oldA = result.current.tileFor("A");
    rerender({ visible: [A], cacheKey: "day", tileVersions: { A: 1 } });
    fail("/r/A.png?k=day&v=1");
    expect(result.current.tileFor("A")).toBe(oldA);
    expect(result.current.version).toBe(1);
    rerender({ visible: [A], cacheKey: "day", tileVersions: { A: 1 } });
    expect(requested()).toEqual(["/r/A.png?k=day", "/r/A.png?k=day&v=1"]);
  });

  it("stays empty when a first load errors", () => {
    const { result } = setup({ visible: [A], cacheKey: "day" });
    fail("/r/A.png?k=day");
    expect(result.current.tileFor("A")).toBeUndefined();
    expect(result.current.version).toBe(0);
  });

  it("drops every entry on a cacheKey change and ignores a late load from the old key", () => {
    const { result, rerender } = setup({ visible: [A, B], cacheKey: "day" });
    land("/r/A.png?k=day");
    // A refresh still in flight under the old key when the key changes.
    rerender({ visible: [A, B], cacheKey: "day", tileVersions: { A: 1 } });
    expect(result.current.version).toBe(1);

    rerender({ visible: [A, B], cacheKey: "nite", tileVersions: { A: 1 } });
    // The old key's image is gone at once (never drawn under the new key); the draw loop is told.
    expect(result.current.tileFor("A")).toBeUndefined();
    expect(result.current.version).toBe(2);
    expect(requested().slice(3)).toEqual(["/r/A.png?k=nite&v=1", "/r/B.png?k=nite"]);

    land("/r/A.png?k=day&v=1");
    land("/r/B.png?k=day");
    expect(result.current.tileFor("A")).toBeUndefined();
    expect(result.current.tileFor("B")).toBeUndefined();
    expect(result.current.version).toBe(2);

    land("/r/B.png?k=nite");
    expect(result.current.tileFor("B")?.img).toBe(image("/r/B.png?k=nite"));
    expect(result.current.version).toBe(3);
  });

  it("a cacheKey change also drops entries for maps that are off screen at the time", () => {
    const { result, rerender } = setup({ visible: [A, B], cacheKey: "day" });
    land("/r/A.png?k=day");
    rerender({ visible: [B], cacheKey: "day" });
    rerender({ visible: [B], cacheKey: "nite" });
    expect(result.current.tileFor("A")).toBeUndefined();
    rerender({ visible: [A, B], cacheKey: "nite" });
    expect(requested()).toContain("/r/A.png?k=nite");
  });

  it("ignores the first key's pending load after a key round trip that requests the same URL again", () => {
    const { result, rerender } = setup({ visible: [A], cacheKey: "day" });
    rerender({ visible: [A], cacheKey: "nite" });
    rerender({ visible: [A], cacheKey: "day" });
    const [first, second] = images("/r/A.png?k=day");
    expect(second).toBeDefined();
    expect(result.current.version).toBe(2);

    act(() => { first!.onload?.(); });
    expect(result.current.tileFor("A")).toBeUndefined();
    expect(buildSmallTile).not.toHaveBeenCalled();
    expect(result.current.version).toBe(2);

    act(() => { second!.onload?.(); });
    expect(result.current.tileFor("A")?.img).toBe(second);
    expect(buildSmallTile).toHaveBeenCalledTimes(1);
    expect(result.current.version).toBe(3);
  });

  it("does no work for a load that lands after unmount", () => {
    const { result, unmount } = setup({ visible: [A], cacheKey: "day" });
    unmount();
    act(() => { image("/r/A.png?k=day").onload?.(); });
    expect(buildSmallTile).not.toHaveBeenCalled();
    expect(result.current.tileFor("A")).toBeUndefined();
  });

  it("builds the small tile from the adapter's sizeOf and nativePx, not the placement fields", () => {
    // GBC-shaped: 32 px blocks, and a size that differs from the placement's own width/height
    // (GBA reads an orphan's real size from sizeByMap the same way).
    renderHook(() => useWorldTiles<P>({ visible: [A], cacheKey: "day", imageUrl, sizeOf: () => ({ width: 7, height: 5 }), nativePx: 32 }));
    land("/r/A.png?k=day");
    expect(buildSmallTile).toHaveBeenCalledWith(image("/r/A.png?k=day"), 7, 5, 32, 0.25);
  });

  it("builds one small tile per decoded image at the LOD scale, never per lookup or render", () => {
    const { result, rerender } = setup({ visible: [A, B], cacheKey: "day" });
    expect(buildSmallTile).not.toHaveBeenCalled();
    land("/r/A.png?k=day");
    expect(buildSmallTile).toHaveBeenCalledTimes(1);
    // 2x3 tiles at 16 px native, LOD_SCALE 0.25.
    expect(buildSmallTile).toHaveBeenCalledWith(image("/r/A.png?k=day"), 2, 3, 16, 0.25);

    for (let i = 0; i < 5; i++) {
      result.current.tileFor("A");
      rerender({ visible: [A, B], cacheKey: "day" });
    }
    expect(buildSmallTile).toHaveBeenCalledTimes(1);

    land("/r/B.png?k=day");
    expect(buildSmallTile).toHaveBeenCalledTimes(2);
    expect(buildSmallTile).toHaveBeenLastCalledWith(image("/r/B.png?k=day"), 4, 1, 16, 0.25);
  });

  it("returns a stable lookup function", () => {
    const { result, rerender } = setup({ visible: [A], cacheKey: "day" });
    const first = result.current.tileFor;
    land("/r/A.png?k=day");
    rerender({ visible: [A], cacheKey: "nite" });
    expect(result.current.tileFor).toBe(first);
  });
});
