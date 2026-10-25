import { StrictMode, useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapSurface, type MapSurfaceProps } from "../../src/canvas/MapSurface.js";
import type { MapSurfaceAdapter } from "../../src/canvas/mapSurfaceAdapter.js";
import type { SettledChain } from "../../src/shared/useStrokeChain.js";

const observations = vi.hoisted(() => ({ loads: [] as (() => void)[], cached: false,
  encounters: vi.fn(), border: vi.fn(), fit: vi.fn(), view: vi.fn() }));
vi.mock("../../src/shared/MapCanvasViewport.js", async (original) => {
  const actual = await original<typeof import("../../src/shared/MapCanvasViewport.js")>();
  return { MapCanvasViewport: (props: Parameters<typeof actual.MapCanvasViewport>[0]) => {
    observations.loads.push(props.onImgLoad);
    useLayoutEffect(() => {
      if (observations.cached && props.imgRef.current) {
        Object.defineProperties(props.imgRef.current, { complete: { configurable: true, value: true },
          naturalWidth: { configurable: true, value: 128 } });
      }
    }, [props.imageUrl]);
    return <actual.MapCanvasViewport {...props} />;
  } };
});
vi.mock("../../src/encounters/useMapEncounterSummaries.js", () => ({ useMapEncounterSummaries: observations.encounters }));
vi.mock("../../src/components/EncounterBorder.js", () => ({ EncounterBorder: (props: unknown) => {
  observations.border(props); return null;
} }));
vi.mock("../../src/canvas/useStage.js", async (original) => {
  const actual = await original<typeof import("../../src/canvas/useStage.js")>();
  return { ...actual, useStageAutoFit: actual.useStageAutoFit, useStage: (...args: Parameters<typeof actual.useStage>) => {
    const stage = actual.useStage(...args);
    observations.view(stage.view);
    return { ...stage, fit: () => { observations.fit(); stage.fit(); } };
  } };
});

type Tool = { kind: "pencil" | "collision" | "rect" | "shift" | "bucket" | "dropper" | "sign" };
type Cell = { x: number; y: number };
type Body = { tool: string; start?: Cell; end?: Cell; cell?: Cell };
type EventRef = { kind: "object"; index: number };
type Hover = { metatileId: number; text: string };
type Adapter = MapSurfaceAdapter<Tool, Body, EventRef, string, Hover>;
type Props = MapSurfaceProps<Tool, Body, EventRef, string, Hover>;
const draw = vi.fn();
const context = { clearRect: vi.fn(), drawImage: draw, getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(128 * 128 * 4) })),
  putImageData: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
  observations.encounters.mockReturnValue({ summaries: [], error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); observations.loads.length = 0; observations.cached = false; });

function adapter(extra: Partial<Adapter> = {}): Adapter {
  return {
    geometry: { pixelWidth: 128, pixelHeight: 128, origin: { x: 16, y: 16 }, paintCellPx: 32,
      eventCellPx: 16, width: 3, height: 3 }, blocks: [], skipFirstBlocksChange: false,
    imageUrl: vi.fn((map, version) => `/${map}.png?border=1${version > 0 ? `&v=${version}` : ""}`),
    overlays: [{ key: "events", label: "Events", deps: [], draw: vi.fn(), legend: <span>Event legend</span> }],
    hoverAt: vi.fn((point) => point.x < 16 ? null : { metatileId: point.x < 80 ? 7 : 8, text: "hover readout" }),
    statusItems: (hover) => [{ key: "base", content: "family readout" },
      { key: "hover", className: `map-canvas__hover${hover ? "" : " map-canvas__hover--empty"}`, content: hover?.text ?? "Hover the map..." }],
    paintBody: vi.fn((tool, cell) => tool.kind === "rect" || tool.kind === "shift" ? null : { tool: tool.kind, cell }),
    finishBody: vi.fn((tool, start, end) => tool.kind === "rect" || tool.kind === "shift" ? { tool: tool.kind, start, end } : null),
    findEventAt: vi.fn((cell: Cell): EventRef | null => cell.x === 1 && cell.y === 1 ? { kind: "object", index: 0 } : null),
    eventPosition: () => ({ x: 1, y: 1 }), dropperStamp: vi.fn(() => "stamp"),
    encounters: { family: "gbc", side: "right", band: 2, unitPx: 32, time: "day", legendHint: "at day" }, ...extra,
  };
}
function mount(extra: Partial<Props> = {}, strict = false) {
  const session = { beginStroke: vi.fn(async () => {}), applyPaint: vi.fn(async (_body: Body) => {}), endStroke: vi.fn(async () => {}) };
  const register = vi.fn();
  let props: Props = { mapName: "A", adapter: adapter(), editSession: session, activeTool: { kind: "pencil" },
    view: { zoom: 1, pan: { x: 0, y: 0 } }, onStrokeChain: register, ...extra };
  const tree = () => strict ? <StrictMode><MapSurface {...props} /></StrictMode> : <MapSurface {...props} />;
  const host = render(tree());
  return { ...host, session, register, get props() { return props; },
    get canvas() { return host.container.querySelector("canvas")!; }, get img() { return host.container.querySelector("img")!; },
    update(next: Partial<Props>) { props = { ...props, ...next }; host.rerender(tree()); },
    async settled() { const chain = register.mock.calls.find((call) => call[1])?.[0] as SettledChain;
      await act(async () => { await chain.settled(); }); },
  };
}
const mouse = (canvas: HTMLCanvasElement, type: "mouseDown" | "mouseMove" | "mouseUp", x = 20, y = 20, buttons = 1) =>
  fireEvent[type](canvas, { button: 0, buttons, clientX: x, clientY: y });
function pointer(canvas: HTMLCanvasElement, type: string) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { pointerId: { value: 7 }, button: { value: 0 } });
  fireEvent(canvas, event);
}
function capture(canvas: HTMLCanvasElement) {
  Object.defineProperties(canvas, { setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true }, releasePointerCapture: { configurable: true, value: vi.fn() } });
  pointer(canvas, "pointerdown");
}

describe("adapter gesture dispatch", () => {
  it.each(["pencil", "bucket", "rect", "shift", "dropper", "sign"] as const)("outside %s edits nothing", async (kind) => {
    const sign = vi.fn(), drop = vi.fn();
    const host = mount({ activeTool: { kind }, onSignPick: sign, onDropperPick: drop });
    mouse(host.canvas, "mouseDown", 0, 0); mouse(host.canvas, "mouseUp", 0, 0);
    await host.settled();
    expect(host.session.beginStroke).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled(); expect(drop).not.toHaveBeenCalled();
  });
  it("sign uses bounded event steps before painting; dropper reads paint cells without a stroke", async () => {
    const sign = vi.fn(), drop = vi.fn(), select = vi.fn();
    const host = mount({ activeTool: { kind: "sign" }, onSignPick: sign, onSelectEvent: select, onDropperPick: drop });
    mouse(host.canvas, "mouseDown", 36, 36);
    expect(sign).toHaveBeenCalledWith(1, 1, expect.any(DOMRect)); expect(select).not.toHaveBeenCalled();
    host.update({ activeTool: { kind: "dropper" } });
    mouse(host.canvas, "mouseDown", 36, 36); mouse(host.canvas, "mouseUp", 36, 36);
    expect(host.props.adapter.dropperStamp).toHaveBeenCalledWith({ x: 0, y: 0 }); expect(drop).toHaveBeenCalledWith("stamp");
    await host.settled(); expect(host.session.beginStroke).not.toHaveBeenCalled();
  });
  it.each(["pencil", "collision"] as const)("%s skips same-cell moves and resets on finish and map switch", async (kind) => {
    const host = mount({ activeTool: { kind } });
    mouse(host.canvas, "mouseDown"); mouse(host.canvas, "mouseMove", 21); mouse(host.canvas, "mouseMove", 22);
    mouse(host.canvas, "mouseMove", 52); mouse(host.canvas, "mouseMove", 53);
    mouse(host.canvas, "mouseMove", 84, 20, 0); // An open stroke alone does not authorize painting without the primary button.
    mouse(host.canvas, "mouseUp", 53);
    await host.settled(); expect(host.session.applyPaint).toHaveBeenCalledTimes(2);
    mouse(host.canvas, "mouseDown", 52); mouse(host.canvas, "mouseUp", 52);
    await host.settled(); expect(host.session.applyPaint).toHaveBeenCalledTimes(3);
    host.update({ mapName: "B" }); mouse(host.canvas, "mouseMove", 84);
    await host.settled(); expect(host.session.applyPaint).toHaveBeenCalledTimes(3);
    mouse(host.canvas, "mouseDown", 52); mouse(host.canvas, "mouseUp", 52);
    await host.settled(); expect(host.session.applyPaint).toHaveBeenCalledTimes(4);
  });
  it("selects raw event steps, previews locally and commits only a changed release cell", () => {
    const select = vi.fn(), move = vi.fn();
    const host = mount({ activeTool: null, onSelectEvent: select, onMoveEvent: move });
    fireEvent.load(host.img);
    context.strokeRect.mockClear();
    mouse(host.canvas, "mouseDown", 36, 36); mouse(host.canvas, "mouseMove", 52, 36);
    // Event step (2,1), origin (16,16), zoom 1: inset ring is (49,33), size 16-2.
    expect(context.strokeRect.mock.calls).toEqual([[49, 33, 14, 14]]);
    expect(move).not.toHaveBeenCalled(); mouse(host.canvas, "mouseUp", 140, 36);
    expect(select).toHaveBeenCalledWith({ kind: "object", index: 0 });
    expect(move.mock.calls).toEqual([[{ kind: "object", index: 0, x: 7, y: 1 }]]);
    mouse(host.canvas, "mouseDown", 36, 36); mouse(host.canvas, "mouseUp", 36, 36);
    expect(move).toHaveBeenCalledTimes(1);
    mouse(host.canvas, "mouseDown", 0, 0); expect(select).toHaveBeenLastCalledWith(null);
  });
  it("a miss pans, while event, paint and dropper gestures do not", () => {
    const change = vi.fn();
    const host = mount({ activeTool: null, onSelectEvent: vi.fn(), onViewChange: change });
    mouse(host.canvas, "mouseDown", 20, 20); mouse(host.canvas, "mouseMove", 30, 25); mouse(host.canvas, "mouseUp", 30, 25);
    expect(change.mock.calls).toEqual([[{ zoom: 1, pan: { x: 10, y: 5 } }]]);
    mouse(host.canvas, "mouseMove", 40, 40); expect(change).toHaveBeenCalledTimes(1);
  });
  it.each(["rect", "shift"] as const)("captured %s keeps a raw outside end and finishes once", async (kind) => {
    const host = mount({ activeTool: { kind } }); capture(host.canvas);
    expect(host.session.beginStroke).not.toHaveBeenCalled();
    mouse(host.canvas, "mouseDown"); fireEvent.mouseLeave(host.canvas);
    pointer(host.canvas, "pointerup"); pointer(host.canvas, "lostpointercapture");
    mouse(host.canvas, "mouseUp", 150, -20); mouse(host.canvas, "mouseUp", 150, -20);
    await host.settled(); expect(host.session.endStroke).toHaveBeenCalledTimes(1);
    expect(host.session.applyPaint.mock.calls).toEqual([[{ tool: kind, start: { x: 0, y: 0 }, end: { x: 4, y: -2 } }]]);
  });
  it.each([ ["pointercancel", "rect"], ["pointercancel", "shift"],
    ["lostpointercapture", "rect"], ["lostpointercapture", "shift"] ] as const)("%s ends %s with null and drops event drag", async (type, kind) => {
    const move = vi.fn();
    const host = mount({ activeTool: { kind }, onMoveEvent: move, onSelectEvent: vi.fn() });
    capture(host.canvas); mouse(host.canvas, "mouseDown"); mouse(host.canvas, "mouseMove", 80);
    pointer(host.canvas, type); pointer(host.canvas, type); mouse(host.canvas, "mouseUp", 80);
    await host.settled(); expect(host.session.applyPaint).not.toHaveBeenCalled(); expect(host.session.endStroke).toHaveBeenCalledTimes(1);
    host.update({ activeTool: null }); capture(host.canvas); mouse(host.canvas, "mouseDown", 36, 36);
    mouse(host.canvas, "mouseMove", 80, 36); pointer(host.canvas, type); mouse(host.canvas, "mouseUp", 80, 36);
    expect(move).not.toHaveBeenCalled();
  });
  it("a captured event drag survives leave and commits one raw release", () => {
    const move = vi.fn(); const host = mount({ activeTool: null, onSelectEvent: vi.fn(), onMoveEvent: move });
    capture(host.canvas); mouse(host.canvas, "mouseDown", 36, 36); fireEvent.mouseLeave(host.canvas);
    mouse(host.canvas, "mouseMove", 150, 36); expect(move).not.toHaveBeenCalled();
    pointer(host.canvas, "pointerup"); mouse(host.canvas, "mouseUp", 150, 36); mouse(host.canvas, "mouseUp", 150, 36);
    expect(move.mock.calls).toEqual([[{ kind: "object", index: 0, x: 8, y: 1 }]]);
  });
  it("map switch retires queued paint and drops an event drag", async () => {
    const move = vi.fn(); const host = mount({ onMoveEvent: move, onSelectEvent: vi.fn() });
    let resolve!: () => void;
    host.session.beginStroke.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    mouse(host.canvas, "mouseDown"); mouse(host.canvas, "mouseMove", 52);
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    host.update({ mapName: "B" }); mouse(host.canvas, "mouseUp", 80);
    await act(async () => { resolve(); }); await host.settled();
    expect(host.session.applyPaint).not.toHaveBeenCalled(); expect(host.session.endStroke).toHaveBeenCalledTimes(1);
    host.update({ activeTool: null }); capture(host.canvas); mouse(host.canvas, "mouseDown", 36, 36);
    host.update({ mapName: "C" }); mouse(host.canvas, "mouseUp", 80, 36);
    expect(move).not.toHaveBeenCalled();
  });
  it("without capture, leave abandons the rectangle and event drag", async () => {
    const move = vi.fn(); const host = mount({ activeTool: { kind: "rect" }, onMoveEvent: move, onSelectEvent: vi.fn() });
    mouse(host.canvas, "mouseDown"); fireEvent.mouseLeave(host.canvas); mouse(host.canvas, "mouseUp", 80);
    await host.settled(); expect(host.session.endStroke).toHaveBeenCalledTimes(1); expect(host.session.applyPaint).not.toHaveBeenCalled();
    host.update({ activeTool: null }); mouse(host.canvas, "mouseDown", 36, 36); fireEvent.mouseLeave(host.canvas);
    mouse(host.canvas, "mouseUp", 80, 36); expect(move).not.toHaveBeenCalled();
  });
  it("routes rejected applies and registers a live settling chain until unmount", async () => {
    const error = vi.fn(); const host = mount({ onEditError: error });
    expect(host.register).toHaveBeenCalledTimes(1); const chain = host.register.mock.calls[0]![0] as SettledChain;
    let reject!: (error: Error) => void;
    host.session.applyPaint.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    mouse(host.canvas, "mouseDown"); mouse(host.canvas, "mouseUp");
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(host.session.applyPaint).toHaveBeenCalledTimes(1);
    let done = false;
    const settlement = chain.settled().then(() => { done = true; });
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(done).toBe(false);
    expect(host.session.endStroke).not.toHaveBeenCalled();
    await act(async () => { reject(new Error("paint broke")); await settlement; });
    expect(done).toBe(true);
    expect(error.mock.calls).toEqual([["paint broke"]]); expect(host.session.endStroke).toHaveBeenCalledTimes(1);
    host.unmount(); expect(host.register).toHaveBeenLastCalledWith(chain, false);
  });
});

describe("presentation and map lifecycle", () => {
  it("notifies hover id changes only, including leave and map switch", () => {
    const hover = vi.fn(); const host = mount({ activeTool: null, onHoverMetatile: hover });
    expect(hover.mock.calls).toEqual([[null]]); hover.mockClear();
    mouse(host.canvas, "mouseMove", 20); mouse(host.canvas, "mouseMove", 21);
    expect(hover.mock.calls).toEqual([[7]]);
    host.update({ onHoverMetatile: hover }); expect(hover).toHaveBeenCalledTimes(1);
    mouse(host.canvas, "mouseMove", 85); expect(hover).toHaveBeenLastCalledWith(8);
    fireEvent.mouseLeave(host.canvas); expect(hover).toHaveBeenLastCalledWith(null);
    mouse(host.canvas, "mouseMove", 20); host.update({ mapName: "B" });
    expect(hover.mock.calls.map(([id]) => id)).toEqual([7, 8, null, 7, null]);
  });
  it("renders status items, legends and clears overlays, encounters and hover on map switch", () => {
    const host = mount();
    expect(screen.getByText("family readout").className).toBe("map-canvas__status-item");
    expect(screen.queryByText("Event legend")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Events" })); fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.getByText("Event legend").parentElement?.className).toBe("map-canvas__legend");
    mouse(host.canvas, "mouseMove"); expect(screen.getByText("hover readout")).toBeTruthy();
    host.update({ mapName: "B" });
    expect(screen.getByRole("button", { name: "Events" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Encounters" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("hover readout")).toBeNull();
    host.update({ mapName: "A" }); expect(screen.queryByText("Event legend")).toBeNull();
  });
  it("supplies visibility to readouts so disabling events suppresses stale hover marks", () => {
    const a = adapter({ statusItems: (hover, enabled) => [{ key: "hover", content: hover
      ? `readout${enabled.events ? " event mark" : ""}` : "empty" }] });
    const host = mount({ adapter: a });
    fireEvent.click(screen.getByRole("button", { name: "Events" })); mouse(host.canvas, "mouseMove");
    expect(screen.getByText("readout event mark")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(screen.queryByText("readout event mark")).toBeNull(); expect(screen.getByText("readout")).toBeTruthy();
  });
  it("encounter presentation changes reach border and legend without changing view or fitting", () => {
    const summaries = [{ species: "RATTATA", displayName: "Rattata", iconUrl: "/rattata.png", rows: [] }];
    observations.encounters.mockReturnValue({ summaries, error: null });
    const a = adapter(); const host = mount({ adapter: a, view: undefined, activeTool: null });
    fireEvent.load(host.img); fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(observations.fit).toHaveBeenCalledTimes(1);
    mouse(host.canvas, "mouseDown"); mouse(host.canvas, "mouseMove", 29, 32); mouse(host.canvas, "mouseUp", 29, 32);
    const before = observations.view.mock.calls.at(-1)![0];
    expect(before.pan).toEqual({ x: 9, y: 12 });
    observations.encounters.mockClear();
    host.update({ adapter: { ...a,
      encounters: { ...a.encounters, time: "nite", legendHint: "at nite" }, imageUrl: () => "/A.png?time=nite" } });
    fireEvent.load(host.img);
    expect(screen.getByText("at nite")).toBeTruthy();
    expect(observations.border).toHaveBeenLastCalledWith(expect.objectContaining({ time: "nite", zoom: 32,
      entries: [expect.objectContaining({ rect: { x: 9, y: 12, width: 128, height: 128 }, summaries })] }));
    expect(observations.view.mock.calls.at(-1)![0]).toEqual(before);
    expect(observations.fit).toHaveBeenCalledTimes(1);
    // Time is presentation only: the summary hook receives the same semantic inputs throughout the switch.
    expect(observations.encounters.mock.calls.length).toBeGreaterThan(0);
    expect(observations.encounters.mock.calls.every((args) => JSON.stringify(args) === JSON.stringify(["A", "gbc", true]))).toBe(true);
  });
  it("chromeless hides all chrome with encounters initially off", () => {
    const host = mount({ chromeless: true });
    expect(host.container.querySelector(".map-canvas--chromeless")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByText("family readout")).toBeNull();
    expect(observations.border).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });
  it("keeps encounters enabled when chromeless is turned on without remounting", () => {
    const host = mount();
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(observations.border).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
    observations.encounters.mockClear();
    host.update({ chromeless: true });
    expect(host.container.querySelector(".map-canvas--chromeless")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(host.container.querySelector(".map-canvas__legend")).toBeNull();
    expect(host.container.querySelector(".map-canvas__status")).toBeNull();
    expect(observations.border).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
    expect(observations.encounters).toHaveBeenCalledWith("A", "gbc", true);
    expect(observations.encounters.mock.calls.every((args) => args[2] === true)).toBe(true);
  });
  it.each([false, true])("debounces blocks with skipFirstBlocksChange=%s; map switch/unmount clear timers", (skip) => {
    vi.useFakeTimers(); let a = adapter({ skipFirstBlocksChange: skip }); const host = mount({ adapter: a });
    const change = () => { a = { ...a, blocks: [] }; host.update({ adapter: a }); };
    expect(host.img.getAttribute("src")).not.toContain("v="); change(); act(() => vi.advanceTimersByTime(201));
    expect(host.img.getAttribute("src")?.includes("v=1")).toBe(!skip);
    change(); change(); act(() => vi.advanceTimersByTime(199));
    const before = host.img.getAttribute("src"); act(() => vi.advanceTimersByTime(1));
    expect(host.img.getAttribute("src")).not.toBe(before);
    const version = skip ? 1 : 2;
    expect(host.img.getAttribute("src")).toContain(`v=${version}`);
    change(); host.update({ mapName: "B" }); const switched = host.img.getAttribute("src");
    act(() => vi.advanceTimersByTime(500)); expect(host.img.getAttribute("src")).toBe(switched);
    change(); act(() => vi.advanceTimersByTime(199));
    expect(host.img.getAttribute("src")).toBe(switched);
    act(() => vi.advanceTimersByTime(1));
    if (skip) expect(host.img.getAttribute("src")).toBe(switched);
    else expect(host.img.getAttribute("src")).toContain(`v=${version + 1}`);
    const afterFirst = host.img.getAttribute("src");
    change(); act(() => vi.advanceTimersByTime(199));
    expect(host.img.getAttribute("src")).toBe(afterFirst);
    act(() => vi.advanceTimersByTime(1));
    expect(host.img.getAttribute("src")).toContain(`v=${version + (skip ? 1 : 2)}`);
    change(); host.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("real mounted image readiness", () => {
  const baseDraws = () => draw.mock.calls.filter(([source]) => source instanceof HTMLImageElement).length;
  it("current URL load composites, but error never composites", () => {
    const host = mount(); Object.defineProperties(host.img, { complete: { value: false }, naturalWidth: { value: 0 } });
    expect(baseDraws()).toBe(0); fireEvent.error(host.img); expect(baseDraws()).toBe(0);
    fireEvent.load(host.img); expect(baseDraws()).toBe(1);
    fireEvent.error(host.img); const a = host.props.adapter;
    host.update({ adapter: { ...a, overlays: [{ ...a.overlays[0]!, deps: [1] }] } }); expect(baseDraws()).toBe(1);
  });
  it("a late old URL load cannot composite the new map; its current load can", async () => {
    const host = mount(); const oldImg = host.img, oldLoad = observations.loads.at(-1)!;
    let resolve!: () => void; const deferred = new Promise<void>((done) => { resolve = done; });
    const late = deferred.then(() => { oldLoad(); });
    host.update({ mapName: "B" });
    expect(host.img).toBe(oldImg);
    await act(async () => { resolve(); await late; }); expect(baseDraws()).toBe(0);
    fireEvent.load(host.img); expect(baseDraws()).toBe(1);
  });
  it("cached complete image with positive naturalWidth composites without a load event, including StrictMode", () => {
    observations.cached = true;
    const host = mount({}, true);
    expect(baseDraws()).toBe(1);
    expect(host.img.complete).toBe(true); expect(host.img.naturalWidth).toBe(128);
  });
  it("a URL change recognizes a cached complete image without a load event", () => {
    const host = mount({}, true);
    // The viewport wrapper defines cached properties on the real mounted img before passive readiness effects.
    observations.cached = true;
    host.update({ mapName: "B" }); expect(baseDraws()).toBe(1);
    expect(host.img.complete).toBe(true); expect(host.img.naturalWidth).toBe(128);
  });
  it("unmount with a pending load neither draws nor throws", async () => {
    const host = mount(); const img = host.img, onLoad = observations.loads.at(-1)!;
    let resolve!: () => void; const deferred = new Promise<void>((done) => { resolve = done; });
    const late = deferred.then(() => { fireEvent.load(img); onLoad(); }); host.unmount();
    await act(async () => { resolve(); await late; }); expect(baseDraws()).toBe(0);
  });
});
