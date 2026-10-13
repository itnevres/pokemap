import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StrictMode, useState, type ReactNode } from "react";
import type { MapView, Zoom } from "../../src/components/mapView.js";
import { useWorldContext, type ContextPlacement } from "../../src/shared/useWorldContext.js";

type View = { pan: { x: number; y: number }; zoom: number };
const PLACEMENT: ContextPlacement = { x: 0, y: 0, width: 10, height: 10 };

function makeCanvas(w = 200, h = 200) {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: w });
  Object.defineProperty(canvas, "clientHeight", { value: h });
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, right: 10 + w, bottom: 20 + h, width: w, height: h, x: 10, y: 20, toJSON() {} });
  return canvas;
}

interface Opts {
  native: number;
  zoom: number;
  origin?: { x: number; y: number } | null;
  placement?: ContextPlacement | null;
  inContext?: boolean;
}

/** The hook over a real world state, with spies for the host callbacks. */
function setup(o: Opts) {
  const canvas = makeCanvas();
  const onExitRequest = vi.fn();
  const setViewSpy = vi.fn();
  const snapPointerRef = { current: null as { x: number; y: number } | null };
  const flags = { blocked: false };
  const canvasRef = { current: canvas };
  const result = renderHook(
    (p: { origin: { x: number; y: number } | null; inContext: boolean }) => {
      const [view, setV] = useState<View>({ pan: { x: 0, y: 0 }, zoom: o.zoom });
      return useWorldContext({
        native: o.native,
        context: p.inContext ? { map: "MapB", origin: p.origin, onExitRequest } : null,
        placement: o.placement === undefined ? PLACEMENT : o.placement,
        world: { pan: view.pan, zoom: view.zoom, setView: (v) => { setViewSpy(v); setV(v); } },
        viewport: { w: 200, h: 200 },
        canvasRef,
        snapPointerRef,
        isBlocked: () => flags.blocked,
      });
    },
    { initialProps: { origin: o.origin === undefined ? { x: 0, y: 0 } : o.origin, inContext: o.inContext ?? true }, wrapper: ({ children }: { children: ReactNode }) => <>{children}</> },
  );
  return { ...result, canvas, onExitRequest, setViewSpy, snapPointerRef, flags };
}

const esc = (target: EventTarget = document.body) => {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

afterEach(() => { document.body.innerHTML = ""; });

describe("useWorldContext: snap per family", () => {
  it.each([
    [16, [16, 32, 64]],
    [32, [32, 64, 128]],
  ])("native %i snaps world zoom %j to 1x/2x/4x", (native, zooms) => {
    [1, 2, 4].forEach((expected, i) => {
      const h = setup({ native, zoom: zooms![i]! });
      expect(h.result.current.contextView?.zoom).toBe(expected);
    });
  });

  it("centres the placement on the recorded pointer (converted with the canvas box) and clears the pointer ref", () => {
    const h = setup({ native: 16, zoom: 16, origin: null });
    h.snapPointerRef.current = { x: 110, y: 120 }; // canvas box is at (10, 20): pointer (100, 100) in canvas px
    h.rerender({ origin: { x: 0, y: 0 }, inContext: true });
    // 1x = 16 px/tile; centre (5,5) tiles -> (80,80); pan = (100-80, 100-80)
    expect(h.setViewSpy).toHaveBeenCalledTimes(1);
    expect(h.setViewSpy).toHaveBeenCalledWith({ zoom: 16, pan: { x: 20, y: 20 } });
    expect(h.snapPointerRef.current).toBeNull();
    expect(h.result.current.contextView).toEqual({ zoom: 1, pan: { x: 20, y: 20 } });
  });

  it("centres on the canvas centre when no pointer was recorded", () => {
    const h = setup({ native: 32, zoom: 32 });
    expect(h.setViewSpy).toHaveBeenCalledWith({ zoom: 32, pan: { x: 100 - 160, y: 100 - 160 } });
  });

  it("does not snap while origin is null, and not while the placement is null", () => {
    const h = setup({ native: 16, zoom: 16, origin: null });
    expect(h.setViewSpy).not.toHaveBeenCalled();
    expect(h.result.current.contextView).toBeNull();
    const g = setup({ native: 16, zoom: 16, placement: null });
    expect(g.setViewSpy).not.toHaveBeenCalled();
    expect(g.result.current.contextView).toBeNull();
  });

  it("snaps once per entry (a StrictMode double run does not snap twice)", () => {
    const setViewSpy = vi.fn();
    const canvasRef = { current: makeCanvas() };
    renderHook(
      () => {
        const [view, setV] = useState<View>({ pan: { x: 0, y: 0 }, zoom: 16 });
        return useWorldContext({
          native: 16,
          context: { map: "MapB", origin: { x: 0, y: 0 }, onExitRequest: () => {} },
          placement: PLACEMENT,
          world: { pan: view.pan, zoom: view.zoom, setView: (v) => { setViewSpy(v); setV(v); } },
          viewport: { w: 200, h: 200 },
          canvasRef,
          snapPointerRef: { current: null },
          isBlocked: () => false,
        });
      },
      { wrapper: StrictMode },
    );
    expect(setViewSpy).toHaveBeenCalledTimes(1);
  });
});

describe("useWorldContext: Escape", () => {
  it("calls onExitRequest once, from a capture-phase window listener", () => {
    const h = setup({ native: 16, zoom: 16 });
    esc();
    expect(h.onExitRequest).toHaveBeenCalledTimes(1);
  });

  it("is ignored when isBlocked(), from a text field, or with a modal open", () => {
    const h = setup({ native: 16, zoom: 16 });
    h.flags.blocked = true;
    esc();
    expect(h.onExitRequest).not.toHaveBeenCalled();
    h.flags.blocked = false;

    const input = document.body.appendChild(document.createElement("input"));
    esc(input);
    const editable = document.body.appendChild(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    esc(editable);
    expect(h.onExitRequest).not.toHaveBeenCalled();

    const modal = document.body.appendChild(document.createElement("div"));
    modal.setAttribute("aria-modal", "true");
    esc();
    expect(h.onExitRequest).not.toHaveBeenCalled();
  });

  it("honours defaultPrevented set before the window capture listener", () => {
    const h = setup({ native: 16, zoom: 16 });
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    e.preventDefault();
    document.body.dispatchEvent(e);
    expect(h.onExitRequest).not.toHaveBeenCalled();
  });

  it("judges the modal before a document bubble listener removes it (capture runs first)", () => {
    const h = setup({ native: 16, zoom: 16 });
    const modal = document.body.appendChild(document.createElement("div"));
    modal.setAttribute("aria-modal", "true");
    const flush = () => modal.remove();
    document.addEventListener("keydown", flush);
    esc();
    document.removeEventListener("keydown", flush);
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(h.onExitRequest).not.toHaveBeenCalled();
  });

  it("has no listener when not in context", () => {
    const h = setup({ native: 16, zoom: 16, inContext: false });
    esc();
    expect(h.onExitRequest).not.toHaveBeenCalled();
  });
});

describe("useWorldContext: overlay double-click", () => {
  function overlay(h: ReturnType<typeof setup>) {
    const div = document.createElement("div");
    div.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} });
    const bar = div.appendChild(document.createElement("div"));
    bar.className = "world-canvas__context-bar";
    (h.result.current.overlayRef as { current: HTMLDivElement | null }).current = div;
    const dbl = (target: Element, clientX: number, clientY: number) =>
      h.result.current.onOverlayDoubleClick({ target, clientX, clientY } as unknown as React.MouseEvent<HTMLDivElement>);
    return { div, bar, dbl };
  }

  it("exits for a click outside the placement rect; not inside, nor on the bar", () => {
    const h = setup({ native: 16, zoom: 16 }); // centred: placement covers [20, 180) on both axes
    const o = overlay(h);
    o.dbl(o.div, 100, 100);
    o.dbl(o.bar, 5, 5);
    expect(h.onExitRequest).not.toHaveBeenCalled();
    o.dbl(o.div, 5, 5);
    expect(h.onExitRequest).toHaveBeenCalledTimes(1);
  });
});

describe("useWorldContext: stepZoom (M6)", () => {
  const nonLevel = (h: ReturnType<typeof setup>, zoom: number) =>
    act(() => h.result.current.onContextViewChange({ zoom: zoom as Zoom, pan: { x: 0, y: 0 } } as MapView));

  it.each([
    [16, 1.5, 2, 1],
    [32, 3.2, 4, 2],
  ])("native %i at overlay zoom %f: +1 goes to %i and -1 to %i", (native, z, up, down) => {
    const h = setup({ native, zoom: native });
    nonLevel(h, z);
    expect(h.result.current.contextView?.zoom).toBe(z);
    act(() => h.result.current.stepZoom(1));
    expect(h.result.current.contextView?.zoom).toBe(up);
    nonLevel(h, z);
    act(() => h.result.current.stepZoom(-1));
    expect(h.result.current.contextView?.zoom).toBe(down);
  });

  it("clamps at the ends", () => {
    const h = setup({ native: 16, zoom: 64 });
    expect(h.result.current.contextView?.zoom).toBe(4);
    act(() => h.result.current.stepZoom(1));
    expect(h.result.current.contextView?.zoom).toBe(4);
    const g = setup({ native: 16, zoom: 16 });
    act(() => g.result.current.stepZoom(-1));
    expect(g.result.current.contextView?.zoom).toBe(1);
  });

  it("is a no-op before the snap", () => {
    const h = setup({ native: 16, zoom: 16, origin: null });
    act(() => h.result.current.stepZoom(1));
    expect(h.setViewSpy).not.toHaveBeenCalled();
  });
});

describe("useWorldContext: zoom cap and focus", () => {
  it("maxWorldZoom is base*4 in context and base outside", () => {
    expect(setup({ native: 32, zoom: 32 }).result.current.maxWorldZoom(32)).toBe(128);
    expect(setup({ native: 32, zoom: 32, inContext: false }).result.current.maxWorldZoom(32)).toBe(32);
  });

  it("focuses the canvas on exit only after a snap", () => {
    const snapped = setup({ native: 16, zoom: 16 });
    const focus = vi.spyOn(snapped.canvas, "focus");
    snapped.rerender({ origin: { x: 0, y: 0 }, inContext: false });
    expect(focus).toHaveBeenCalledTimes(1);

    const waiting = setup({ native: 16, zoom: 16, origin: null });
    const focus2 = vi.spyOn(waiting.canvas, "focus");
    waiting.rerender({ origin: null, inContext: false });
    expect(focus2).not.toHaveBeenCalled();
  });
});
