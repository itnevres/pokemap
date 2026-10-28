import { useCallback } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { GbcWorldCanvas, type GbcWorldCanvasProps } from "../../src/gbc/GbcWorldCanvas.js";

const observations = vi.hoisted(() => ({ reload: vi.fn() }));

// Count the actual hook boundary. GET counts can be batched and cannot prove one reload per gesture.
vi.mock("../../src/gbc/hooks/useGbcWorld.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/gbc/hooks/useGbcWorld.js")>();
  return {
    ...actual,
    useGbcWorld: (...args: Parameters<typeof actual.useGbcWorld>) => {
      const result = actual.useGbcWorld(...args);
      const reload = useCallback(() => {
        observations.reload();
        return result.reload();
      }, [result.reload]);
      return { ...result, reload };
    },
  };
});

class FakeImage {
  static instances: FakeImage[] = [];
  private _src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
  }
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire() {
    this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

interface FakeCtx {
  imageSmoothingEnabled: boolean;
  drawImage: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillStyle: string;
  fillLog: string[];
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
}
const ctxByCanvas = new Map<HTMLCanvasElement, FakeCtx>();
function makeFakeCtx(): FakeCtx {
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: "",
    fillLog: [] as string[],
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  };
  ctx.fill = vi.fn(() => ctx.fillLog.push(ctx.fillStyle));
  return ctx;
}

const VIEWPORT_SIZE = 200;


// One 2-map landmass (MapA/MapB) plus a far-away 1-map interior -- exactly
// the shape the spec's own initialFitBounds fixture calls for. No
// conflicts here; the conflict badge/tooltip tests use their own fixture
// below (real Route16/17/18-shaped names, per the spec's exact-string test).
const WORLD: GbcWorldPayload = {
  family: "gbc",
  blockPx: 32,
  placements: {
    MapA: { map: "MapA", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
    MapB: { map: "MapB", x: 10, y: 0, width: 10, height: 10, component: 0, mapType: "ROUTE", manual: false },
    Interior: { map: "Interior", x: 1000, y: 1000, width: 5, height: 5, component: 1, mapType: "TOWN", manual: false },
  },
  components: [
    { index: 0, maps: ["MapA", "MapB"], bounds: { x: 0, y: 0, width: 20, height: 10 } },
    { index: 1, maps: ["Interior"], bounds: { x: 1000, y: 1000, width: 5, height: 5 } },
  ],
  conflicts: [], sidecar: { dungeonAutoLayout: true },
};

const EMPTY_COVERAGE = {
  mapsWithEncounters: 0,
  mapsWithoutEncounters: [] as string[],
  sourcesByMethod: {},
  levelByMap: [] as { mapName: string; averageLevel: number }[],
  unusedSpecies: [] as string[],
  fishGroupWithoutWater: [],
  defects: [],
};

interface AllFetchOpts {
  world?: GbcWorldPayload;
  encounters?: Record<string, unknown[]>;
  coverage?: typeof EMPTY_COVERAGE;
  species?: string[];
  where?: Record<string, unknown[]>;
}

function mockFetchAll(opts: AllFetchOpts) {
  const world = opts.world ?? WORLD;
  return vi.fn((url: string) => {
    if (url === "/api/world") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(world) } as Response);
    const encMatch = /^\/api\/encounters\/(.+)$/.exec(url);
    if (encMatch) {
      const name = decodeURIComponent(encMatch[1]!);
      const sources = opts.encounters?.[name] ?? [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ family: "gbc", mapName: name, sources, defects: [] }),
      } as Response);
    }
    if (url === "/api/coverage") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.coverage ?? EMPTY_COVERAGE) } as Response);
    }
    if (url === "/api/species") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.species ?? []) } as Response);
    }
    const whereMatch = /^\/api\/where\/(.+)$/.exec(url);
    if (whereMatch) {
      const species = decodeURIComponent(whereMatch[1]!);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.where?.[species] ?? []) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

const response = (payload: unknown) => ({
  ok: true, status: 200, json: () => Promise.resolve(payload),
}) as Response;
let posts: Array<{ body: unknown; outcome: ReturnType<typeof deferred<Response>> }>;

beforeEach(() => {
  FakeImage.instances = [];
  FakeResizeObserver.instances = [];
  posts = [];
  observations.reload.mockClear();
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // Copied viewport fixture: a square 200px viewport, not the default zero-sized jsdom box.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(VIEWPORT_SIZE);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(VIEWPORT_SIZE);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = ctxByCanvas.get(this);
    if (!ctx) {
      ctx = makeFakeCtx();
      ctxByCanvas.set(this, ctx);
    }
    return ctx as unknown as CanvasRenderingContext2D;
  } as never);
});

afterEach(() => {
  cleanup();
  ctxByCanvas.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Bounded act loops flush only microtasks; tests settle their own deferred network responses explicitly.
async function settle() {
  for (let turn = 0; turn < 12; turn++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount(
  props: Partial<GbcWorldCanvasProps> = {},
  world: GbcWorldPayload = WORLD,
  warps?: unknown,
  encounters?: AllFetchOpts["encounters"],
) {
  const base = mockFetchAll({ world, encounters });
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/world/placement") {
      const outcome = deferred<Response>();
      posts.push({ body: JSON.parse(String(init?.body)), outcome });
      return outcome.promise;
    }
    if (url === "/api/warps/MapA") {
      return Promise.resolve(response({ family: "gbc", mapName: "MapA", warps: warps ?? [] }));
    }
    if (url.startsWith("/api/warps/")) {
      return Promise.resolve(response({ family: "gbc", mapName: decodeURIComponent(url.slice(11)), warps: [] }));
    }
    return base(url);
  }));
  const host = render(<GbcWorldCanvas time="day" {...props} />);
  await settle();
  // Cluster (0,0)-(20,10), 200x200 viewport: zoom=min(200/20,200/10)=10, pan=(0,50).
  // Percent=round(10/32*100)=31. A/B centres project to (50,100)/(150,100).
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("zoom 31%");
  const canvas = host.container.querySelector<HTMLCanvasElement>("canvas.world-canvas__stage")!;
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {},
  });
  return { ...host, canvas };
}

type Host = Awaited<ReturnType<typeof mount>>;
const outlines = (host: Host) => host.container.querySelectorAll<HTMLElement>(
  ".world-canvas__selection-outline:not(.world-canvas__jump-highlight)",
);
function click(host: Host, x: number, y: number, modifiers = {}) {
  const at = { button: 0, clientX: x, clientY: y, ...modifiers };
  fireEvent.mouseDown(host.canvas, at);
  fireEvent.mouseUp(host.canvas, at);
  fireEvent.click(host.canvas, at);
}

// A pointer ID of 1 identifies this single gesture; MouseEvent + an explicit property supports older jsdom.
function pointer(canvas: HTMLCanvasElement, type: string, x = 50, y = 100) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(canvas, event);
}
function capture(canvas: HTMLCanvasElement) {
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = () => true;
  canvas.releasePointerCapture = vi.fn();
}

it.each(["ctrlKey", "metaKey"])("P12-3: %s toggles a second map into and out of selection", async (modifier) => {
  const host = await mount();
  click(host, 50, 100);
  click(host, 150, 100, { [modifier]: true });
  // Two selected 10-block maps at zoom10 give two 100px outlines, left=0 and left=100, top=50.
  expect([...outlines(host)].map((node) => [node.style.left, node.style.top, node.style.width]))
    .toEqual([["0px", "50px", "100px"], ["100px", "50px", "100px"]]);
  click(host, 150, 100, { [modifier]: true });
  // Toggling B again leaves only A, the initial selection.
  expect(outlines(host)).toHaveLength(1);
});

it("P12-3: marquee selects both covered maps through the wrapper", async () => {
  const host = await mount();
  // Empty point (201,151) lies just below/right of both rectangles. Crossing to (-1,49) covers both completely.
  fireEvent.mouseDown(host.canvas, { button: 0, ctrlKey: true, clientX: 201, clientY: 151 });
  fireEvent.mouseMove(host.canvas, { clientX: -1, clientY: 49 });
  expect(host.container.querySelector(".world-canvas__marquee")).not.toBeNull();
  fireEvent.mouseUp(host.canvas);
  // Two covered maps means two outlines; the completed marquee is removed and no placement was changed.
  expect(outlines(host)).toHaveLength(2);
  expect(host.container.querySelector(".world-canvas__marquee")).toBeNull();
  expect(posts).toHaveLength(0);
});

it("P12-3: group movement posts one body per map and reloads once after both deferred saves", async () => {
  const onPlacementsSaved = vi.fn();
  const host = await mount({ onPlacementsSaved });
  click(host, 50, 100);
  click(host, 150, 100, { ctrlKey: true });
  fireEvent.mouseDown(host.canvas, { button: 0, shiftKey: true, clientX: 50, clientY: 100 });
  fireEvent.mouseMove(host.canvas, { clientX: 70, clientY: 110 });
  fireEvent.mouseUp(host.canvas);
  // Screen delta(20,10)/zoom10=(2,1) blocks. A(0,0)->(2,1), B(10,0)->(12,1).
  // Exactly two bodies: the one-map route cannot accept a whole selection in one request.
  expect(posts.map((post) => post.body)).toEqual([
    { map: "MapA", x: 2, y: 1 },
    { map: "MapB", x: 12, y: 1 },
  ]);
  expect(observations.reload).not.toHaveBeenCalled();
  await act(async () => posts[0]!.outcome.resolve(response({ ok: true })));
  await settle();
  // One settled member of two is insufficient: neither the hook reload nor the success callback runs yet.
  expect(observations.reload).not.toHaveBeenCalled();
  expect(onPlacementsSaved).not.toHaveBeenCalled();
  await act(async () => posts[1]!.outcome.resolve(response({ ok: true })));
  await settle();
  // One completed gesture owns exactly one reload, after both map outcomes.
  expect(observations.reload).toHaveBeenCalledTimes(1);
  expect(onPlacementsSaved).toHaveBeenCalledTimes(1);
  expect(onPlacementsSaved).toHaveBeenCalledWith(["MapA", "MapB"]);
});

it("P12-4a: captures the down target and commits once on a captured release outside", async () => {
  const host = await mount();
  capture(host.canvas);
  pointer(host.canvas, "pointerdown");
  // This gesture's pointer ID is 1; capture is taken on the same canvas that received pointerdown.
  expect(host.canvas.setPointerCapture).toHaveBeenCalledWith(1);
  expect(vi.mocked(host.canvas.setPointerCapture).mock.instances).toEqual([host.canvas]);
  fireEvent.mouseDown(host.canvas, { button: 0, shiftKey: true, clientX: 50, clientY: 100 });
  // Captured events stay targeted at the canvas at outside coordinates (250,210), beyond its 200x200 viewport.
  fireEvent.mouseMove(host.canvas, { clientX: 250, clientY: 210 });
  fireEvent.mouseLeave(host.canvas);
  // Leave with capture must not prematurely commit.
  expect(posts).toHaveLength(0);
  pointer(host.canvas, "pointerup", 250, 210);
  fireEvent.mouseUp(host.canvas, { clientX: 250, clientY: 210 });
  fireEvent.mouseLeave(host.canvas);
  fireEvent.mouseUp(host.canvas);
  // Screen delta(200,110)/10=(20,11); A(0,0)->(20,11). Repeated termination creates no second body.
  expect(posts.map((post) => post.body)).toEqual([{ map: "MapA", x: 20, y: 11 }]);
  await act(async () => posts[0]!.outcome.resolve(response({ ok: true })));
  await settle();
  // Exactly one captured gesture, hence one hook reload.
  expect(observations.reload).toHaveBeenCalledTimes(1);
});

it("P12-4a: capture loss without pointerup cancels and never posts", async () => {
  const host = await mount();
  click(host, 50, 100);
  capture(host.canvas);
  pointer(host.canvas, "pointerdown");
  fireEvent.mouseDown(host.canvas, { button: 0, shiftKey: true, clientX: 50, clientY: 100 });
  fireEvent.mouseMove(host.canvas, { clientX: 70, clientY: 110 });
  // Delta(20,10)/10=(2,1), projecting optimistic A to (20,60) before cancellation.
  expect([outlines(host)[0]!.style.left, outlines(host)[0]!.style.top]).toEqual(["20px", "60px"]);
  pointer(host.canvas, "lostpointercapture");
  fireEvent.mouseUp(host.canvas);
  fireEvent.mouseLeave(host.canvas);
  await settle();
  // Cancellation restores A(0,0), screen(0,50), with zero saves and zero reloads.
  expect([outlines(host)[0]!.style.left, outlines(host)[0]!.style.top]).toEqual(["0px", "50px"]);
  expect(posts).toHaveLength(0);
  expect(observations.reload).not.toHaveBeenCalled();
});

it("P12-4i: eight pixels from a visible half-block warp suppresses selection; nine selects", async () => {
  const onSelectMap = vi.fn();
  // Raw event(10,10) is world(5,5) blocks; zoom10 and pan(0,50) put its marker at (50,100).
  const warp = { x: 10, y: 10, mapConst: "TARGET", destWarp: 1, lineIndex: 1 };
  const host = await mount({ onSelectMap }, WORLD, [warp]);
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  const marker = host.container.querySelector<HTMLElement>(".world-canvas__warp-marker")!;
  expect([marker.style.left, marker.style.top]).toEqual(["50px", "100px"]);
  // (58,100) is exactly radius8; (59,100) is radius9, still inside MapA's 100px-wide body.
  click(host, 58, 100);
  expect(onSelectMap).not.toHaveBeenCalled();
  expect(outlines(host)).toHaveLength(0);
  click(host, 59, 100);
  expect(onSelectMap).toHaveBeenCalledWith("MapA");
  // The miss selects exactly one map.
  expect(outlines(host)).toHaveLength(1);
});

it.each(["INDOOR", "GATE"])("P12-4q: an unfiltered jump reveals and draws a hidden %s placement", async (mapType) => {
  const world = { ...WORLD, placements: {
    ...WORLD.placements, Interior: { ...WORLD.placements.Interior!, mapType },
  } };
  const host = await mount({}, world);
  expect(FakeImage.instances.some((image) => image.src.includes("Interior.png"))).toBe(false);
  host.rerender(<GbcWorldCanvas time="day" jumpToMap="Interior" jumpToken={1} />);
  await settle();
  const image = FakeImage.instances.find((entry) => entry.src === "/api/render/Interior.png?time=day");
  expect(image).toBeDefined();
  await act(async () => image!.onload?.());
  const ctx = ctxByCanvas.get(host.canvas)!;
  // Map size5x5, 200x200 viewport: 60% fill gives zoom=.6*40=24, pan=100-1002.5*24=-23960.
  // Interior(1000,1000) projects to (40,40), with size 5*24=120 on each axis.
  const draw = ctx.drawImage.mock.calls.filter(([source]) => source === image).at(-1);
  expect(draw?.slice(1)).toEqual([40, 40, 120, 120]);
});

// Adapter fact borderNeighbours "scoped": a hidden indoor map still blocks a border side (old GbcWorldCanvas.tsx:729-745).
// GBC band 2: MapA (0,0,10,10)'s left band (-2,0,2,10) overlaps hidden Indoor (-2,0,2,10), so MapA takes top
// (band (0,-2,10,2), free). MapB's left is MapA -> top. Counting only drawn maps would give MapA "left".
it("a hidden indoor neighbour still blocks a border side", async () => {
  const world: GbcWorldPayload = {
    ...WORLD,
    placements: {
      MapA: WORLD.placements.MapA!,
      MapB: WORLD.placements.MapB!,
      Indoor: { map: "Indoor", x: -2, y: 0, width: 2, height: 10, component: 1, mapType: "INDOOR", manual: false },
    },
    components: [
      WORLD.components[0]!,
      { index: 1, maps: ["Indoor"], bounds: { x: -2, y: 0, width: 2, height: 10 } },
    ],
  };
  const sources = [{ method: "rock", chances: [{ species: "GEODUDE", percent: 45, minLevel: 5, maxLevel: 8 }] }];
  const host = await mount({}, world, undefined, { MapA: sources, MapB: sources });
  fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
  await settle();
  const strips = [...host.container.querySelectorAll(".encounter-border__strip")];
  expect(strips.map((s) => /--(left|top|right|bottom)$/.exec(s.className)![1])).toEqual(["top", "top"]);
});

// cacheKey = time (old GbcWorldCanvas.tsx:633-641): a time switch drops every cached tile, so a map draws nothing
// until its new-time image loads (one time's tiles at a time, the memory rationale), rather than keeping the old
// time's image on screen as a per-map refresh would (P12-7 retention).
it("a time switch drops the old time's tiles instead of keeping them on screen", async () => {
  const host = await mount();
  const day = FakeImage.instances.find((entry) => entry.src === "/api/render/MapA.png?time=day")!;
  await act(async () => day.onload?.());
  const ctx = ctxByCanvas.get(host.canvas)!;
  expect(ctx.drawImage.mock.calls.some(([source]) => source === day)).toBe(true);
  host.rerender(<GbcWorldCanvas time="nite" />);
  await settle();
  const nite = FakeImage.instances.find((entry) => entry.src === "/api/render/MapA.png?time=nite");
  expect(nite).toBeDefined();
  ctx.drawImage.mockClear();
  // Any redraw before the nite image loads must not paint the dropped day image.
  await act(async () => FakeImage.instances.find((entry) => entry.src === "/api/render/MapB.png?time=nite")?.onload?.());
  expect(ctx.drawImage.mock.calls.length).toBeGreaterThan(0);
  expect(ctx.drawImage.mock.calls.some(([source]) => source === day)).toBe(false);
  await act(async () => nite!.onload?.());
  expect(ctx.drawImage.mock.calls.some(([source]) => source === nite)).toBe(true);
});

// Adapter fact shiftClickSelects (old GbcWorldCanvas onClick had no modifier guard): a stationary Shift-click on
// MapA (screen (50,100), see mount) selects it; one on empty space (world y=(190-50)/10=14, below the 10-block
// cluster) clears the selection.
it("a stationary Shift-click selects a map and clears on empty space", async () => {
  const onSelectMap = vi.fn();
  const host = await mount({ onSelectMap });
  click(host, 50, 100, { shiftKey: true });
  expect(outlines(host)).toHaveLength(1);
  expect(onSelectMap).toHaveBeenCalledWith("MapA");
  click(host, 50, 190, { shiftKey: true });
  expect(outlines(host)).toHaveLength(0);
  expect(posts).toHaveLength(0);
});

// A jump stamped before the viewport is measured keeps its fit pending; a filter that excludes the map before the
// measurement drops it. Filter {MapA, MapB}: anchored in component 0, bounds (0,0)-(20,10), 200x200 viewport:
// zoom=min(200/20,200/10)=10 -> round(10/32*100)=31%. The stale Interior jump fit would be .6*min(200/5,200/5)=24
// -> round(24/32*100)=75%.
it("a pending jump fit is dropped when a filter excludes the map before the viewport is measured", async () => {
  let size = 0;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => size);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => size);
  vi.stubGlobal("fetch", mockFetchAll({ world: WORLD }));
  const host = render(<GbcWorldCanvas time="day" jumpToMap="Interior" jumpToken={1} />);
  await settle();
  expect(host.container.querySelector(".world-canvas__jump-highlight")).not.toBeNull();
  const filter = new Set(["MapA", "MapB"]);
  host.rerender(<GbcWorldCanvas time="day" jumpToMap="Interior" jumpToken={1} mapFilter={filter} />);
  await settle();
  size = VIEWPORT_SIZE;
  act(() => {
    for (const observer of FakeResizeObserver.instances) observer.fire();
  });
  await settle();
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("zoom 31%");
});
