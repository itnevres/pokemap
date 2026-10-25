import { StrictMode, useRef, type RefObject } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStage, useStageAutoFit, type StageOptions } from "../../src/canvas/useStage.js";
import { useCanvasAutoFit, useCanvasFit, useCanvasView, useCanvasZoom } from "../../src/shared/useCanvasView.js";
import { MapCanvasViewport } from "../../src/shared/MapCanvasViewport.js";
import { ContextMapFit } from "../../src/shared/useWorldContext.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const stepped = { kind: "stepped", levels: [1, 2, 4] } as const;
const defaults: StageOptions = {
  zoomPolicy: stepped, mapName: "A", imgLoaded: false,
  pixelWidth: 100, pixelHeight: 80, bandNative: 0, side: "right",
};

function mount(extra: Partial<StageOptions> = {}, strict = false) {
  let stage!: ReturnType<typeof useStage>;
  const starts = vi.fn();
  const ends = vi.fn();
  function Harness({ options }: { options: StageOptions }) {
    stage = useStage(options);
    return <div ref={stage.containerRef}>
      <canvas data-testid="stage" ref={stage.canvasRef} width={200} height={100}
        onPointerDown={stage.onPointerDown} onPointerCancel={stage.onPointerCancel}
        onLostPointerCapture={stage.onLostPointerCapture}
        onMouseDown={(event) => { starts(); stage.startPan(event); }}
        onMouseMove={stage.movePan}
        onMouseUp={() => { ends(); stage.endPan(); }}
        onMouseLeave={stage.leavePan} />
    </div>;
  }
  const tree = (options: StageOptions) => strict ? <StrictMode><Harness options={options} /></StrictMode> : <Harness options={options} />;
  const host = render(tree({ ...defaults, ...extra }));
  const canvas = screen.getByTestId("stage") as HTMLCanvasElement;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 200, 100));
  return { get stage() { return stage; }, canvas, starts, ends,
    rerender: (options: Partial<StageOptions>) => host.rerender(tree({ ...defaults, ...extra, ...options })), unmount: host.unmount };
}

function wheel(canvas: HTMLCanvasElement, deltaY: number) {
  fireEvent.wheel(canvas, { deltaY, clientX: 20.5, clientY: 25.25 });
}

function captureCanvas(canvas: HTMLCanvasElement) {
  const set = vi.fn();
  const release = vi.fn();
  Object.defineProperties(canvas, {
    setPointerCapture: { configurable: true, value: set },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: release },
  });
  return { set, release };
}

// jsdom versions without PointerEvent discard pointerId in fireEvent.pointerDown's initializer.
function pointer(canvas: HTMLCanvasElement, type: string, id = 7) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerId", { value: id });
  fireEvent(canvas, event);
}

describe("stage view and wheel", () => {
  it("steps about the pointer, rounds pan and clamps both ends", () => {
    const host = mount();
    // Local pivot (10.5, 5.25). At 2x: pan (-10.5, -5.25) rounded to (-10, -5).
    wheel(host.canvas, -1);
    expect(host.stage.view).toEqual({ zoom: 2, pan: { x: -10, y: -5 } });
    wheel(host.canvas, -1);
    expect(host.stage.view).toEqual({ zoom: 4, pan: { x: -30, y: -15 } });
    const max = host.stage.view;
    wheel(host.canvas, -1);
    expect(host.stage.view).toBe(max);
    wheel(host.canvas, 1);
    expect(host.stage.view.zoom).toBe(2);
    wheel(host.canvas, 1);
    expect(host.stage.view.zoom).toBe(1);
    const min = host.stage.view;
    wheel(host.canvas, 1);
    expect(host.stage.view).toBe(min);
  });

  it("multiplies continuous zoom, clamps and keeps fractional pan", () => {
    const host = mount({ zoomPolicy: { kind: "continuous", min: 0.5, max: 1.3, factor: 1.2 } });
    // At 1.2x pivot preservation gives (10.5 * -0.2, 5.25 * -0.2).
    wheel(host.canvas, -1);
    expect(host.stage.view.zoom).toBe(1.2);
    expect(host.stage.view.pan.x).toBeCloseTo(-2.1);
    expect(host.stage.view.pan.y).toBeCloseTo(-1.05);
    wheel(host.canvas, -1);
    expect(host.stage.view.zoom).toBe(1.3);
    const max = host.stage.view;
    wheel(host.canvas, -1);
    expect(host.stage.view).toBe(max);
    // A bounded loop reaches the minimum in six outward notches.
    for (let i = 0; i < 6; i++) wheel(host.canvas, 1);
    expect(host.stage.view.zoom).toBe(0.5);
    expect(host.stage.view.pan.x).toBeCloseTo(5.25);
    expect(host.stage.view.pan.y).toBeCloseTo(2.625);
    const min = host.stage.view;
    wheel(host.canvas, 1);
    expect(host.stage.view).toBe(min);
  });

  it("reports one controlled update per notch under StrictMode, none for a no-op", () => {
    const changed = vi.fn();
    const initial = { zoom: 1, pan: { x: 0, y: 0 } };
    const host = mount({ view: initial, onViewChange: changed }, true);
    wheel(host.canvas, 1);
    expect(changed).not.toHaveBeenCalled();
    wheel(host.canvas, -1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(host.stage.view).toBe(initial);
    host.rerender({ view: changed.mock.calls[0]![0] });
    wheel(host.canvas, -1);
    expect(changed).toHaveBeenCalledTimes(2);
    host.rerender({ view: changed.mock.calls[1]![0] });
    wheel(host.canvas, -1);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("installs a non-passive listener, prevents scrolling and cleans up", () => {
    const add = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");
    const remove = vi.spyOn(HTMLCanvasElement.prototype, "removeEventListener");
    const host = mount();
    expect(add.mock.calls.some(([type, , options]) => type === "wheel" && (options as AddEventListenerOptions)?.passive === false)).toBe(true);
    const event = new WheelEvent("wheel", { deltaY: -1, cancelable: true });
    act(() => { host.canvas.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    host.unmount();
    expect(remove.mock.calls.some(([type]) => type === "wheel")).toBe(true);
  });

  it("measures the viewport and remeasures on resize", () => {
    const host = mount();
    const container = host.stage.containerRef.current!;
    Object.defineProperties(container, { clientWidth: { value: 320 }, clientHeight: { value: 240 } });
    fireEvent(window, new Event("resize"));
    expect(host.stage.viewport).toEqual({ w: 320, h: 240 });
    expect(host.stage.centerPivot()).toEqual([100, 50]);
  });
});

describe("pan and capture event boundary", () => {
  it("pointerdown followed by compatibility mousedown starts one gesture", () => {
    const host = mount();
    const capture = captureCanvas(host.canvas);
    pointer(host.canvas, "pointerdown");
    expect(capture.set).toHaveBeenCalledTimes(1);
    expect(capture.set).toHaveBeenCalledWith(7);
    expect(host.stage.captured).toBe(true);
    expect(host.starts).not.toHaveBeenCalled();
    expect(host.ends).not.toHaveBeenCalled();
    fireEvent.mouseDown(host.canvas, { clientX: 30, clientY: 40 });
    expect(host.starts).toHaveBeenCalledTimes(1);
    fireEvent.mouseMove(host.canvas, { clientX: 51, clientY: 33 });
    expect(host.stage.view.pan).toEqual({ x: 21, y: -7 });
    fireEvent.mouseLeave(host.canvas);
    fireEvent.mouseMove(host.canvas, { clientX: 310, clientY: 240 });
    expect(host.stage.view.pan).toEqual({ x: 280, y: 200 });
    pointer(host.canvas, "pointerup");
    pointer(host.canvas, "lostpointercapture");
    expect(host.ends).not.toHaveBeenCalled();
    fireEvent.mouseUp(host.canvas, { clientX: 310, clientY: 240 });
    expect(host.ends).toHaveBeenCalledTimes(1);
    fireEvent.mouseMove(host.canvas, { clientX: 400, clientY: 400 });
    expect(host.stage.view.pan).toEqual({ x: 280, y: 200 });
  });

  it.each(["missing", "throwing", "refused"])("falls back to end-on-leave when capture is %s", (mode) => {
    const host = mount();
    if (mode !== "missing") {
      captureCanvas(host.canvas);
      Object.defineProperty(host.canvas, mode === "throwing" ? "setPointerCapture" : "hasPointerCapture", {
        value: mode === "throwing" ? () => { throw new Error("refused"); } : () => false,
      });
    }
    let captured = true;
    act(() => { captured = host.stage.beginCapture({ pointerId: 7, currentTarget: host.canvas }); });
    expect(captured).toBe(false);
    expect(host.stage.captured).toBe(false);
    fireEvent.mouseDown(host.canvas, { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(host.canvas, { clientX: 20, clientY: 30 });
    fireEvent.mouseLeave(host.canvas);
    fireEvent.mouseMove(host.canvas, { clientX: 40, clientY: 50 });
    expect(host.stage.view.pan).toEqual({ x: 10, y: 10 });
  });

  it.each(["pointercancel", "lostpointercapture"])("%s cancels once and drops pan", (type) => {
    const cancel = vi.fn();
    const host = mount({ onCancel: cancel });
    captureCanvas(host.canvas);
    pointer(host.canvas, "pointerdown");
    fireEvent.mouseDown(host.canvas, { clientX: 10, clientY: 20 });
    pointer(host.canvas, type, 99);
    expect(cancel).not.toHaveBeenCalled();
    pointer(host.canvas, type);
    pointer(host.canvas, "pointercancel");
    pointer(host.canvas, "lostpointercapture");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(host.stage.captured).toBe(false);
    fireEvent.mouseMove(host.canvas, { clientX: 40, clientY: 50 });
    expect(host.stage.view.pan).toEqual({ x: 0, y: 0 });
    expect(host.ends).not.toHaveBeenCalled();
  });

  it("our release suppresses synchronous and subsequent lost capture cancellation", () => {
    const cancel = vi.fn();
    const host = mount({ onCancel: cancel });
    const capture = captureCanvas(host.canvas);
    capture.release.mockImplementation(() => pointer(host.canvas, "lostpointercapture"));
    pointer(host.canvas, "pointerdown");
    act(() => host.stage.releaseCapture());
    pointer(host.canvas, "lostpointercapture");
    expect(capture.release).toHaveBeenCalledTimes(1);
    expect(capture.release).toHaveBeenCalledWith(7);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("normal pointerup releases without cancellation", () => {
    const cancel = vi.fn();
    const host = mount({ onCancel: cancel });
    const capture = captureCanvas(host.canvas);
    pointer(host.canvas, "pointerdown");
    pointer(host.canvas, "pointerup");
    pointer(host.canvas, "lostpointercapture");
    expect(capture.release).toHaveBeenCalledTimes(1);
    expect(capture.release).toHaveBeenCalledWith(7);
    expect(host.stage.captured).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("map switch and unmount drop the open drag and release capture", () => {
    const cancel = vi.fn();
    const host = mount({ onCancel: cancel });
    const capture = captureCanvas(host.canvas);
    pointer(host.canvas, "pointerdown");
    fireEvent.mouseDown(host.canvas, { clientX: 10, clientY: 20 });
    host.rerender({ mapName: "B" });
    fireEvent.mouseMove(host.canvas, { clientX: 40, clientY: 50 });
    expect(host.stage.view.pan).toEqual({ x: 0, y: 0 });
    expect(capture.release).toHaveBeenCalledTimes(1);
    pointer(host.canvas, "pointerdown");
    host.unmount();
    expect(capture.release).toHaveBeenCalledTimes(2);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("fit and compatibility hooks", () => {
  it("auto-fits once per real map open, never on reload or overlay rerenders", () => {
    const fit = vi.fn();
    const host = mount({ fit }, true);
    expect(fit).not.toHaveBeenCalled();
    host.rerender({ imgLoaded: true });
    expect(fit).toHaveBeenCalledTimes(1);
    host.rerender({ imgLoaded: true, bandNative: 20 });
    host.rerender({ imgLoaded: false });
    host.rerender({ imgLoaded: true });
    expect(fit).toHaveBeenCalledTimes(1);
    host.rerender({ mapName: "B", imgLoaded: true });
    expect(fit).toHaveBeenCalledTimes(2);
    host.rerender({ mapName: "A", imgLoaded: true });
    expect(fit).toHaveBeenCalledTimes(3);
  });

  it("never auto-fits a controlled stage", () => {
    const fit = vi.fn();
    const host = mount({ fit, view: { zoom: 2, pan: { x: 3, y: 4 } }, imgLoaded: true }, true);
    host.rerender({ mapName: "B", imgLoaded: true });
    expect(fit).not.toHaveBeenCalled();
  });

  it("F fits unless chromeless; modified F stays with the browser", () => {
    const fit = vi.fn();
    const host = mount({ fit });
    fireEvent.keyDown(window, { key: "f" });
    expect(fit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    host.rerender({ chromeless: true });
    fireEvent.keyDown(window, { key: "f" });
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it("registers chromeless context fit and unregisters it on unmount", () => {
    const register = vi.fn();
    function Host() {
      const stage = useStage({ ...defaults, chromeless: true });
      return <canvas ref={stage.canvasRef} />;
    }
    const host = render(<ContextMapFit.Provider value={register}><Host /></ContextMapFit.Provider>);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]![0]).toBeTypeOf("function");
    act(() => register.mock.calls[0]![0]());
    host.unmount();
    expect(register).toHaveBeenLastCalledWith(null);
  });

  it("retains the four legacy hooks and their stepped fit/wheel behavior", () => {
    let state!: ReturnType<typeof useCanvasView>;
    let fit!: () => void;
    function Legacy() {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      state = useCanvasView(undefined, undefined);
      useCanvasZoom(canvasRef, state.view.zoom, state.updateView, [1, 2, 4]);
      fit = useCanvasFit({ viewport: { w: 200, h: 160 }, pixelWidth: 100, pixelHeight: 80,
        zoomLevels: [1, 2, 4], bandNative: 0, side: "right", updateView: state.updateView });
      useCanvasAutoFit(false, "A", state.controlled, fit);
      return <canvas ref={canvasRef} data-testid="legacy" />;
    }
    render(<Legacy />);
    act(() => fit());
    expect(state.view).toEqual({ zoom: 2, pan: { x: 0, y: 0 } });
    fireEvent.wheel(screen.getByTestId("legacy"), { deltaY: -1 });
    expect(state.view.zoom).toBe(4);
  });

  it("the auto-fit helper guards StrictMode and callback identity changes", () => {
    const fit = vi.fn();
    const { rerender } = renderHook(({ loaded }) => useStageAutoFit(loaded, "A", false, () => fit()), {
      initialProps: { loaded: true }, wrapper: StrictMode,
    });
    expect(fit).toHaveBeenCalledTimes(1);
    rerender({ loaded: false });
    rerender({ loaded: true });
    expect(fit).toHaveBeenCalledTimes(1);
  });
});

it("MapCanvasViewport forwards optional pointer and image-error handlers without changing markup", () => {
  const down = vi.fn(), cancel = vi.fn(), lost = vi.fn(), error = vi.fn(), mouse = vi.fn();
  const ref = <T,>(): RefObject<T | null> => ({ current: null });
  const props = { containerRef: ref<HTMLDivElement>(), imgRef: ref<HTMLImageElement>(), canvasRef: ref<HTMLCanvasElement>(),
    imageUrl: "/a.png", onImgLoad: vi.fn(), width: 100, height: 80,
    onMouseDown: mouse, onMouseMove: mouse, onMouseUp: mouse, onMouseLeave: mouse, children: <span>overlay</span> };
  const host = render(<MapCanvasViewport {...props} />);
  const markup = host.container.innerHTML;
  host.rerender(<MapCanvasViewport {...props} onPointerDown={down} onPointerCancel={cancel} onLostPointerCapture={lost} onImgError={error} />);
  expect(host.container.innerHTML).toBe(markup);
  const canvas = host.container.querySelector("canvas")!;
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointercancel");
  pointer(canvas, "lostpointercapture");
  fireEvent.error(host.container.querySelector("img")!);
  fireEvent.mouseDown(canvas);
  expect(down).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(lost).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
  expect(mouse).toHaveBeenCalledTimes(1);
});
