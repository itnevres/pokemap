import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MapCanvas, type MapCanvasProps } from "../../src/components/MapCanvas.js";
import { MapEditingWorkspace } from "../../src/components/MapEditingWorkspace.js";
import { useMapEditing } from "../../src/hooks/useMapEditing.js";
import { useGbaRuntime } from "../../src/gba/adapter.js";
import type { ShellSlots } from "../../src/shell/adapter.js";
import type { MapLayoutData } from "../../src/hooks/useMapLayout.js";
import type { UseEditSessionResult } from "../../src/hooks/useEditSession.js";
import { useStrokeChainRegistry } from "../../src/shared/useStrokeChain.js";

const observed = vi.hoisted(() => ({ loads: [] as (() => void)[], session: null as UseEditSessionResult | null,
  data: null as MapLayoutData | null }));
// Capture callbacks without replacing the real viewport or image. Invoke the old URL closure explicitly.
vi.mock("../../src/shared/MapCanvasViewport.js", async (original) => {
  const actual = await original<typeof import("../../src/shared/MapCanvasViewport.js")>();
  return { MapCanvasViewport: (props: Parameters<typeof actual.MapCanvasViewport>[0]) => {
    observed.loads.push(props.onImgLoad);
    return <actual.MapCanvasViewport {...props} />;
  } };
});
// The context test exercises the real gba/adapter renderWorld -> workspace -> chromeless MapCanvas path.
// World positioning is the seam: keep its supplied context.renderCanvas, use a known 1x view.
vi.mock("../../src/components/WorldCanvas.js", () => ({ WorldCanvas: ({ context }: {
  context?: { renderCanvas: (view: { zoom: 1; pan: { x: number; y: number } }, change: () => void) => import("react").ReactNode }
}) => context?.renderCanvas({ zoom: 1, pan: { x: 0, y: 0 } }, () => {}) }));
vi.mock("../../src/hooks/useMapGroups.js", () => ({ useMapGroups: () => ({ data: null, error: null }) }));
vi.mock("../../src/hooks/useMapLayout.js", () => ({ useMapLayout: () => ({ data: observed.data, error: null }) }));
vi.mock("../../src/hooks/useMapDefects.js", () => ({ useMapDefects: () => ({ defects: [], incomplete: [], error: null }) }));
vi.mock("../../src/hooks/useWorldVisibility.js", () => ({ useWorldVisibility: () => ({ placed: null, error: null, refresh: () => {} }) }));
vi.mock("../../src/hooks/useDungeons.js", () => ({ useDungeons: () => ({ data: null, error: null }) }));
vi.mock("../../src/hooks/useEditSession.js", async (original) => ({
  ...await original<typeof import("../../src/hooks/useEditSession.js")>(), useEditSession: () => observed.session,
}));
// Keep the actual editing state and error setter, preselect only the pencil/stamp to avoid palette I/O.
vi.mock("../../src/hooks/useMapEditing.js", async (original) => {
  const actual = await original<typeof import("../../src/hooks/useMapEditing.js")>();
  return { ...actual, useMapEditing: (...args: Parameters<typeof actual.useMapEditing>) => ({
    ...actual.useMapEditing(...args), activeToolKind: "pencil", currentStamp: { width: 1, height: 1, cells: [{ metatileId: 9 }] },
    activeTool: { kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 9 }] } },
  }) };
});

const DATA: MapLayoutData = {
  map: {
    id: "MAP_FOO",
    name: "Foo",
    layout: "LAYOUT_FOO",
    music: "MUS_DUMMY",
    regionMapSection: "MAPSEC_NONE",
    mapType: "MAP_TYPE_TOWN",
    weather: "WEATHER_NONE",
    connections: [],
    objectEvents: [
      { graphicsId: "OBJ_EVENT_GFX_BOY", x: 0, y: 0, elevation: 3, movementType: "MOVEMENT_TYPE_NONE", movementRangeX: 1, movementRangeY: 1, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "NULL", flag: "0" },
    ],
    warpEvents: [],
    coordEvents: [],
    bgEvents: [],
  },
  layout: {
    id: "LAYOUT_FOO",
    name: "Foo_Layout",
    width: 2,
    height: 2,
    borderWidth: 1,
    borderHeight: 1,
    primaryTileset: "gTileset_General",
    secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/Foo/border.bin",
    blockdataFilepath: "data/layouts/Foo/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0x05 },
    { metatileId: 0x11, collision: 1, elevation: 3, behavior: 0x05 },
    { metatileId: 0x12, collision: 0, elevation: 0, behavior: 0x05 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0x09 },
  ],
  primaryCount: 512,
  secondaryCount: 144,
};

function makeEditSession(overrides: Partial<UseEditSessionResult> = {}): UseEditSessionResult {
  return {
    blocks: [], border: [], map: undefined, isDirty: false, canUndo: false, canRedo: false,
    beginStroke: vi.fn().mockResolvedValue(undefined),
    applyPaint: vi.fn().mockResolvedValue(undefined),
    endStroke: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
    markClean: vi.fn(),
    moveEvent: vi.fn().mockResolvedValue(undefined),
    addEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    applyExternalMapUpdate: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const STAMP = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
const VIEW = { zoom: 1 as const, pan: { x: 0, y: 0 } };
const contexts = new Map<HTMLCanvasElement, ReturnType<typeof makeContext>>();
function makeContext() {
  return { drawImage: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn((_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })),
    putImageData: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() };
}
beforeEach(() => {
  observed.data = DATA;
  observed.session = makeEditSession({ blocks: DATA.blocks });
  observed.loads.length = 0;
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, makeContext());
    return contexts.get(this)! as unknown as CanvasRenderingContext2D;
  });
  // Palette/inspector metadata requests are ancillary to the real editing workspace.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); contexts.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function flush() { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function gesture(canvas: HTMLCanvasElement) {
  // 1 border block * 16px; (20,20) lies in paint/event cell (0,0).
  fireEvent.mouseDown(canvas, { button: 0, clientX: 20, clientY: 20 });
  fireEvent.mouseUp(canvas, { button: 0, clientX: 20, clientY: 20 });
}
function mount(extra: Partial<MapCanvasProps> = {}) {
  const props = { mapName: "Foo", data: DATA, view: VIEW, ...extra };
  return render(<MapCanvas {...props} />);
}

describe("GBA MapSurface integration", () => {
  it.each(["pencil", "collision"] as const)("P12-4b: %s queues each visited cell once", async (kind) => {
    const session = observed.session!;
    const activeTool = kind === "pencil" ? { kind, stamp: STAMP } : { kind, value: { collision: 1, elevation: 3 } };
    const { container } = mount({ editSession: session, activeTool });
    const canvas = container.querySelector("canvas")!;
    fireEvent.mouseDown(canvas, { button: 0, clientX: 20, clientY: 20 });
    for (const x of [21, 22, 36, 37]) fireEvent.mouseMove(canvas, { buttons: 1, clientX: x, clientY: 20 });
    fireEvent.mouseUp(canvas, { button: 0, clientX: 37, clientY: 20 });
    await flush();
    expect(session.applyPaint).toHaveBeenCalledTimes(2);
    expect(vi.mocked(session.applyPaint).mock.calls.map(([body]) => body)).toEqual([0, 1].map((x) => ({
      tool: "pencil", targets: [{ x, y: 0 }], origin: { x, y: 0 }, stamp: kind === "pencil" ? STAMP :
        { width: 1, height: 1, cells: [{ collision: 1, elevation: 3 }] },
    })));
    gesture(canvas);
    await flush();
    expect(session.applyPaint).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])("P12-4f: rejected apply reaches the dismissible workspace banner (context=%s)", async (context) => {
    const apply = deferred();
    const session = makeEditSession({ blocks: DATA.blocks, applyPaint: vi.fn(() => apply.promise) });
    observed.session = session;
    function MapHost() {
      const editing = useMapEditing({ editSession: session, layoutData: DATA, mapName: "Foo" });
      return <MapEditingWorkspace mapName="Foo" data={DATA} editSession={session} editing={editing} />;
    }
    function ContextHost() {
      const runtime = useGbaRuntime({ selected: "Foo", mode: "world", requestPrompt: () => {} });
      const slots: ShellSlots = { contextMap: "Foo", jumpTarget: null, jumpToken: 0, tileVersions: {},
        selectMap: () => {}, selectMapFromWorld: () => {}, openMapFromWorld: () => {}, enterContext: () => {},
        requestExitContext: () => {}, onStrokeChain: () => {}, markManualPlacement: () => {} };
      return runtime.renderWorld(slots);
    }
    const { container } = render(context ? <ContextHost /> : <MapHost />);
    const canvas = container.querySelector("canvas.map-canvas__stage")! as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    expect(!!container.querySelector(".map-canvas--chromeless")).toBe(context);
    gesture(canvas);
    await flush();
    expect(session.applyPaint).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".app__event-op-error")).toBeNull();
    await act(async () => { apply.reject(new Error("paint refused")); });
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("paint refused");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(container.querySelector(".app__event-op-error")).toBeNull();
  });

  it("P12-4g: an old URL handler cannot composite the new image", async () => {
    const { container, rerender } = mount();
    const img = container.querySelector("img")!;
    const oldLoad = observed.loads.at(-1)!;
    fireEvent.load(img);
    await flush();
    // Offscreen drawImage(img,0,0) counts composites; stage blits use a canvas and nine arguments.
    const composites = () => [...contexts.values()].flatMap((ctx) => ctx.drawImage.mock.calls).filter((call) => call[0] === img).length;
    expect(composites()).toBe(1);
    rerender(<MapCanvas mapName="Bar" data={DATA} view={VIEW} />);
    const before = composites();
    act(() => oldLoad());
    await flush();
    expect(composites()).toBe(before);
    expect(container.querySelector("img")).toBe(img);
    fireEvent.load(img);
    await flush();
    expect(composites()).toBe(before + 1);
  });

  it("P12-4g: cached complete images load under StrictMode and on URL changes", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(64);
    const { container, rerender } = render(<StrictMode><MapCanvas mapName="Foo" data={DATA} view={VIEW} /></StrictMode>);
    const img = container.querySelector("img")!;
    const composites = () => [...contexts.values()].flatMap((ctx) => ctx.drawImage.mock.calls).filter((call) => call[0] === img).length;
    await flush();
    expect(composites()).toBeGreaterThan(0);
    const before = composites();
    rerender(<StrictMode><MapCanvas mapName="Bar" data={DATA} view={VIEW} /></StrictMode>);
    await flush();
    expect(composites()).toBeGreaterThan(before);
  });

  it("P12-4h/P12-8: omits v on session start and delayed reseed, then bumps on paint", async () => {
    vi.useFakeTimers();
    let session = observed.session!;
    const { container, rerender } = mount();
    const img = container.querySelector("img")!;
    const version = () => new URL(img.src).searchParams.get("v");
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session} view={VIEW} />);
    expect(version()).toBeNull();
    session = { ...session, blocks: [...session.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session} view={VIEW} />);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(version()).toBeNull();
    session = { ...session, blocks: [...session.blocks] };
    rerender(<MapCanvas mapName="Foo" data={DATA} editSession={session} view={VIEW} />);
    expect(version()).toBeNull();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(version()).toBe("1");
  });

  it("event marks never leak across a map switch before the new map composites", async () => {
    const hover = (canvas: HTMLCanvasElement) => {
      fireEvent.mouseMove(canvas, { buttons: 0, clientX: 20, clientY: 20 });
      return container.querySelector(".map-canvas__hover")!.textContent ?? "";
    };
    const { container, rerender } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    fireEvent.load(container.querySelector("img")!);
    await flush();
    expect(hover(container.querySelector("canvas")!)).toContain("object:");
    const other = { ...DATA, map: { ...DATA.map, name: "Bar" } };
    rerender(<MapCanvas mapName="Bar" data={other} view={VIEW} />);
    // Toggles reset on a map switch; turn Events on before Bar's image loads, so Bar has not composited.
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    await flush();
    expect(screen.getByRole("button", { name: "Events" }).getAttribute("aria-pressed")).toBe("true");
    expect(hover(container.querySelector("canvas")!)).not.toContain("object:");
  });

  it("PR-I3: registry settlement waits for both deferred apply and deferred end", async () => {
    const apply = deferred();
    const end = deferred();
    const session = makeEditSession({ blocks: DATA.blocks, applyPaint: vi.fn(() => apply.promise), endStroke: vi.fn(() => end.promise) });
    let strokeSettled!: () => Promise<void>;
    function Host() {
      const registry = useStrokeChainRegistry();
      strokeSettled = registry.strokeSettled;
      return <MapCanvas mapName="Foo" data={DATA} view={VIEW} editSession={session}
        activeTool={{ kind: "pencil", stamp: STAMP }} onStrokeChain={registry.onStrokeChain} />;
    }
    const { container } = render(<Host />);
    gesture(container.querySelector("canvas")!);
    let settled = false;
    const settlement = strokeSettled().then(() => { settled = true; });
    try {
      await flush();
      expect(session.applyPaint).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
      expect(session.endStroke).not.toHaveBeenCalled();
      apply.resolve();
      await flush();
      expect(session.endStroke).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);
      end.resolve();
      await act(async () => { await settlement; });
      expect(settled).toBe(true);
    } finally {
      apply.resolve(); end.resolve();
      await act(async () => { await settlement; });
    }
  });
});
