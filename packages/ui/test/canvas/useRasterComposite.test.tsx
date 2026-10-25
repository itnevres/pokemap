import { StrictMode, Suspense, startTransition, useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRasterComposite, type RasterLayer, type RasterCompositeOptions } from "../../src/canvas/useRasterComposite.js";

function makeContext() {
  return {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      width, height, data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: vi.fn(),
  };
}

const contexts = new Map<HTMLCanvasElement, ReturnType<typeof makeContext>>();

beforeEach(() => {
  // jsdom has no raster implementation; each canvas needs its own call log.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = makeContext();
      contexts.set(this, ctx);
    }
    return ctx as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => {
  cleanup();
  contexts.clear();
  vi.restoreAllMocks();
});

function options(extra: Partial<RasterCompositeOptions> = {}): RasterCompositeOptions {
  const img = document.createElement("img");
  Object.defineProperties(img, {
    complete: { configurable: true, value: false },
    naturalWidth: { configurable: true, value: 0 },
  });
  const stage = document.createElement("canvas");
  stage.width = 100;
  stage.height = 80;
  return {
    imageUrl: "/a.png", imgRef: { current: img }, stageRef: { current: stage },
    width: 8, height: 6, layers: [],
    view: { zoom: 2, pan: { x: 7, y: -3 } }, viewport: { w: 100, h: 80 },
    decorateDeps: [], ...extra,
  };
}

function layer(key: string, enabled = true, deps: readonly unknown[] = []): RasterLayer {
  return { key, enabled, deps, draw: vi.fn() };
}

function baseContext(input: RasterCompositeOptions) {
  const entry = [...contexts.entries()].find(([canvas]) => canvas !== input.stageRef.current);
  expect(entry).toBeDefined();
  return { canvas: entry![0], ctx: entry![1] };
}

function mountSuspendingCanvas() {
  const committedLayer = layer("a", true, ["a"]);
  const speculativeLayer = layer("b", true, ["b"]);
  const committedDecoration = vi.fn();
  const speculativeDecoration = vi.fn();
  const input = options({ layers: [committedLayer], decorate: committedDecoration, decorateDeps: ["a"] });
  const attempted = vi.fn();
  // The transition stays pending until it is explicitly abandoned by the test.
  const pending = new Promise<never>(() => {});
  function Canvas({ suspend }: { suspend: boolean }) {
    const raster = useRasterComposite(suspend ? {
      ...input, imageUrl: "/b.png", layers: [speculativeLayer],
      decorate: speculativeDecoration, decorateDeps: ["b"],
    } : input);
    if (suspend) {
      attempted();
      throw pending;
    }
    return <>
      <img ref={input.imgRef} src={input.imageUrl} onLoad={raster.onImgLoad} onError={raster.onImgError} alt="source" />
      <canvas ref={input.stageRef} />
      <output>{raster.imgLoaded ? "loaded" : "waiting"}</output>
    </>;
  }
  function Harness() {
    const [suspend, setSuspend] = useState(false);
    const [, setRevision] = useState(0);
    return <>
      <button onClick={() => startTransition(() => setSuspend(true))}>Suspend</button>
      <button onClick={() => {
        setSuspend(false);
        // Force a committed render even when the pending state still matches the old state.
        setRevision((revision) => revision + 1);
      }}>Cancel</button>
      <Suspense fallback={<p>Pending</p>}><Canvas suspend={suspend} /></Suspense>
    </>;
  }
  render(<Harness />);
  return { input, attempted, committedLayer, speculativeLayer, committedDecoration, speculativeDecoration };
}

describe("useRasterComposite", () => {
  it("accepts the committed image's DOM load while a new URL render is suspended", () => {
    const fixture = mountSuspendingCanvas();
    fireEvent.click(screen.getByText("Suspend"));
    expect(fixture.attempted).toHaveBeenCalled();
    const img = screen.getByAltText("source");
    expect(img.getAttribute("src")).toBe("/a.png");
    fireEvent.load(img);
    expect(screen.getByText("loaded")).toBeDefined();
    expect(fixture.committedLayer.draw).toHaveBeenCalledTimes(1);
    expect(fixture.committedDecoration).toHaveBeenCalled();
    expect(fixture.speculativeLayer.draw).not.toHaveBeenCalled();
    expect(fixture.speculativeDecoration).not.toHaveBeenCalled();
  });

  it("does not invalidate committed signatures when a suspended render is abandoned", () => {
    const fixture = mountSuspendingCanvas();
    fireEvent.load(screen.getByAltText("source"));
    const { ctx } = baseContext(fixture.input);
    const stage = contexts.get(fixture.input.stageRef.current!)!;
    const blits = stage.drawImage.mock.calls.length;
    fireEvent.click(screen.getByText("Suspend"));
    expect(fixture.attempted).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("loaded")).toBeDefined();
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(stage.drawImage).toHaveBeenCalledTimes(blits);
    expect(fixture.speculativeLayer.draw).not.toHaveBeenCalled();
    expect(fixture.speculativeDecoration).not.toHaveBeenCalled();
  });

  it("only resets changed bitmap dimensions and still clears on recomposite", () => {
    const input = options({ layers: [layer("a")] });
    const { result, rerender } = renderHook(useRasterComposite, { initialProps: input });
    act(() => result.current.onImgLoad());
    const { canvas, ctx } = baseContext(input);
    const width = vi.spyOn(canvas, "width", "set");
    const height = vi.spyOn(canvas, "height", "set");
    rerender({ ...input, layers: [layer("b")] });
    expect(width).not.toHaveBeenCalled();
    expect(height).not.toHaveBeenCalled();
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    rerender({ ...input, layers: [layer("b")], width: 9 });
    expect(width).toHaveBeenCalledTimes(1);
    expect(width).toHaveBeenCalledWith(9);
    expect(height).not.toHaveBeenCalled();
    rerender({ ...input, layers: [layer("b")], width: 9, height: 7 });
    expect(width).toHaveBeenCalledTimes(1);
    expect(height).toHaveBeenCalledTimes(1);
    expect(height).toHaveBeenCalledWith(7);
    expect(ctx.clearRect).toHaveBeenLastCalledWith(0, 0, 9, 7);
  });

  it("does not composite before load, then exposes readiness and a version", () => {
    const input = options();
    const { result } = renderHook(() => useRasterComposite(input));
    expect(result.current.imgLoaded).toBe(false);
    expect(result.current.compositeVersion).toBe(0);
    expect(contexts.size).toBe(0);
    act(() => result.current.onImgLoad());
    expect(result.current.imgLoaded).toBe(true);
    expect(result.current.compositeVersion).toBe(1);
    const { canvas, ctx } = baseContext(input);
    expect([canvas.width, canvas.height]).toEqual([8, 6]);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 8, 6);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(input.imgRef.current, 0, 0);
  });

  it("ignores a deferred load callback from the previous URL", () => {
    const input = options();
    const { result, rerender } = renderHook(useRasterComposite, { initialProps: input });
    const oldLoad = result.current.onImgLoad;
    act(() => oldLoad());
    const { ctx } = baseContext(input);
    rerender({ ...input, imageUrl: "/b.png" });
    expect(result.current.imgLoaded).toBe(false);
    act(() => oldLoad());
    expect(result.current.imgLoaded).toBe(false);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(result.current.compositeVersion).toBe(1);
    act(() => result.current.onImgLoad());
    expect(result.current.imgLoaded).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("recognizes cached complete images on mount and URL change under StrictMode", () => {
    const input = options();
    Object.defineProperties(input.imgRef.current, {
      complete: { value: true }, naturalWidth: { value: 8 },
    });
    const { result, rerender } = renderHook(useRasterComposite, {
      initialProps: input, wrapper: StrictMode,
    });
    expect(result.current.imgLoaded).toBe(true);
    const { ctx } = baseContext(input);
    const count = ctx.drawImage.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    const version = result.current.compositeVersion;
    rerender({ ...input, imageUrl: "/cached-b.png" });
    expect(result.current.imgLoaded).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledTimes(count + 1);
    expect(result.current.compositeVersion).toBe(version + 1);
    rerender({ ...input, imageUrl: "/cached-b.png", layers: [], decorateDeps: [] });
    expect(ctx.drawImage).toHaveBeenCalledTimes(count + 1);
  });

  it("never composites an error or a complete-but-broken image", () => {
    const input = options();
    Object.defineProperty(input.imgRef.current, "complete", { value: true });
    const { result } = renderHook(() => useRasterComposite(input));
    act(() => result.current.onImgError());
    expect(result.current.imgLoaded).toBe(false);
    expect(result.current.compositeVersion).toBe(0);
    expect(contexts.size).toBe(0);
  });

  it("draws enabled layers in order with one shared get/put pair", () => {
    const calls: string[] = [];
    const layers = [layer("grid"), layer("disabled", false), layer("events")];
    layers.forEach((item) => {
      vi.mocked(item.draw).mockImplementation((raster) => {
        calls.push(item.key);
        expect([raster.width, raster.height]).toEqual([8, 6]);
        raster.data[0] = raster.data[0]! + 1;
      });
    });
    const input = options({ layers });
    const { result } = renderHook(() => useRasterComposite(input));
    act(() => result.current.onImgLoad());
    const { ctx } = baseContext(input);
    expect(calls).toEqual(["grid", "events"]);
    expect(layers[1]!.draw).not.toHaveBeenCalled();
    expect(ctx.getImageData).toHaveBeenCalledTimes(1);
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 8, 6);
    const pixels = ctx.getImageData.mock.results[0]!.value;
    expect(pixels.data[0]).toBe(2);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(ctx.putImageData).toHaveBeenCalledWith(pixels, 0, 0);
  });

  it.each([{ layers: [] }, { layers: [layer("off", false)] }])("avoids get/put when no layer is enabled (%j)", ({ layers }) => {
    const input = options({ layers });
    const { result } = renderHook(() => useRasterComposite(input));
    act(() => result.current.onImgLoad());
    const { ctx } = baseContext(input);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.getImageData).not.toHaveBeenCalled();
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });

  it("recomposites for ordered key changes, replacement, membership, enabled and deps", () => {
    const calls: string[] = [];
    const make = (key: string, enabled = true, deps: readonly unknown[] = []) => ({
      key, enabled, deps, draw: () => { calls.push(key); },
    });
    const input = options({ layers: [make("a"), make("b")] });
    const { result, rerender } = renderHook(useRasterComposite, { initialProps: input });
    act(() => result.current.onImgLoad());
    const { ctx } = baseContext(input);
    calls.length = 0;
    rerender({ ...input, layers: [make("b"), make("a")] });
    expect(calls.splice(0)).toEqual(["b", "a"]);
    rerender({ ...input, layers: [make("b"), make("c")] });
    expect(calls.splice(0)).toEqual(["b", "c"]);
    rerender({ ...input, layers: [make("b", false), make("c")] });
    expect(calls.splice(0)).toEqual(["c"]);
    rerender({ ...input, layers: [make("b", false), make("c", true, [1])] });
    expect(calls.splice(0)).toEqual(["c"]);
    rerender({ ...input, layers: [make("c", true, [1])] });
    expect(calls).toEqual(["c"]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(6);
    expect(ctx.getImageData).toHaveBeenCalledTimes(6);
    expect(ctx.putImageData).toHaveBeenCalledTimes(6);
  });

  it("compares deps with Object.is, including lengths and entry boundaries", () => {
    const input = options({ layers: [layer("a", true, [NaN, 0]), layer("b")] });
    const { result, rerender } = renderHook(useRasterComposite, { initialProps: input });
    act(() => result.current.onImgLoad());
    const { ctx } = baseContext(input);
    rerender({ ...input, layers: [layer("a", true, [NaN, 0]), layer("b")] });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    rerender({ ...input, layers: [layer("a", true, [NaN, -0]), layer("b")] });
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    rerender({ ...input, layers: [layer("a", true, [NaN]), layer("b", true, [-0])] });
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  });

  it("ignores fresh equal arrays/closures, view and unrelated props; uses latest drawers on resize", () => {
    const first = layer("a", true, [1]);
    const input = { ...options({ layers: [first] }), unrelated: 0 };
    const { result, rerender } = renderHook(useRasterComposite, { initialProps: input });
    act(() => result.current.onImgLoad());
    const { ctx } = baseContext(input);
    const latest = layer("a", true, [1]);
    const next = { ...input, layers: [latest], decorateDeps: [] };
    rerender(next);
    rerender({ ...next, view: { zoom: 4, pan: { x: -5, y: 9 } } });
    rerender({ ...next, unrelated: 1 });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(latest.draw).not.toHaveBeenCalled();
    rerender({ ...next, width: 10 });
    expect(latest.draw).toHaveBeenCalledTimes(1);
    rerender({ ...next, width: 10, height: 9 });
    expect(latest.draw).toHaveBeenCalledTimes(2);
    expect(first.draw).toHaveBeenCalledTimes(1);
  });

  it("blits the source rectangle at pan/zoom and decorates after drawing", () => {
    const decorate = vi.fn();
    const input = options({ decorate });
    const { result } = renderHook(() => useRasterComposite(input));
    act(() => result.current.onImgLoad());
    const { canvas } = baseContext(input);
    const stage = contexts.get(input.stageRef.current!)!;
    expect(stage.imageSmoothingEnabled).toBe(false);
    expect(stage.clearRect).toHaveBeenLastCalledWith(0, 0, 100, 80);
    expect(stage.drawImage).toHaveBeenLastCalledWith(canvas, 0, 0, 8, 6, 7, -3, 16, 12);
    expect(decorate).toHaveBeenLastCalledWith(stage);
    expect(stage.clearRect.mock.invocationCallOrder.at(-1)!).toBeLessThan(stage.drawImage.mock.invocationCallOrder.at(-1)!);
    expect(stage.drawImage.mock.invocationCallOrder.at(-1)!).toBeLessThan(decorate.mock.invocationCallOrder.at(-1)!);
  });

  it("reblits for each view/viewport/decorate input without recompositing", () => {
    const input = options({ decorate: vi.fn(), decorateDeps: [NaN, 0] });
    const { result, rerender } = renderHook(useRasterComposite, { initialProps: input });
    act(() => result.current.onImgLoad());
    const { ctx } = baseContext(input);
    const stage = contexts.get(input.stageRef.current!)!;
    const count = stage.drawImage.mock.calls.length;
    const latest = vi.fn();
    let next = { ...input, decorate: latest, decorateDeps: [NaN, 0] };
    rerender(next);
    expect(stage.drawImage).toHaveBeenCalledTimes(count);
    const changes = [
      { view: { zoom: 4, pan: { x: 7, y: -3 } } },
      { view: { zoom: 4, pan: { x: 8, y: -3 } } },
      { view: { zoom: 4, pan: { x: 8, y: -4 } } },
      { viewport: { w: 101, h: 80 } },
      { viewport: { w: 101, h: 81 } },
      { decorateDeps: [NaN, -0] },
      { decorateDeps: [NaN] },
    ];
    changes.forEach((change, index) => {
      next = { ...next, ...change };
      rerender(next);
      expect(stage.drawImage).toHaveBeenCalledTimes(count + index + 1);
      expect(latest).toHaveBeenCalledTimes(index + 1);
    });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });
});
