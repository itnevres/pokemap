import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import type { EncounterBorderProps } from "../../src/shared/EncounterBorder.js";
import { useStage } from "../../src/canvas/useStage.js";
import { WorldSurface } from "../../src/canvas/WorldSurface.js";
import type { SurfacePlacement, SurfaceWorld, WorldSurfaceAdapter } from "../../src/canvas/worldSurfaceAdapter.js";

const observations = vi.hoisted(() => ({ border: [] as unknown[] }));
vi.mock("../../src/shared/EncounterBorder.js", () => ({ EncounterBorder: (props: unknown) => {
  observations.border.push(props);
  return null;
} }));

it("clamps continuous zoom against the current view", () => {
  let stage!: ReturnType<typeof useStage>;
  function Host() {
    stage = useStage({ zoomPolicy: { kind: "continuous", min: 0.1, max: 10, factor: 1.2,
      boundsFor: (current: number) => ({ min: 0.1, max: Math.max(2, current) }) },
      mapName: "world", imgLoaded: false, pixelWidth: 0, pixelHeight: 0, bandNative: 0, side: "right" });
    return <canvas ref={stage.canvasRef} data-testid="canvas" />;
  }
  render(<Host />);
  // Starting at 3, the cap is 3: 3*1.2 clamps to 3, then 3/1.2 = 2.5.
  act(() => stage.updateView({ zoom: 3, pan: { x: 0, y: 0 } }));
  fireEvent.wheel(screen.getByTestId("canvas"), { deltaY: -1 });
  expect(stage.view.zoom).toBe(3);
  fireEvent.wheel(screen.getByTestId("canvas"), { deltaY: 1 });
  expect(stage.view.zoom).toBe(2.5);
});

// Viewport 200x100 (clientWidth/clientHeight mocks). Clusters: A,B (component 0) and C,D (component 1).
// Far, Near and Hidden are singletons; Shelf belongs to no listed component; "Unplaced" is a singleton with no placement.
// Near sits inside the mount-default view (zoom 1, pan 0 covers world [0,200)x[0,100)) but outside the cluster fit.
const placements: SurfacePlacement[] = [
  { map: "A", x: 10, y: 10, width: 10, height: 10, component: 0 },
  { map: "B", x: 20, y: 10, width: 10, height: 10, component: 0 },
  { map: "C", x: 30, y: 20, width: 10, height: 10, component: 1 },
  { map: "D", x: 40, y: 20, width: 10, height: 10, component: 1 },
  { map: "Far", x: 1000, y: 1000, width: 10, height: 10, component: 2 },
  { map: "Hidden", x: 10, y: 10, width: 5, height: 5, component: 3 },
  { map: "Shelf", x: 2000, y: 2000, width: 10, height: 10, component: 99 },
  { map: "Near", x: 100, y: 50, width: 10, height: 10, component: 5 },
];
const component = (index: number, maps: string[]) => ({ index, maps, bounds: { x: 0, y: 0, width: 10, height: 10 } });
const conflict: WireConflict = { map: "A", viaA: { from: "B", x: 0, y: 0 }, viaB: { from: "C", x: 1, y: 1 }, key: "a", accepted: false };
const world: SurfaceWorld<SurfacePlacement, WireConflict> = {
  placements: new Map(placements.map((p) => [p.map, p])),
  components: [component(0, ["A", "B"]), component(1, ["C", "D"]), component(2, ["Far"]), component(3, ["Hidden"]),
    component(4, ["Unplaced"]), component(5, ["Near"])],
  conflicts: [conflict],
  dungeonAutoLayout: true,
};
let data: typeof world | null;
let loadError: string | null;
/** Calls on the stage canvas's context only (buildSmallTile's offscreen canvases are not recorded). */
let log: Array<{ name: string; args: unknown[] }>;
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  src = "";
  constructor() {
    FakeImage.instances.push(this);
  }
}
const record = (name: string) => (...args: unknown[]) => {
  log.push({ name, args });
};
let adapter: WorldSurfaceAdapter<SurfacePlacement, WireConflict>;
beforeEach(() => {
  data = world;
  loadError = null;
  log = [];
  observations.border = [];
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const stage = this.classList.contains("world-canvas__stage");
    const rec = (name: string) => (stage ? record(name) : () => {});
    return {
      clearRect: rec("clear"), drawImage: rec("tile"), beginPath: rec("badge"), moveTo: rec("moveTo"),
      lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  } as never);
  adapter = {
    nativePx: 16,
    useWorld: () => ({ world: data, error: loadError, reload: () => 1, loadedGen: 1, dismissError: () => {}, move: () => {} }),
    imageUrl: (p, v) => `/t/${p.map}?v=${v ?? 0}`,
    cacheKey: 0,
    drawnByDefault: (p) => p.map !== "Hidden",
    drawExtraLayers: () => record("extra")(),
    conflictTooltip: () => "conflict",
    fetchEncounters: async () => ({ summaries: [], methodTint: null }),
    border: { band: 1 },
    useCoverage: () => ({ coverage: null, error: null, levelByMap: [], emptyMapNames: new Set() }),
    lensLegend: {},
    canvasLabel: "World map",
    statusItems: (s) => <span>{s.zoomPercent}% hidden {s.hiddenCount} unplaced {s.unplacedCount}</span>,
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const imageFor = (map: string) => FakeImage.instances.find((i) => i.src.startsWith(`/t/${map}?`));
async function loadImages() {
  await act(async () => {
    for (const image of [...FakeImage.instances]) image.onload?.();
  });
}
const lastDraw = (map: string) => log.filter((c) => c.name === "tile" && c.args[0] === imageFor(map)).at(-1)?.args.slice(1);
const stageOf = (host: { container: HTMLElement }) => host.container.querySelector("canvas.world-canvas__stage")!;
const jumpBox = (host: { container: HTMLElement }) => {
  const node = host.container.querySelector<HTMLElement>(".world-canvas__jump-highlight")!;
  return [node.style.left, node.style.top, node.style.width, node.style.height].map(parseFloat);
};

it("shows load and error placeholders", () => {
  data = null;
  loadError = "boom";
  const host = render(<WorldSurface adapter={adapter} />);
  expect(screen.getByText("Could not load the world: boom")).toBeTruthy();
  loadError = null;
  host.rerender(<WorldSurface adapter={adapter} />);
  expect(screen.getByText("Loading world…")).toBeTruthy();
  data = world;
  host.rerender(<WorldSurface adapter={adapter} />);
  expect(screen.queryByText("Loading world…")).toBeNull();
});

it("fits clusters under StrictMode, culls distant and hidden maps, and reports counts", async () => {
  data = null;
  const host = render(<StrictMode><WorldSurface adapter={adapter} /></StrictMode>);
  expect(FakeImage.instances).toHaveLength(0);
  expect(log.some((c) => c.name === "tile")).toBe(false);
  data = world;
  host.rerender(<StrictMode><WorldSurface adapter={adapter} /></StrictMode>);
  // Cluster bounds (10,10)-(50,30): min(200/40,100/20)=5; pan (-50,-50).
  expect(imageFor("A")).toBeTruthy();
  expect(imageFor("Far")).toBeUndefined();
  expect(imageFor("Hidden")).toBeUndefined();
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("31% hidden 1 unplaced 1");
  await loadImages();
  const draw = log.filter((c) => c.name === "tile" && c.args[0] === imageFor("A")).at(-1)!;
  expect(draw.args.slice(1)).toEqual([0, 0, 50, 50]);
  const extra = log.findLastIndex((c) => c.name === "extra");
  const badge = log.findIndex((c, i) => i > extra && c.name === "badge");
  const tile = log.findLastIndex((c, i) => i < extra && c.name === "tile");
  expect(tile).toBeGreaterThanOrEqual(0);
  expect(badge).toBeGreaterThan(extra);
});

it("with the world present at mount under StrictMode, requests nothing from the pre-fit view and pans once", async () => {
  render(<StrictMode><WorldSurface adapter={adapter} /></StrictMode>);
  // Near (100..110, 50..60) is inside the mount-default view [0,200)x[0,100) but outside the fit's world window
  // x [50/5, (200+50)/5) = [10,50), y [10, 30): requesting it would mean a pre-fit view was culled.
  expect(imageFor("Near")).toBeUndefined();
  expect(imageFor("A")).toBeTruthy();
  await loadImages();
  expect(imageFor("Near")).toBeUndefined();
  // Fit zoom 5, pan (-50,-50) applied once: A (10,10,10,10) lands at (10*5-50, 10*5-50, 50, 50). A doubled pan
  // (-100,-100) would put it at (-50,-50).
  expect(lastDraw("A")).toEqual([0, 0, 50, 50]);
  // Every stage draw of A came from the fitted view.
  for (const c of log.filter((e) => e.name === "tile" && e.args[0] === imageFor("A"))) expect(c.args.slice(1)).toEqual([0, 0, 50, 50]);
});

it("culls a placement that is off-screen after the fit and a hidden-by-default one", async () => {
  render(<WorldSurface adapter={adapter} />);
  await loadImages();
  // Fit window x [10,50), y [10,30): Far (1000,1000) and Near (100,50) are outside it; Hidden (10,10) is inside
  // but not drawn by default.
  expect(FakeImage.instances.map((i) => i.src).sort()).toEqual(["/t/A?v=0", "/t/B?v=0", "/t/C?v=0", "/t/D?v=0"]);
});

it("passes hand-derived zoomPercent, hiddenCount and unplacedCount to the status items", () => {
  const host = render(<WorldSurface adapter={adapter} />);
  // zoom 5 / 16 * 100 = 31.25 -> 31; hidden: only Hidden (not drawn by default); unplaced: "Unplaced" (a
  // singleton component with no placement) -> 1.
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toBe("31% hidden 1 unplaced 1");
});

it("draws tiles, then the extra layers, then the first badge path, in one redraw", async () => {
  const host = render(<WorldSurface adapter={adapter} />);
  await loadImages();
  log = [];
  // One redraw: wheel in at (100,50) from zoom 5, pan (-50,-50) -> zoom 6.
  fireEvent.wheel(stageOf(host), { deltaY: -1, clientX: 100, clientY: 50 });
  const end = log.findIndex((c, i) => i > 0 && c.name === "clear");
  const redraw = end < 0 ? log : log.slice(0, end);
  const names = redraw.map((c) => c.name);
  expect(names[0]).toBe("clear");
  const tile = names.indexOf("tile");
  const extra = names.indexOf("extra");
  const badge = names.indexOf("badge");
  expect(tile).toBeGreaterThan(0);
  expect(extra).toBeGreaterThan(names.lastIndexOf("tile"));
  expect(badge).toBeGreaterThan(extra);
  // Zoom 6: pivot source ((100+50)/5, (50+50)/5) = (30,20); pan (100-30*6, 50-20*6) = (-80,-70). A's badge
  // centre: x 10*6-80 + 10*6 - 10 = 30, y 10*6-70 + 10 = 0; the diamond starts at (cx, cy - 10) = (30, -10).
  expect(redraw[badge + 1]).toEqual({ name: "moveTo", args: [30, -10] });
});

it("fits clusters manually after a wheel", async () => {
  const host = render(<WorldSurface adapter={adapter} />);
  await loadImages();
  fireEvent.wheel(stageOf(host), { deltaY: -1, clientX: 100, clientY: 50 });
  expect(lastDraw("A")).not.toEqual([0, 0, 50, 50]);
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  // Cluster fit again: zoom 5, pan (-50,-50); A at (0,0,50,50).
  expect(lastDraw("A")).toEqual([0, 0, 50, 50]);
  expect(host.container.querySelector(".world-canvas__zoom-readout")?.textContent).toBe("31%");
});

it("fits manually, fits anchored filter members and waits to jump outside the filter", async () => {
  const filter = new Set(["A", "Shelf"]);
  const host = render(<WorldSurface adapter={adapter} mapFilter={filter} jumpToMap="B" jumpToken={1} />);
  // Only anchored A is fitted: zoom 10, pan (-50,-100); shelved member is ignored.
  await loadImages();
  expect(log.filter((c) => c.name === "tile" && c.args[0] === imageFor("A")).at(-1)?.args.slice(1)).toEqual([50, 0, 100, 100]);
  expect(host.container.querySelector(".world-canvas__jump-highlight")).toBeNull();
  host.rerender(<WorldSurface adapter={adapter} mapFilter={new Set(["A", "B"])} jumpToMap="B" jumpToken={1} />);
  // Jump B: min(200/10,100/10)*0.6=6; pan (100-25*6,50-15*6)=(-50,-40).
  const node = host.container.querySelector<HTMLElement>(".world-canvas__jump-highlight")!;
  expect([node.style.left, node.style.top, node.style.width, node.style.height]).toEqual(["70px", "20px", "60px", "60px"]);
  host.rerender(<WorldSurface adapter={adapter} mapFilter={new Set(["A", "B"])} jumpToMap="B" jumpToken={2} />);
  expect(host.container.querySelector(".world-canvas__jump-highlight")).not.toBe(node);
  await loadImages();
  fireEvent.wheel(stageOf(host), { deltaY: -1 });
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  // A..B bounds 20x10: 200/20 = 100/10 = 10, pan (-100,-100).
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("63%");
  // A (10,10,10,10) at (10*10-100, 10*10-100, 100, 100).
  expect(lastDraw("A")).toEqual([0, 0, 100, 100]);
});

it("jump-fits at 60% with exact zoom and pan", async () => {
  const host = render(<WorldSurface adapter={adapter} jumpToMap="B" jumpToken={1} />);
  await loadImages();
  // B (20,10,10,10): raw min(200/10, 100/10) = 10, x0.6 = 6 -> 6/16*100 = 37.5 -> 38%.
  // Centre (25,15): pan (100-25*6, 50-15*6) = (-50,-40). B at (20*6-50, 10*6-40, 60, 60) = (70,20,60,60).
  expect(host.container.querySelector(".world-canvas__zoom-readout")?.textContent).toBe("38%");
  expect(lastDraw("B")).toEqual([70, 20, 60, 60]);
  expect(jumpBox(host)).toEqual([70, 20, 60, 60]);
  // A (10,10) at (10*6-50, 10*6-40) = (10,20).
  expect(lastDraw("A")).toEqual([10, 20, 60, 60]);
});

it("renders a new highlight node when the same map is re-jumped with a new token", () => {
  const host = render(<WorldSurface adapter={adapter} jumpToMap="B" jumpToken={1} />);
  const first = host.container.querySelector(".world-canvas__jump-highlight");
  expect(first).not.toBeNull();
  host.rerender(<WorldSurface adapter={adapter} jumpToMap="B" jumpToken={2} />);
  const second = host.container.querySelector(".world-canvas__jump-highlight");
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
});

it("lands an initial jump on a hidden map at its own fit, not the cluster fit", () => {
  const host = render(<WorldSurface adapter={adapter} jumpToMap="Hidden" jumpToken={1} />);
  // Hidden (10,10,5,5): raw min(200/5, 100/5) = 20, x0.6 = 12; centre (12.5,12.5) -> pan (100-150, 50-150) =
  // (-50,-100); rect (10*12-50, 10*12-100, 60, 60) = (70,20,60,60). The cluster fit would give (0,0,25,25).
  expect(jumpBox(host)).toEqual([70, 20, 60, 60]);
  expect(imageFor("Hidden")).toBeTruthy();
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toBe("75% hidden 0 unplaced 1");
});

it("projects the jump outline onto the drawImage rect after a wheel zoom and after a re-jump's pan", async () => {
  const host = render(<WorldSurface adapter={adapter} jumpToMap="B" jumpToken={1} />);
  await loadImages();
  // From zoom 6, pan (-50,-40), wheel in at (100,50): source (150/6, 90/6) = (25,15); zoom 7.2; pan (100-25*7.2,
  // 50-15*7.2) = (-80,-58). B at (20*7.2-80, 10*7.2-58, 72, 72) = (64,14,72,72).
  fireEvent.wheel(stageOf(host), { deltaY: -1, clientX: 100, clientY: 50 });
  const zoomed = lastDraw("B")!;
  expect(jumpBox(host)).toEqual(zoomed);
  [64, 14, 72, 72].forEach((n, i) => expect(zoomed[i]).toBeCloseTo(n, 9));
  // Pan: jump to D (40,20,10,10): zoom 6, centre (45,25) -> pan (100-270, 50-150) = (-170,-100); then wheel out at
  // (100,50): source (270/6, 150/6) = (45,25); zoom 5; pan (100-225, 50-125) = (-125,-75).
  // D at (40*5-125, 20*5-75, 50, 50) = (75,25,50,50).
  host.rerender(<WorldSurface adapter={adapter} jumpToMap="D" jumpToken={2} />);
  await loadImages();
  fireEvent.wheel(stageOf(host), { deltaY: 1, clientX: 100, clientY: 50 });
  const panned = lastDraw("D")!;
  expect(jumpBox(host)).toEqual(panned);
  [75, 25, 50, 50].forEach((n, i) => expect(panned[i]).toBeCloseTo(n, 9));
});

it("hands the border [] for a map whose encounter fetch failed and undefined for one still loading", async () => {
  adapter.fetchEncounters = (map) => (map === "A" ? Promise.reject(new Error("down")) : new Promise(() => {}));
  const host = render(<WorldSurface adapter={adapter} />);
  await act(async () => {});
  const entries = (observations.border.at(-1) as EncounterBorderProps).entries;
  expect(entries.find((e) => e.map === "A")?.summaries).toEqual([]);
  expect(entries.find((e) => e.map === "B")?.summaries).toBeUndefined();
  expect(host.container.querySelector(".world-canvas__toolbar-error")?.textContent).toBe("Encounter data unavailable for 1 map");
});

it("reveals a hidden jump, shares projection, and retains the previous image until replacement loads", async () => {
  const host = render(<WorldSurface adapter={adapter} jumpToMap="Hidden" jumpToken={1} />);
  expect(imageFor("Hidden")).toBeTruthy();
  await loadImages();
  const stage = host.container.querySelector("canvas.world-canvas__stage")!;
  fireEvent.wheel(stage, { deltaY: 1, clientX: 70, clientY: 30 });
  const outline = host.container.querySelector<HTMLElement>(".world-canvas__jump-highlight")!;
  const draw = log.filter((c) => c.name === "tile" && c.args[0] === imageFor("Hidden")).at(-1)!;
  expect([outline.style.left, outline.style.top, outline.style.width, outline.style.height].map(parseFloat)).toEqual(draw.args.slice(1));
  const old = imageFor("Hidden")!;
  host.rerender(<WorldSurface adapter={adapter} jumpToMap="Hidden" jumpToken={1} tileVersions={{ Hidden: 2 }} />);
  const next = FakeImage.instances.find((i) => i.src === "/t/Hidden?v=2")!;
  expect(next).toBeTruthy();
  // The version bump alone triggers no redraw, so force one: it must still draw the old image.
  const before = log.length;
  fireEvent.wheel(stage, { deltaY: -1, clientX: 70, clientY: 30 });
  expect(log.slice(before).some((c) => c.name === "tile" && c.args[0] === old)).toBe(true);
  await act(async () => next.onload?.());
  expect(log.filter((c) => c.name === "tile").at(-1)?.args[0]).toBe(next);
});

it("fits the clusters once a filter with nothing to fit clears", async () => {
  // {Unplaced} has no placement, so the filter fit finds no bounds and nothing is fitted or drawn.
  const host = render(<WorldSurface adapter={adapter} mapFilter={new Set(["Unplaced"])} />);
  expect(FakeImage.instances).toHaveLength(0);
  host.rerender(<WorldSurface adapter={adapter} mapFilter={null} />);
  await loadImages();
  // Cluster fit: zoom 5, pan (-50,-50); A at (0,0,50,50).
  expect(lastDraw("A")).toEqual([0, 0, 50, 50]);
});
