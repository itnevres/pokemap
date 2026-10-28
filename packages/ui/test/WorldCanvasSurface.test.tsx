import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorldCanvas, type WorldCanvasProps } from "../src/components/WorldCanvas.js";
import type { MapView } from "../src/components/mapView.js";
import { conflictKey } from "@pokemap/core/src/world/conflictAcceptance.js";

// Copied from WorldCanvas.test.tsx: fixtures and fetch routes stay local to this real-wrapper suite.
interface RawPlacement {
  map: string;
  x: number;
  y: number;
  width: number;
  height: number;
  component: number;
  mapType?: string;
  manual?: boolean;
}
interface RawComponent {
  index: number;
  maps: string[];
  bounds: { x: number; y: number; width: number; height: number };
}
function makeWorld(opts: {
  placements: Record<string, RawPlacement>;
  components?: RawComponent[];
  conflicts?: Array<{ map: string; viaA: { from: string; x: number; y: number }; viaB: { from: string; x: number; y: number } }>;
  verticalLinks?: Array<{ from: string; to: string; direction: "dive" | "emerge" }>;
  dungeonAutoLayout?: boolean;
}) {
  return {
    placements: opts.placements,
    components: opts.components ?? Object.values(opts.placements).map((p, index) => ({
      index, maps: [p.map], bounds: { x: p.x, y: p.y, width: p.width, height: p.height },
    })),
    conflicts: (opts.conflicts ?? []).map((c) => ({ ...c, key: conflictKey(c), accepted: false })),
    verticalLinks: opts.verticalLinks ?? [],
    sidecar: { version: 1, dungeonAutoLayout: opts.dungeonAutoLayout ?? true,
      manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } },
  };
}
type WorldFixture = ReturnType<typeof makeWorld>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

// A/B form a cluster spanning (0,0)-(40,20). Near is visible only in the mount-default view, Far is shelved.
const fixture = () => makeWorld({
  placements: {
    A: { map: "A", x: 0, y: 0, width: 10, height: 10, component: 0 },
    B: { map: "B", x: 30, y: 10, width: 10, height: 10, component: 0 },
    Near: { map: "Near", x: 100, y: 50, width: 10, height: 10, component: 1 },
    Far: { map: "Far", x: 1000, y: 1000, width: 10, height: 10, component: 99 },
  },
  components: [
    { index: 0, maps: ["A", "B"], bounds: { x: 0, y: 0, width: 40, height: 20 } },
    { index: 1, maps: ["Near"], bounds: { x: 100, y: 50, width: 10, height: 10 } },
  ],
});

/** The world and every warp response are resolved by the test, never by a polling callback. */
function makeFetchMock(initial: WorldFixture) {
  const world = deferred<Response>();
  const warps: Array<{ map: string; outcome: ReturnType<typeof deferred<Response>> }> = [];
  const impl = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/world") return world.promise;
    if (url.startsWith("/api/warps/")) {
      const outcome = deferred<Response>();
      warps.push({ map: decodeURIComponent(url.slice("/api/warps/".length)), outcome });
      return outcome.promise;
    }
    if (url.startsWith("/api/world/placement")) {
      const body = JSON.parse(String(init?.body)) as { map: string; x: number; y: number };
      const previous = initial.placements[body.map];
      initial.placements[body.map] = { ...previous!, ...body };
      return Promise.resolve(response({ ok: true }));
    }
    if (url === "/api/world/dungeons") return Promise.resolve(response({ ok: true }));
    if (url === "/api/coverage") return Promise.resolve(response({
      mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [],
      byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 },
    }));
    if (url === "/api/species") return Promise.resolve(response([]));
    if (url.startsWith("/api/encounters/")) return Promise.resolve(response({
      mapName: decodeURIComponent(url.slice("/api/encounters/".length)), mapId: 1, methods: [],
    }));
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  return { impl, world, warps, initial };
}
class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
  }
}
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
let width = 200;
let height = 100;
let draws: Array<{ image: unknown; rect: unknown[] }>;
let fills: string[];
beforeEach(() => {
  width = 200;
  height = 100;
  draws = [];
  fills = [];
  FakeImage.instances = [];
  FakeResizeObserver.instances = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const stage = this.classList.contains("world-canvas__stage");
    const ctx = {
      canvas: this, imageSmoothingEnabled: true, fillStyle: "",
      clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillText: vi.fn(),
      drawImage: (image: unknown, ...rect: unknown[]) => {
        if (stage) draws.push({ image, rect });
      },
      fill: () => {
        if (stage) fills.push(ctx.fillStyle);
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  } as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function settle() {
  for (let step = 0; step < 12; step++) await act(async () => { await Promise.resolve(); });
}
const stageOf = (host: { container: HTMLElement }) => host.container.querySelector<HTMLCanvasElement>("canvas.world-canvas__stage")!;
const imageFor = (map: string) => FakeImage.instances.find((image) => image.src === `/api/render/${map}.png`);
const readout = (host: { container: HTMLElement }) => host.container.querySelector(".world-canvas__zoom-readout")!.textContent;
const jumpBox = (host: { container: HTMLElement }) => {
  const node = host.container.querySelector<HTMLElement>(".world-canvas__jump-highlight")!;
  return [node.style.left, node.style.top, node.style.width, node.style.height].map(parseFloat);
};
async function mount(props: WorldCanvasProps = {}, initial = fixture()) {
  const fetches = makeFetchMock(initial);
  vi.stubGlobal("fetch", fetches.impl);
  const host = render(<WorldCanvas {...props} />);
  fetches.world.resolve(response(initial));
  await settle();
  return { ...host, fetches };
}
async function finishWarps(fetches: ReturnType<typeof makeFetchMock>, entries: Record<string, unknown[]> = {}) {
  for (const request of fetches.warps) request.outcome.resolve(response({ mapName: request.map, warps: entries[request.map] ?? [] }));
  await settle();
}

it("P12-4c: double-click without Edit-here opens Map view", async () => {
  const open = vi.fn();
  const host = await mount({ onOpenMap: open });
  // (5,5) is inside A both before fit (0..10) and after fit (0..50); failure is the missing fallback.
  fireEvent.doubleClick(stageOf(host), { clientX: 5, clientY: 5 });
  expect(open).toHaveBeenCalledWith("A");
});

it("P12-4d: a rejected warp request shows the warp alert", async () => {
  const host = await mount();
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  // One explicit failure for A, all other in-flight responses are empty successes.
  expect(host.fetches.warps.some((request) => request.map === "A")).toBe(true);
  for (const request of host.fetches.warps) {
    if (request.map === "A") request.outcome.reject(new Error("warp offline"));
    else request.outcome.resolve(response({ mapName: request.map, warps: [] }));
  }
  await settle();
  expect(screen.getByRole("alert").textContent).toContain("Warp data unavailable: warp offline");
});

it("P12-4e: first load fits clusters with hand-derived pan and never requests a pre-fit-only tile", async () => {
  const fetches = makeFetchMock(fixture());
  vi.stubGlobal("fetch", fetches.impl);
  const host = render(
    <StrictMode>
      <WorldCanvas />
    </StrictMode>,
  );
  expect(FakeImage.instances).toHaveLength(0);
  fetches.world.resolve(response(fetches.initial));
  await settle();
  // Cluster union (0,0)-(40,20); z=min(200/40,100/20)=5, pan=(0,0); singleton Near is excluded.
  // Near at (100,50) would be fetched at mount z1/pan0, but lies outside fitted world window [0,40)x[0,20).
  expect(imageFor("Near")).toBeUndefined();
  expect(imageFor("Far")).toBeUndefined();
  expect(readout(host)).toBe("31%"); // round(5/16*100)=31.
  await act(async () => imageFor("B")!.onload?.());
  // B at world(30,10,10,10) -> screen(150,50,50,50) under z5/pan0.
  expect(draws.filter((draw) => draw.image === imageFor("B")).at(-1)?.rect).toEqual([150, 50, 50, 50]);
});

it("P12-4e: no tile is requested while the world is loaded but its viewport has not been measured", async () => {
  width = 0;
  height = 0;
  const host = await mount();
  expect(screen.queryByText("Loading world…")).toBeNull();
  expect(FakeImage.instances).toHaveLength(0);
  width = 200;
  height = 100;
  act(() => {
    for (const observer of FakeResizeObserver.instances) observer.callback([], observer as unknown as ResizeObserver);
  });
  await settle();
  // Measured 200x100 / cluster40x20 => z5, hence 31%.
  expect(readout(host)).toBe("31%");
  expect(imageFor("A")).toBeTruthy();
  expect(imageFor("Near")).toBeUndefined();
});

it("P12-4m: both families preserve GBA's full limiting-dimension jump fill", async () => {
  const host = await mount({ jumpToMap: "B", jumpToken: 1 });
  // B10x10: z=min(200/10,100/10)=10; centre(35,15), pan=(100-350,50-150)=(-250,-100).
  // Origin(30,10) ->(50,0), size100x100, zoom round(10/16*100)=63%.
  expect(jumpBox(host)).toEqual([50, 0, 100, 100]);
  expect(readout(host)).toBe("63%");
});

it("P12-4n: Enter opens the selected map and plus/minus aliases zoom about the viewport centre", async () => {
  const open = vi.fn();
  const host = await mount({ onOpenMap: open });
  fireEvent.click(stageOf(host), { clientX: 5, clientY: 5 });
  fireEvent.keyDown(stageOf(host), { key: "Enter" });
  expect(open).toHaveBeenCalledWith("A");
  fireEvent.keyDown(stageOf(host), { key: "+" });
  // z5*1.2=6; pivot world(20,10) -> pan=(-20,-10), A rect=(-20,-10,60,60); round(6/16*100)=38.
  expect(readout(host)).toBe("38%");
  const outline = host.container.querySelector<HTMLElement>('[data-map="A"]')!;
  expect([outline.style.left, outline.style.top, outline.style.width, outline.style.height])
    .toEqual(["-20px", "-10px", "60px", "60px"]);
  fireEvent.keyDown(stageOf(host), { key: "-" });
  expect(readout(host)).toBe("31%"); // 6/1.2=5 ->31%.
  fireEvent.keyDown(stageOf(host), { key: "=" });
  expect(readout(host)).toBe("38%");
  fireEvent.keyDown(stageOf(host), { key: "_" });
  expect(readout(host)).toBe("31%");
});

it("P12-4n: context plus/minus step the Map zoom instead of continuous world zoom", async () => {
  const views: MapView[] = [];
  const host = await mount({ context: {
    map: "A", origin: { x: 0, y: 0 }, onExitRequest: vi.fn(),
    renderCanvas: (view) => {
      views.push(view);
      return null;
    },
  } });
  expect(views.at(-1)!.zoom).toBe(1); // Context snaps to native:16px/tile /16=1.
  fireEvent.keyDown(stageOf(host), { key: "+" });
  expect(views.at(-1)!.zoom).toBe(2); // First stepped level after 1 is 2 (32px/tile).
  fireEvent.keyDown(stageOf(host), { key: "-" });
  expect(views.at(-1)!.zoom).toBe(1);
});

it("P12-4o: clicking a visible warp marker selects nothing", async () => {
  const selected = vi.fn();
  const host = await mount({ onSelectMap: selected });
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  // Old GBA starts at z1; eight wheel-ins give 1.2^8=4.29981696, enough to show its markers too.
  // On the new source zoom clamps at16. Reading the actual marker below locates the input, not an expected output.
  for (let step = 0; step < 8; step++) fireEvent.wheel(stageOf(host), { deltaY: -1, clientX: 0, clientY: 0 });
  await settle();
  await finishWarps(host.fetches, { A: [{ x: 2, y: 3, elevation: 0, destWarpId: "0", destMap: "MAP_B", destMapName: "B" }] });
  const marker = host.container.querySelector<HTMLElement>(".world-canvas__warp-marker")!;
  expect(marker).not.toBeNull();
  fireEvent.click(stageOf(host), { clientX: parseFloat(marker.style.left), clientY: parseFloat(marker.style.top) });
  expect(selected).not.toHaveBeenCalled();
  expect(host.container.querySelector('[data-map="A"]')).toBeNull();
});

it("P12-4p: same-map re-jump mounts a new highlight and restarts its full fade lifetime", async () => {
  vi.useFakeTimers();
  const host = await mount({ jumpToMap: "B", jumpToken: 1 });
  const first = host.container.querySelector(".world-canvas__jump-highlight");
  expect(first).not.toBeNull();
  act(() => vi.advanceTimersByTime(1500));
  host.rerender(<WorldCanvas jumpToMap="B" jumpToken={2} />);
  const second = host.container.querySelector(".world-canvas__jump-highlight");
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  // t2001 is after the old t2000 expiry, but before the re-jump expiry at1500+2000=3500.
  act(() => vi.advanceTimersByTime(501));
  expect(host.container.querySelector(".world-canvas__jump-highlight")).toBe(second);
  act(() => vi.advanceTimersByTime(1499));
  expect(host.container.querySelector(".world-canvas__jump-highlight")).toBeNull();
});

it("P12-4r: lines fetch an offscreen shelved filter member and resolve its exact destWarpId endpoint", async () => {
  const host = await mount({ mapFilter: new Set(["Far", "A", "B"]) });
  expect(imageFor("Far")).toBeUndefined();
  fireEvent.click(screen.getByRole("switch", { name: "Connection lines" }));
  await settle();
  expect(host.fetches.warps.map((request) => request.map).sort()).toEqual(["A", "B", "Far"]);
  await finishWarps(host.fetches, {
    A: [{ x: 2, y: 3, elevation: 0, destMap: "MAP_FAR", destMapName: "Far", destWarpId: "1" }],
    Far: [
      { x: 0, y: 0, elevation: 0, destMap: "MAP_NONE", destWarpId: "0" },
      { x: 4, y: 5, elevation: 0, destMap: "MAP_NONE", destWarpId: "0" },
    ],
  });
  // Anchored A/B fit z5/pan0. A+(2,3)->(10,15); Far+(4,5)=(1004,1005)->(5020,5025).
  // destWarpId1 must choose the second warp, never index0 or the destination corner.
  const line = host.container.querySelector(".world-canvas__connections line")!;
  expect(line).not.toBeNull();
  expect(["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)))).toEqual([10, 15, 5020, 5025]);
  expect(imageFor("Far")).toBeUndefined();
});

it("P12-4r: marker fetching requires Warps and the LOD threshold, while lines fetch every filter member", async () => {
  const world = fixture();
  // A/B cluster extends to x100: fit z=min(200/100,100/20)=2 <16*.25=4.
  world.placements.B!.x = 90;
  world.components[0]!.bounds.width = 100;
  const host = await mount({}, world);
  expect(host.fetches.warps).toHaveLength(0);
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  expect(host.fetches.warps).toHaveLength(0);
  // Four wheel-ins from2 reach 2*1.2^4=4.1472 >=4, centred at0 keeps A visible.
  for (let step = 0; step < 4; step++) fireEvent.wheel(stageOf(host), { deltaY: -1, clientX: 0, clientY: 0 });
  await settle();
  expect(host.fetches.warps.map((request) => request.map)).toEqual(["A"]);
  await finishWarps(host.fetches);
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  // Near at(100,50), previously outside fitted view. Jumping while markers are off must not fetch its warps.
  host.rerender(<WorldCanvas jumpToMap="Near" jumpToken={1} />);
  await settle();
  expect(host.fetches.warps.map((request) => request.map)).toEqual(["A"]);
  // Filter A/B/Far fits anchored100x20 atz2 again; lines still fetch offscreen Far and B below LOD.
  host.rerender(<WorldCanvas mapFilter={new Set(["A", "B", "Far"])} />);
  fireEvent.click(screen.getByRole("switch", { name: "Connection lines" }));
  await settle();
  expect(host.fetches.warps.map((request) => request.map).sort()).toEqual(["A", "B", "Far"]);
});

it("P12-4s: failed warp data retries on the next view change without a render retry loop", async () => {
  const host = await mount();
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  for (const request of host.fetches.warps) {
    if (request.map === "A") request.outcome.reject(new Error("try later"));
    else request.outcome.resolve(response({ mapName: request.map, warps: [] }));
  }
  await settle();
  // Only A failed: the error render and twelve bounded microtask flushes must not retry it themselves.
  expect(host.fetches.warps.filter((request) => request.map === "A")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain("try later");
  fireEvent.mouseDown(stageOf(host), { button: 0, clientX: 5, clientY: 5 });
  fireEvent.mouseMove(stageOf(host), { clientX: 6, clientY: 5 });
  fireEvent.mouseUp(stageOf(host));
  await settle();
  // Pan by1px retains A in view; the failed entry was evicted, so there is now a second A request.
  expect(host.fetches.warps.filter((request) => request.map === "A")).toHaveLength(2);
  host.fetches.warps.filter((request) => request.map === "A")[1]!.outcome.resolve(response({ mapName: "A", warps: [] }));
  await settle();
});

it("P12-4j: in context wheel-in at sixteen pixels per tile reaches nineteen point two", async () => {
  const host = await mount({ context: {
    map: "A", origin: { x: 0, y: 0 }, renderCanvas: () => null, onExitRequest: vi.fn(),
  } });
  expect(readout(host)).toBe("100%"); // Native context snap is16px/tile.
  fireEvent.wheel(stageOf(host), { deltaY: -1, clientX: 100, clientY: 50 });
  //16*1.2=19.2,19.2/16*100=120%; old cap16 would stay100%.
  expect(readout(host)).toBe("120%");
  const image = imageFor("A")!;
  await act(async () => image.onload?.());
  // Centre A(5,5) stays at(100,50): pan=(4,-46); A0,0 ->(4,-46), extent10*19.2=192.
  expect(draws.filter((draw) => draw.image === image).at(-1)?.rect).toEqual([4, -46, 192, 192]);
});
