import { Suspense, startTransition, useCallback, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import { WorldSurface, type WorldSurfaceProps } from "../../src/canvas/WorldSurface.js";
import type { PlacementLedger } from "../../src/shared/placementLedger.js";
import type { SurfacePlacement, SurfaceWarp, SurfaceWorld, WorldSurfaceAdapter } from "../../src/canvas/worldSurfaceAdapter.js";

const lateState = vi.hoisted(() => ({ active: false, writes: vi.fn() }));

// React silently ignores setters after unmount. Observe their invocation as well as DOM and console output.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <S,>(initial?: S | (() => S)) => {
      const [value, setValue] = actual.useState(initial);
      const tracked = actual.useCallback((next: import("react").SetStateAction<S | undefined>) => {
        if (lateState.active) lateState.writes();
        setValue(next);
      }, [setValue]);
      return [value, tracked];
    },
  };
});

type World = SurfaceWorld<SurfacePlacement, WireConflict>;
type Adapter = WorldSurfaceAdapter<SurfacePlacement, WireConflict>;
type Props = Omit<WorldSurfaceProps<SurfacePlacement, WireConflict>, "adapter">;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Copied fixture, not imported from another test. Viewport 200x100, cluster bounds (10,10)-(50,30).
// Fit zoom min(200/40,100/20)=5, pan (-50,-50). A/B rects are (0,0,50,50)/(50,0,50,50),
// C/D rects are (100,50,50,50)/(150,50,50,50). Hidden overlaps A but is hidden by the adapter.
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
const component = (index: number, maps: string[]) => ({
  index, maps, bounds: { x: 0, y: 0, width: 10, height: 10 },
});
const fixture: World = {
  placements: new Map(placements.map((p) => [p.map, p])),
  components: [component(0, ["A", "B"]), component(1, ["C", "D"]), component(2, ["Far"]),
    component(3, ["Hidden"]), component(4, ["Unplaced"]), component(5, ["Near"])],
  conflicts: [],
  dungeonAutoLayout: true,
};

let adapter: Adapter;
let initialWorld: World;
let server: World;
let ledger: PlacementLedger;
let readWorld: () => World;
let reloadSpy: ReturnType<typeof vi.fn>;
let reloadError: string | null;
let publishError: (error: string | null) => void;
let reloadWorld: () => number;
let posts: Array<{ map: string; x: number; y: number; outcome: ReturnType<typeof deferred<void>> }>;
let reloads: Array<{ snapshot: ReturnType<PlacementLedger["snapshot"]>; finish(): void }>;
let callbacks: { select: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; saved: ReturnType<typeof vi.fn> };
let draws: Array<{ map: string; rect: number[] }>;
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  src = "";
  constructor() {
    FakeImage.instances.push(this);
  }
}

// This fake owns reconciliation, exactly at the world-hook boundary. reloadSpy counts hook calls rather than GETs.
function useFakeWorld(activeLedger: PlacementLedger) {
  ledger = activeLedger;
  const [world, setWorld] = useState(initialWorld);
  const [error, setError] = useState(reloadError);
  const [loadedGen, setLoadedGen] = useState(1);
  const generation = useRef(1);
  readWorld = () => world;
  publishError = setError;
  const move = useCallback((positions: ReadonlyMap<string, { x: number; y: number }>) => {
    // Every optimistic move must already have a begun version, even a rail drop of an absent map.
    for (const name of positions.keys()) expect(activeLedger.serverShows(name, activeLedger.snapshot())).toBe(false);
    setWorld((previous) => {
      const next = new Map(previous.placements);
      for (const [name, at] of positions) {
        const size = previous.placements.get(name) ?? { map: name, width: 10, height: 10, component: -1 };
        next.set(name, { ...size, ...at });
      }
      return { ...previous, placements: next };
    });
  }, [activeLedger]);
  const reload = useCallback(() => {
    reloadSpy();
    // Capture BEFORE any updater. A newer drag must survive this snapshot's eventual landing.
    const snapshot = activeLedger.snapshot();
    const gen = ++generation.current;
    reloads.push({ snapshot, finish: () => {
      setWorld((previous) => {
        const next = new Map(server.placements);
        for (const name of activeLedger.versionedMaps()) {
          if (!activeLedger.serverShows(name, snapshot)) {
            const local = previous.placements.get(name);
            if (local) next.set(name, local);
          }
        }
        return { ...server, placements: next };
      });
      setLoadedGen(gen);
    } });
    return gen;
  }, [activeLedger]);
  reloadWorld = reload;
  return { world, error, reload, loadedGen, dismissError: () => setError(null), move };
}

beforeEach(() => {
  lateState.active = false;
  lateState.writes.mockClear();
  initialWorld = fixture;
  server = fixture;
  reloadError = null;
  reloads = [];
  posts = [];
  draws = [];
  reloadSpy = vi.fn();
  callbacks = { select: vi.fn(), open: vi.fn(), saved: vi.fn() };
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const stage = this.classList.contains("world-canvas__stage");
    return {
      clearRect: vi.fn(),
      drawImage: (image: FakeImage, ...rect: number[]) => {
        if (stage) draws.push({ map: image.src.split("/").at(-1)!.split("?")[0]!, rect });
      },
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  } as never);
  adapter = {
    nativePx: 16,
    useWorld: useFakeWorld,
    postPlacement: ({ map, x, y }) => {
      const outcome = deferred<void>();
      posts.push({ map, x, y, outcome });
      return outcome.promise;
    },
    postDungeons: async () => {},
    imageUrl: (p, version) => `/t/${p.map}?v=${version ?? 0}`,
    cacheKey: 0,
    drawnByDefault: (p) => p.map !== "Hidden",
    conflictTooltip: () => "conflict",
    fetchEncounters: async () => ({ summaries: [], methodTint: null }),
    border: { band: 1 },
    fetchWarps: async () => [],
    warpOffset: 1,
    renderWarpPopup: (map, close) => (
      <div role="dialog" aria-label={`Warp to ${map}`}>
        <button onClick={close}>Close preview</button>
      </div>
    ),
    useCoverage: () => ({ coverage: null, error: null, levelByMap: [], emptyMapNames: new Set() }),
    lensLegend: {},
    canvasLabel: "World map",
    statusItems: (s) => <span>{s.zoomPercent}% {s.hover?.map ?? "no hover"}</span>,
  };
});
afterEach(() => {
  lateState.active = false;
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Bounded microtask turns; deferred promises are resolved explicitly by each test, with no waitFor probes.
async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}
function mount(props: Props = {}) {
  return render(<WorldSurface adapter={adapter} onSelectMap={callbacks.select} onOpenMap={callbacks.open}
    onPlacementsSaved={callbacks.saved} {...props} />);
}
type Host = ReturnType<typeof mount>;
const canvas = (host: Host) => host.container.querySelector<HTMLCanvasElement>(".world-canvas__stage")!;
const selection = (host: Host) => [...host.container.querySelectorAll<HTMLElement>("[data-map]")]
  .map((node) => node.dataset.map).sort();
function click(host: Host, x: number, y: number, modifiers = {}) {
  const target = canvas(host);
  fireEvent.mouseDown(target, { button: 0, clientX: x, clientY: y, ...modifiers });
  fireEvent.mouseUp(target);
  fireEvent.click(target, { clientX: x, clientY: y, ...modifiers });
}
function dragMap(host: Host, x0: number, y0: number, x1: number, y1: number) {
  const target = canvas(host);
  fireEvent.mouseDown(target, { button: 0, shiftKey: true, clientX: x0, clientY: y0 });
  fireEvent.mouseMove(target, { clientX: x1, clientY: y1 });
  fireEvent.mouseUp(target);
}
function selectThree(host: Host) {
  // Centres of A, B and C in the fit above.
  click(host, 25, 25);
  click(host, 75, 25, { ctrlKey: true });
  click(host, 125, 75, { metaKey: true });
}
function drop(host: Host, map: string, x = 100, y = 50) {
  // jsdom's Event fallback drops coordinate init fields; define the DragEvent properties explicitly.
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: x }, clientY: { value: y }, dataTransfer: { value: { getData: () => map } },
  });
  fireEvent(canvas(host), event);
}
function pan(host: Host) {
  fireEvent.mouseDown(canvas(host), { button: 0, clientX: 25, clientY: 25 });
  fireEvent.mouseMove(canvas(host), { clientX: 35, clientY: 25 });
  fireEvent.mouseUp(canvas(host));
}
// Explicit properties retain capture coverage in jsdom versions without a native PointerEvent constructor.
function pointer(host: Host, type: string) {
  const event = new MouseEvent(type, { bubbles: true, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(canvas(host), event);
}
const position = (map: string) => {
  const p = readWorld().placements.get(map)!;
  return [p.x, p.y];
};

it("selects one map, toggles Ctrl/Cmd, replaces by marquee, clears Escape and reports hover", () => {
  const host = mount();
  click(host, 25, 25);
  expect(selection(host)).toEqual(["A"]);
  expect(callbacks.select).toHaveBeenLastCalledWith("A");
  click(host, 75, 25, { ctrlKey: true });
  expect(selection(host)).toEqual(["A", "B"]);
  click(host, 25, 25, { metaKey: true });
  expect(selection(host)).toEqual(["B"]);
  // Leftward crossing (201,101)->(149,51) intersects C/D; A/B end above y=51. Start in empty space.
  fireEvent.mouseDown(canvas(host), { button: 0, ctrlKey: true, clientX: 201, clientY: 101 });
  fireEvent.mouseMove(canvas(host), { clientX: 149, clientY: 51 });
  expect(host.container.querySelector(".world-canvas__marquee")).not.toBeNull();
  expect(host.container.querySelector(".world-canvas__marquee")!.hasAttribute("aria-hidden")).toBe(false);
  fireEvent.mouseUp(canvas(host));
  expect(selection(host)).toEqual(["C", "D"]);
  fireEvent.keyDown(canvas(host), { key: "Escape" });
  expect(selection(host)).toEqual([]);
  fireEvent.mouseMove(canvas(host), { clientX: 25, clientY: 25 });
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("A");
  fireEvent.mouseLeave(canvas(host));
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("no hover");
});

it("suppresses trailing click and double-click after pan or map movement", () => {
  const host = mount();
  selectThree(host);
  pan(host);
  fireEvent.click(canvas(host), { clientX: 35, clientY: 25 });
  fireEvent.doubleClick(canvas(host), { clientX: 35, clientY: 25 });
  expect(selection(host)).toEqual(["A", "B", "C"]);
  expect(callbacks.open).not.toHaveBeenCalled();
  // Pan shifted A's centre from 25 to 35. Shift-drag 10 px = 2 units at zoom 5.
  dragMap(host, 35, 25, 45, 25);
  fireEvent.click(canvas(host), { clientX: 45, clientY: 25 });
  expect(selection(host)).toEqual(["A", "B", "C"]);
});

it("posts three group members and reloads once only after the last deferred outcome", async () => {
  const host = mount();
  selectThree(host);
  dragMap(host, 25, 25, 35, 30);
  // 10/5 = 2 units right, 5/5 = 1 down; A(10,10), B(20,10), C(30,20).
  expect(posts.map(({ map, x, y }) => ({ map, x, y }))).toEqual([
    { map: "A", x: 12, y: 11 }, { map: "B", x: 22, y: 11 }, { map: "C", x: 32, y: 21 },
  ]);
  posts[0]!.outcome.resolve();
  posts[1]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(0);
  expect(callbacks.saved).not.toHaveBeenCalled();
  posts[2]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledWith(["A", "B", "C"]);
  expect(reloadSpy.mock.invocationCallOrder[0]).toBeLessThan(callbacks.saved.mock.invocationCallOrder[0]!);
});

it("moves every retained selected map when a filter leaves only the grabbed group member visible", async () => {
  const host = mount();
  click(host, 25, 25);
  click(host, 75, 25, { ctrlKey: true });
  expect(selection(host)).toEqual(["A", "B"]);
  host.rerender(<WorldSurface adapter={adapter} mapFilter={new Set(["B"])} onPlacementsSaved={callbacks.saved} />);
  expect(selection(host)).toEqual(["B"]);
  // B-only bounds (20,10)-(30,20), z=min(200/10,100/10)=10, pan=(-150,-100).
  // B centre projects to (100,50). Drag (20,10)px means delta(2,1), including retained, hidden A.
  dragMap(host, 100, 50, 120, 60);
  expect(position("A")).toEqual([12, 11]);
  expect(position("B")).toEqual([22, 11]);
  expect(posts.map(({ map, x, y }) => ({ map, x, y }))).toEqual([
    { map: "A", x: 12, y: 11 }, { map: "B", x: 22, y: 11 },
  ]);
  posts[0]!.outcome.resolve();
  await settle();
  expect(reloadSpy).not.toHaveBeenCalled();
  posts[1]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledWith(["A", "B"]);
});

it("waits for every failed group member and reloads once without reporting any saved names", async () => {
  const host = mount();
  selectThree(host);
  dragMap(host, 25, 25, 35, 30);
  expect(posts.map(({ map }) => map)).toEqual(["A", "B", "C"]);
  posts[0]!.outcome.reject(new Error("A refused"));
  posts[1]!.outcome.reject(new Error("B refused"));
  await settle();
  expect(reloadSpy).not.toHaveBeenCalled();
  expect(callbacks.saved).not.toHaveBeenCalled();
  posts[2]!.outcome.reject(new Error("C refused"));
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).not.toHaveBeenCalled();
  act(() => reloads[0]!.finish());
  // All three failed versions are settled: unchanged server positions replace the optimistic delta (2,1).
  expect(position("A")).toEqual([10, 10]);
  expect(position("B")).toEqual([20, 10]);
  expect(position("C")).toEqual([30, 20]);
});

it("waits after an early rejected member, reports successes once and reconciles the failed map on GET", async () => {
  const host = mount();
  selectThree(host);
  dragMap(host, 25, 25, 35, 30);
  posts[1]!.outcome.reject(new Error("B refused"));
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(0);
  expect(callbacks.saved).not.toHaveBeenCalled();
  expect(position("B")).toEqual([22, 11]);
  posts[0]!.outcome.resolve();
  posts[2]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledWith(["A", "C"]);
  act(() => reloads[0]!.finish());
  // Server still has B(20,10); no failed optimistic (22,11) survives the settled snapshot.
  expect(position("B")).toEqual([20, 10]);
  expect(screen.getByText("B refused")).toBeTruthy();
});

it("an older POST and its reload never roll back a newer drag of the same map", async () => {
  const host = mount();
  dragMap(host, 25, 25, 35, 25);
  // A moves from x=10 to 12; its centre moves from 25 to 35. Next 10px move gives x=14.
  dragMap(host, 35, 25, 45, 25);
  expect(position("A")).toEqual([14, 10]);
  posts[0]!.outcome.resolve();
  await settle();
  act(() => reloads[0]!.finish());
  expect(position("A")).toEqual([14, 10]);
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(false);
  posts[1]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(2);
});

it("an older rejected POST and its reload preserve the newer pending drag of the same map", async () => {
  const host = mount();
  dragMap(host, 25, 25, 35, 25);
  dragMap(host, 35, 25, 45, 25);
  // Zoom5: each 10px drag adds 2 units. A starts (10,10), then (12,10), then (14,10).
  expect(position("A")).toEqual([14, 10]);
  expect(posts).toHaveLength(2);
  posts[0]!.outcome.reject(new Error("older A refused"));
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).not.toHaveBeenCalled();
  act(() => reloads[0]!.finish());
  expect(position("A")).toEqual([14, 10]);
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(false);
  posts[1]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(2);
  expect(callbacks.saved).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledWith(["A"]);
});

it("unmount cancels with committed drag options after a later render suspends", () => {
  const blocked = deferred<void>();
  const attempted = vi.fn();
  const abandonedMove = vi.fn();
  function BlockedToolbar(): never {
    attempted();
    throw blocked.promise;
  }
  const host = render(
    <Suspense fallback={<span>Pending render</span>}>
      <WorldSurface adapter={adapter} />
    </Suspense>,
  );
  fireEvent.mouseDown(canvas(host), { button: 0, shiftKey: true, clientX: 25, clientY: 25 });
  fireEvent.mouseMove(canvas(host), { clientX: 35, clientY: 25 });
  // At z5 this is A(10,10)->(12,10); its version stays pending until cancellation.
  expect(position("A")).toEqual([12, 10]);
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(false);
  const uncommitted = {
    ...adapter,
    useWorld: (activeLedger: PlacementLedger) => ({ ...useFakeWorld(activeLedger), move: abandonedMove }),
  };
  act(() => {
    startTransition(() => {
      host.rerender(
        <Suspense fallback={<span>Pending render</span>}>
          <WorldSurface adapter={{ ...uncommitted, toolbarExtras: <BlockedToolbar /> }} />
        </Suspense>,
      );
    });
  });
  expect(attempted).toHaveBeenCalled();
  expect(screen.queryByText("Pending render")).toBeNull();
  host.unmount();
  expect(abandonedMove).not.toHaveBeenCalled();
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(true);
  expect(posts).toHaveLength(0);
});

it("cancels a captured map drag without POST and accepts the server on a later reload", () => {
  const host = mount();
  const target = canvas(host);
  target.setPointerCapture = vi.fn();
  target.hasPointerCapture = () => true;
  target.releasePointerCapture = vi.fn();
  pointer(host, "pointerdown");
  fireEvent.mouseDown(target, { button: 0, shiftKey: true, clientX: 25, clientY: 25 });
  fireEvent.mouseMove(target, { clientX: 35, clientY: 25 });
  pointer(host, "pointercancel");
  expect(posts).toHaveLength(0);
  expect(position("A")).toEqual([10, 10]);
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(true);
  act(() => { reloadWorld(); });
  act(() => reloads[0]!.finish());
  expect(position("A")).toEqual([10, 10]);
});

it("holds a captured drag outside, commits once on release, and retains the uncaptured leave fallback", async () => {
  const host = mount();
  const target = canvas(host);
  target.setPointerCapture = vi.fn();
  target.hasPointerCapture = () => true;
  target.releasePointerCapture = vi.fn();
  pointer(host, "pointerdown");
  fireEvent.mouseDown(target, { button: 0, shiftKey: true, clientX: 25, clientY: 25 });
  fireEvent.mouseMove(target, { clientX: 35, clientY: 25 });
  fireEvent.mouseLeave(target);
  expect(posts).toHaveLength(0);
  pointer(host, "pointerup");
  fireEvent.mouseUp(target);
  fireEvent.mouseLeave(target);
  expect(posts).toHaveLength(1);
  // New uncaptured gesture: A now centred at x=35. Another 10px moves it two more units.
  fireEvent.mouseDown(target, { button: 0, shiftKey: true, clientX: 35, clientY: 25 });
  fireEvent.mouseMove(target, { clientX: 45, clientY: 25 });
  fireEvent.mouseLeave(target);
  fireEvent.mouseUp(target);
  expect(posts).toHaveLength(2);
  for (const post of posts) post.outcome.resolve();
  await settle();
});

it("returning a map drag to its start settles without POST; unexpected capture loss cancels once", () => {
  const host = mount();
  fireEvent.mouseDown(canvas(host), { button: 0, shiftKey: true, clientX: 25, clientY: 25 });
  fireEvent.mouseMove(canvas(host), { clientX: 35, clientY: 25 });
  fireEvent.mouseMove(canvas(host), { clientX: 25, clientY: 25 });
  fireEvent.mouseUp(canvas(host));
  expect(posts).toHaveLength(0);
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(true);
  const target = canvas(host);
  target.setPointerCapture = vi.fn();
  target.hasPointerCapture = () => true;
  target.releasePointerCapture = vi.fn();
  pointer(host, "pointerdown");
  fireEvent.mouseDown(target, { button: 0, shiftKey: true, clientX: 25, clientY: 25 });
  fireEvent.mouseMove(target, { clientX: 35, clientY: 25 });
  pointer(host, "lostpointercapture");
  pointer(host, "pointercancel");
  fireEvent.mouseUp(target);
  expect(posts).toHaveLength(0);
  expect(position("A")).toEqual([10, 10]);
  expect(ledger.serverShows("A", ledger.snapshot())).toBe(true);
});

it("rail drop begins before movement, posts once, then reloads and reports the saved map", async () => {
  const host = mount();
  drop(host, "Unplaced");
  // Pointer (100,50) -> world ((100+50)/5,(50+50)/5)=(30,20); subtract half size 5 -> (25,15).
  expect(posts.map(({ map, x, y }) => ({ map, x, y }))).toEqual([{ map: "Unplaced", x: 25, y: 15 }]);
  expect(position("Unplaced")).toEqual([25, 15]);
  posts[0]!.outcome.resolve();
  await settle();
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledTimes(1);
  expect(callbacks.saved).toHaveBeenCalledWith(["Unplaced"]);
});

it("marker clicks within eight screen pixels select nothing; nine pixels selects the map and double-click previews", async () => {
  adapter.fetchWarps = async (map) => map === "A"
    ? [{ point: { x: 5, y: 5 }, popupMap: "B" }] : [];
  const host = mount();
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  // A origin (0,0), warp(5,5)*zoom5 -> (25,25). 32.9-25=7.9px, 34-25=9px.
  const marker = host.container.querySelector<HTMLElement>(".world-canvas__warp-marker")!;
  expect([marker.style.left, marker.style.top]).toEqual(["25px", "25px"]);
  click(host, 32.9, 25);
  expect(selection(host)).toEqual([]);
  expect(callbacks.select).not.toHaveBeenCalled();
  click(host, 34, 25);
  expect(selection(host)).toEqual(["A"]);
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25 });
  expect(screen.getByRole("dialog", { name: "Warp to B" })).toBeTruthy();
  expect(callbacks.open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("projects half-unit warp coordinates and resolved connection endpoints through the same view after pan/zoom", async () => {
  adapter.warpOffset = 0.5;
  adapter.fetchWarps = async (map) => map === "A" ? [{
    point: { x: 4, y: 6 }, destination: { map: "B", point: { x: 2, y: 4 } },
  }] : [];
  const host = mount({ mapFilter: new Set(["A", "B"]) });
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  fireEvent.click(screen.getByRole("switch", { name: "Connection lines" }));
  await settle();
  pan(host);
  fireEvent.wheel(canvas(host), { clientX: 100, clientY: 50, deltaY: -1 });
  // Filter fit z10, pan(-100,-100); pan right10 ->(-90,-100); wheel z12 about source(19,15)
  // -> pan(-128,-130). A+half warp = (12,13)->(16,26); B+half warp=(21,12)->(124,14).
  const marker = host.container.querySelector<HTMLElement>(".world-canvas__warp-marker")!;
  expect([parseFloat(marker.style.left), parseFloat(marker.style.top)]).toEqual([16, 26]);
  const line = host.container.querySelector(".world-canvas__connections line")!;
  expect(["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)))).toEqual([16, 26, 124, 14]);
});

it("keeps overlay DOM order as an adapter fact", async () => {
  adapter.fetchWarps = async (map) => map === "A" ? [{ point: { x: 5, y: 5 } }] : [];
  const host = mount();
  click(host, 10, 10);
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  const selected = host.container.querySelector(".world-canvas__selection")!;
  const warps = host.container.querySelector(".world-canvas__warps")!;
  expect(selected.compareDocumentPosition(warps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  adapter.overlayOrder = ["warps", "connections", "lens", "spotlight", "selection", "jump", "marquee"];
  host.rerender(<WorldSurface adapter={adapter} />);
  expect(warps.compareDocumentPosition(selected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("warp fetch rejection alerts, never loops on alert renders, and retries exactly once after a pan", async () => {
  const requests: Array<{ map: string; result: ReturnType<typeof deferred<readonly SurfaceWarp[]>> }> = [];
  adapter.fetchWarps = vi.fn((map) => {
    const result = deferred<readonly SurfaceWarp[]>();
    requests.push({ map, result });
    return result.promise;
  });
  const host = mount();
  expect(adapter.fetchWarps).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  for (const request of requests) {
    if (request.map === "A") request.result.reject(new Error("always down"));
    else request.result.resolve([]);
  }
  await settle();
  expect(screen.getByText("Warp data unavailable: always down")).toBeTruthy();
  const countA = () => requests.filter((r) => r.map === "A").length;
  expect(countA()).toBe(1);
  for (let i = 0; i < 4; i++) {
    // A new adapter object must not itself act as the failed fetch's retry trigger.
    host.rerender(<WorldSurface adapter={{ ...adapter }} />);
    await settle();
  }
  expect(countA()).toBe(1);
  pan(host);
  await settle();
  expect(countA()).toBe(2);
  requests.filter((r) => r.map === "A").at(-1)!.result.reject(new Error("always down"));
  await settle();
  expect(countA()).toBe(2);
});

it("an adapter rejects malformed warp map identity and the surface shows its alert", async () => {
  const response = deferred<{ mapName: string }>();
  adapter.fetchWarps = (map) => response.promise.then((payload) => {
    // Wire validation is deliberately adapter-owned; the core never accepts or inspects a wire payload.
    if (payload.mapName !== map) throw new Error("returned the wrong map");
    return [];
  });
  const host = mount();
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  response.resolve({ mapName: "Wrong" });
  await settle();
  expect(screen.getByText("Warp data unavailable: returned the wrong map")).toBeTruthy();
});

it.each(["resolve", "reject"])("ignores a warp fetch that %ss after unmount without state writes or errors", async (outcome) => {
  const result = deferred<readonly SurfaceWarp[]>();
  adapter.fetchWarps = vi.fn(() => result.promise);
  const errors = vi.spyOn(console, "error");
  const warnings = vi.spyOn(console, "warn");
  const host = mount({ mapFilter: new Set(["A"]) });
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  expect(adapter.fetchWarps).toHaveBeenCalledTimes(1);
  host.unmount();
  errors.mockClear();
  warnings.mockClear();
  lateState.active = true;
  if (outcome === "resolve") result.resolve([{ point: { x: 5, y: 5 }, popupMap: "B" }]);
  else result.reject(new Error("late warp failure"));
  await settle();
  lateState.active = false;
  expect(lateState.writes).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(host.container.childElementCount).toBe(0);
  expect(errors).not.toHaveBeenCalled();
  expect(warnings).not.toHaveBeenCalled();
});

it("StrictMode fetches warps once per map and discards the previous mount's pending result", async () => {
  const requests: Array<ReturnType<typeof deferred<readonly SurfaceWarp[]>>> = [];
  adapter.fetchWarps = vi.fn(() => {
    const result = deferred<readonly SurfaceWarp[]>();
    requests.push(result);
    return result.promise;
  });
  const filter = new Set(["A"]);
  const errors = vi.spyOn(console, "error");
  const first = render(<WorldSurface adapter={adapter} mapFilter={filter} />, { reactStrictMode: true });
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  expect(adapter.fetchWarps).toHaveBeenCalledTimes(1);
  first.rerender(<WorldSurface adapter={{ ...adapter }} mapFilter={filter} />);
  await settle();
  expect(adapter.fetchWarps).toHaveBeenCalledTimes(1);
  first.unmount();
  const second = render(<WorldSurface adapter={adapter} mapFilter={filter} />, { reactStrictMode: true });
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  expect(adapter.fetchWarps).toHaveBeenCalledTimes(2);
  // The first mount's response must neither publish state nor seed the new mount's cache.
  lateState.active = true;
  requests[0]!.resolve([{ point: { x: 1, y: 1 }, popupMap: "Stale" }]);
  await settle();
  lateState.active = false;
  expect(lateState.writes).not.toHaveBeenCalled();
  expect(second.container.querySelector(".world-canvas__warp-marker")).toBeNull();
  requests[1]!.resolve([{ point: { x: 5, y: 5 }, popupMap: "B" }]);
  await settle();
  // A-only bounds10x10: z=min(200/10,100/10)=10; pan=(-10*10+(200-100)/2,-10*10)=(-50,-100).
  // A+(5,5)=(15,15) projects to (100,50); the stale (1,1) would instead project to (60,10).
  const markers = second.container.querySelectorAll<HTMLElement>(".world-canvas__warp-marker");
  expect(markers).toHaveLength(1);
  expect([markers[0]!.style.left, markers[0]!.style.top]).toEqual(["100px", "50px"]);
  fireEvent.doubleClick(canvas(second), { clientX: 100, clientY: 50 });
  expect(screen.getByRole("dialog", { name: "Warp to B" })).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Warp to Stale" })).toBeNull();
  expect(adapter.fetchWarps).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(errors).not.toHaveBeenCalled();
});

it("fetches offscreen filter members for lines and draws the exact adapter-resolved endpoint", async () => {
  // Shelved Far must not enlarge the anchored filter fit; an anchored Far would itself be visible.
  const scopedPlacements = new Map(fixture.placements);
  scopedPlacements.set("Far", { ...scopedPlacements.get("Far")!, component: 99 });
  initialWorld = { ...fixture, placements: scopedPlacements };
  const fetched: string[] = [];
  adapter.fetchWarps = async (map) => {
    fetched.push(map);
    return map === "A" ? [{ point: { x: 2, y: 3 }, popupMap: "Far" }]
      : map === "Far" ? [{ point: { x: 4, y: 5 } }] : [];
  };
  adapter.resolveWarp = (warp, cache) => {
    const dest = warp.popupMap && cache.get(warp.popupMap)?.[0];
    return dest && warp.popupMap ? { map: warp.popupMap, point: dest.point } : null;
  };
  const host = mount({ mapFilter: new Set(["Far", "B", "A"]) });
  fireEvent.click(screen.getByRole("switch", { name: "Connection lines" }));
  await settle();
  expect(fetched.sort()).toEqual(["A", "B", "Far"]);
  expect(FakeImage.instances.some((image) => image.src.startsWith("/t/Far?"))).toBe(false);
  // Only A/B are anchored: bounds(10,10)-(30,20), z=min(200/20,100/10)=10, pan(-100,-100).
  // A+(2,3)=(12,13)->(20,30); Far+(4,5)=(1004,1005)->(9940,9950), outside the 200x100 viewport.
  // These are exact destination warps, never map centres.
  const line = host.container.querySelector(".world-canvas__connections line")!;
  expect(["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)))).toEqual([20, 30, 9940, 9950]);
});

it("does not fetch markers below LOD and fetches visible maps when zoom reaches the threshold", async () => {
  adapter.nativePx = 32;
  adapter.fetchWarps = vi.fn(async () => []);
  const host = mount();
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  // Fit z5 is below 32*.25=8. Three '+' steps: 5*1.2^3=8.64, now above threshold.
  expect(adapter.fetchWarps).not.toHaveBeenCalled();
  fireEvent.keyDown(canvas(host), { key: "+" });
  fireEvent.keyDown(canvas(host), { key: "+" });
  fireEvent.keyDown(canvas(host), { key: "+" });
  await settle();
  expect(adapter.fetchWarps).toHaveBeenCalled();
  expect((adapter.fetchWarps as ReturnType<typeof vi.fn>).mock.calls.some(([name]) => name === "Far")).toBe(false);
});

it("double-click edits here when supplied, otherwise opens Map view; Shift always opens Map view", () => {
  const edit = vi.fn();
  const host = mount();
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25 });
  expect(callbacks.open).toHaveBeenCalledTimes(1);
  expect(callbacks.open).toHaveBeenCalledWith("A");
  host.rerender(<WorldSurface adapter={adapter} onEditHere={edit} onOpenMap={callbacks.open} />);
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25 });
  expect(edit).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledWith("A");
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25, shiftKey: true });
  expect(callbacks.open).toHaveBeenCalledTimes(2);
});

it("Enter opens a single in-scope map, keys zoom about centre, Escape clears and menu keys use its rect centre", () => {
  const host = mount();
  click(host, 25, 25);
  fireEvent.keyDown(canvas(host), { key: "Enter" });
  expect(callbacks.open).toHaveBeenCalledTimes(1);
  expect(callbacks.open).toHaveBeenCalledWith("A");
  fireEvent.keyDown(canvas(host), { key: "ContextMenu" });
  const menu = screen.getByRole("menu");
  // A rect is 0..50 on each axis, centre (25,25). jsdom popup width=0 so no inset clamp applies here.
  expect([menu.style.left, menu.style.top]).toEqual(["25px", "25px"]);
  fireEvent.keyDown(menu, { key: "Escape" });
  fireEvent.keyDown(canvas(host), { key: "+" });
  // z5*1.2=6 -> 6/16*100=37.5 ->38%; pivot source(30,20) -> pan(-80,-70).
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("38%");
  const outline = host.container.querySelector<HTMLElement>('[data-map="A"]')!;
  expect([outline.style.left, outline.style.top, outline.style.width, outline.style.height])
    .toEqual(["-20px", "-10px", "60px", "60px"]);
  fireEvent.keyDown(canvas(host), { key: "_" });
  // 6/1.2=5 ->31% (rounded).
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("31%");
  fireEvent.keyDown(canvas(host), { key: "=" });
  fireEvent.keyDown(canvas(host), { key: "-" });
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("31%");
  host.rerender(<WorldSurface adapter={adapter} mapFilter={new Set(["B"])} onOpenMap={callbacks.open} />);
  fireEvent.keyDown(canvas(host), { key: "Enter" });
  expect(callbacks.open).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(canvas(host), { key: "Escape" });
  expect(selection(host)).toEqual([]);
});

it("right-click opens the menu at the pointer and gives Edit-here its client snap point", () => {
  const edit = vi.fn();
  const host = mount({ onEditHere: edit });
  click(host, 25, 25);
  fireEvent.contextMenu(canvas(host), { clientX: 12, clientY: 18 });
  const menu = screen.getByRole("menu");
  expect([menu.style.left, menu.style.top]).toEqual(["12px", "18px"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit here" }));
  expect(edit).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledWith("A");
  host.rerender(<WorldSurface adapter={adapter} context={{
    map: "A", origin: { x: 0, y: 0 }, renderCanvas: () => null, onExitRequest: () => {},
  }} />);
  // Context snaps A's centre(15,15) to client(12,18), at native zoom16: pan(-228,-222).
  // A origin(10,10) ->(-68,-62), extent10*16=160. A centre would be (100,50) without the menu snap point.
  const outline = host.container.querySelector<HTMLElement>('[data-map="A"]')!;
  expect([outline.style.left, outline.style.top, outline.style.width, outline.style.height])
    .toEqual(["-68px", "-62px", "160px", "160px"]);
});

it("re-jump restarts the full two-second highlight and reveals a hidden map only outside a filter", async () => {
  vi.useFakeTimers();
  const host = mount({ jumpToMap: "Hidden", jumpToken: 1 });
  await settle();
  expect(FakeImage.instances.some((image) => image.src.startsWith("/t/Hidden?"))).toBe(true);
  const first = host.container.querySelector(".world-canvas__jump-highlight");
  act(() => vi.advanceTimersByTime(1500));
  host.rerender(<WorldSurface adapter={adapter} jumpToMap="Hidden" jumpToken={2} />);
  const second = host.container.querySelector(".world-canvas__jump-highlight");
  expect(second).not.toBe(first);
  // Original expiry t=2000 has passed, new expiry t=3500 is still pending.
  act(() => vi.advanceTimersByTime(501));
  expect(host.container.querySelector(".world-canvas__jump-highlight")).not.toBeNull();
  act(() => vi.advanceTimersByTime(1499));
  expect(host.container.querySelector(".world-canvas__jump-highlight")).toBeNull();
});

it("a filtered jump does not permanently reveal the hidden placement after the filter clears", () => {
  const host = mount({ mapFilter: new Set(["Hidden"]), jumpToMap: "Hidden", jumpToken: 1 });
  const requested = FakeImage.instances.filter((image) => image.src.startsWith("/t/Hidden?"));
  expect(requested).toHaveLength(1);
  host.rerender(<WorldSurface adapter={adapter} jumpToMap="Hidden" jumpToken={1} />);
  act(() => requested[0]!.onload?.());
  // No hidden tile is drawn after clearing the filter: its jump did not add a session reveal.
  expect(draws.filter((draw) => draw.map === "Hidden")).toHaveLength(0);
});

it("hides the rail only in context and steps context zoom; pending context never falls into continuous zoom", () => {
  const context = { map: "A", origin: null, renderCanvas: () => null, onExitRequest: vi.fn() };
  const host = mount();
  expect(screen.getByRole("complementary", { name: "Unplaced maps" })).toBeTruthy();
  host.rerender(<WorldSurface adapter={adapter} context={context} />);
  expect(screen.queryByRole("complementary", { name: "Unplaced maps" })).toBeNull();
  const before = host.container.querySelector(".world-canvas__status")?.textContent;
  fireEvent.keyDown(canvas(host), { key: "+" });
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toBe(before);
  host.rerender(<WorldSurface adapter={adapter} context={{ ...context, origin: { x: 0, y: 0 } }} />);
  // Context entry snaps to map zoom1 (16px/unit). '+' steps to zoom2 (32px/unit), not 19.2px/unit.
  fireEvent.keyDown(canvas(host), { key: "+" });
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("200%");
  fireEvent.keyDown(canvas(host), { key: "-" });
  expect(host.container.querySelector(".world-canvas__status")?.textContent).toContain("100%");
  host.rerender(<WorldSurface adapter={adapter} />);
  expect(screen.getByRole("complementary", { name: "Unplaced maps" })).toBeTruthy();
});

it("dungeon toggle posts optimistically, reloads, calls layout changed and ignores older outcomes", async () => {
  const outcomes = [deferred<void>(), deferred<void>()];
  let index = 0;
  adapter.postDungeons = vi.fn(() => outcomes[index++]!.promise);
  const changed = vi.fn();
  const host = mount({ onLayoutChanged: changed });
  const toggle = screen.getByRole("switch", { name: "Dungeon auto-layout" });
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  outcomes[0]!.resolve();
  await settle();
  expect(reloadSpy).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  outcomes[1]!.resolve();
  await settle();
  expect(adapter.postDungeons).toHaveBeenNthCalledWith(1, false, fixture);
  expect(adapter.postDungeons).toHaveBeenNthCalledWith(2, true, fixture);
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(1);
  act(() => reloads[0]!.finish());
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(canvas(host)).toBeTruthy();
});

it.each(["dismissible", "per-map"] as const)("dungeon failure uses the %s error policy and reloads", async (policy) => {
  adapter.saveErrorPolicy = policy;
  const result = deferred<void>();
  adapter.postDungeons = () => result.promise;
  const changed = vi.fn();
  mount({ onLayoutChanged: changed });
  const toggle = screen.getByRole("switch", { name: "Dungeon auto-layout" });
  fireEvent.click(toggle);
  result.reject(new Error("toggle refused"));
  await settle();
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  expect(changed).not.toHaveBeenCalled();
  const error = screen.getByText(policy === "per-map"
    ? "Could not save dungeon auto-layout: toggle refused" : "toggle refused");
  expect(error.closest(policy === "per-map" ? ".world-canvas__toolbar" : ".world-canvas__viewport")).not.toBeNull();
});

it("adapter facts preserve modified double-click and unresolved warp preview behaviour", async () => {
  adapter.modifiedDoubleClick = true;
  adapter.unresolvedWarpError = "This warp destination could not be resolved";
  adapter.fetchWarps = async (map) => map === "A" ? [{ point: { x: 5, y: 5 } }] : [];
  const host = mount();
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25, ctrlKey: true });
  expect(callbacks.open).toHaveBeenCalledWith("A");
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  await settle();
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25 });
  expect(screen.getByText("Warp data unavailable: This warp destination could not be resolved")).toBeTruthy();
  adapter.unresolvedWarpError = undefined;
  host.rerender(<WorldSurface adapter={adapter} />);
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  fireEvent.click(screen.getByRole("switch", { name: "Warps" }));
  fireEvent.doubleClick(canvas(host), { clientX: 25, clientY: 25 });
  expect(screen.queryByText("Warp data unavailable: This warp destination could not be resolved")).toBeNull();
});

it("keeps dismissible save errors across success, stacks toasts, and applies the dragging cursor only through its slot", async () => {
  adapter.wrapToasts = (children) => <div className="world-canvas__toasts">{children}</div>;
  adapter.draggingMapClass = "world-canvas__stage--dragging-map";
  const host = mount();
  fireEvent.mouseDown(canvas(host), { button: 0, shiftKey: true, clientX: 25, clientY: 25 });
  expect(canvas(host).classList.contains("world-canvas__stage--dragging-map")).toBe(true);
  fireEvent.mouseMove(canvas(host), { clientX: 35, clientY: 25 });
  fireEvent.mouseUp(canvas(host));
  expect(canvas(host).classList.contains("world-canvas__stage--dragging-map")).toBe(false);
  posts[0]!.outcome.reject(new Error("persist me"));
  await settle();
  dragMap(host, 35, 25, 45, 25);
  posts[1]!.outcome.resolve();
  await settle();
  act(() => publishError("reload refused"));
  const wrapper = host.container.querySelector(".world-canvas__toasts")!;
  expect(wrapper.textContent).toContain("persist me");
  expect(wrapper.textContent).toContain("Could not reload the world: reload refused");
  const dismiss = wrapper.querySelector<HTMLButtonElement>("button")!;
  fireEvent.click(dismiss);
  expect(screen.queryByText("persist me")).toBeNull();
});

it("per-map success clears only its own error and toolbar errors follow the encounter alert", async () => {
  adapter.saveErrorPolicy = "per-map";
  adapter.fetchEncounters = async () => { throw new Error("encounters down"); };
  adapter.toolbarAfterEncounter = <div data-testid="after-encounter">Host errors</div>;
  const host = mount();
  dragMap(host, 25, 25, 35, 25);
  posts[0]!.outcome.reject(new Error("A refused"));
  await settle();
  dragMap(host, 75, 25, 85, 25);
  posts[1]!.outcome.resolve();
  await settle();
  expect(screen.getByText("Could not save placement: A refused")).toBeTruthy();
  const toolbar = host.container.querySelector(".world-canvas__toolbar")!;
  const encounter = toolbar.querySelector(".world-canvas__toolbar-error")!;
  const save = screen.getByText("Could not save placement: A refused");
  expect(encounter.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByTestId("after-encounter").compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.container.querySelector(".world-canvas__toasts")).toBeNull();
  dragMap(host, 35, 25, 45, 25);
  posts[2]!.outcome.resolve();
  await settle();
  expect(screen.queryByText("Could not save placement: A refused")).toBeNull();
});

it("keeps filter selection and drop guards as adapter facts", () => {
  const host = mount();
  click(host, 25, 25);
  const filter = new Set(["B"]);
  host.rerender(<WorldSurface adapter={adapter} mapFilter={filter} />);
  // Default policy retains out-of-scope A; it is hidden, and reappears when the filter clears.
  host.rerender(<WorldSurface adapter={adapter} />);
  expect(selection(host)).toEqual(["A"]);
  adapter.pruneSelectionOnFilter = true;
  adapter.dropSize = (name, world, activeFilter) => {
    if (activeFilter && !activeFilter.has(name)) return null;
    return world.placements.get(name) ?? { width: 10, height: 10 };
  };
  host.rerender(<WorldSurface adapter={adapter} mapFilter={filter} />);
  drop(host, "Unplaced");
  expect(posts).toHaveLength(0);
  host.rerender(<WorldSurface adapter={adapter} />);
  expect(selection(host)).toEqual([]);
  drop(host, "A");
  expect(posts).toHaveLength(1);
});

it("the singleton-size drop policy permits a rail map outside the current filter", () => {
  const host = mount({ mapFilter: new Set(["B"]) });
  drop(host, "Unplaced");
  // B-only fit z10, pan(-150,-100). Pointer(100,50)->world(25,15), minus half-size5 ->(20,10).
  expect(posts.map(({ map, x, y }) => ({ map, x, y }))).toEqual([{ map: "Unplaced", x: 20, y: 10 }]);
});

it.each(["left", "right"])("clamps the encounter sprite tooltip at the %s edge of the viewport", async (edge) => {
  adapter.fetchEncounters = async (map) => ({
    summaries: map === "A" ? [{ species: "TEST", displayName: "Test species", iconUrl: "/icon.png", rows: [] }] : [],
    methodTint: null,
  });
  const host = mount();
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("encounter-border__tooltip")) {
      // A 100px tooltip with left=-40 needs +40; with left=150,right=250 in a 200px viewport needs -50.
      const left = edge === "left" ? -40 : 150;
      const translated = parseFloat(this.style.translate) || 0;
      return { x: left + translated, y: 0, left: left + translated, right: left + translated + 100,
        top: 0, bottom: 20, width: 100, height: 20, toJSON: () => ({}) };
    }
    return original.call(this);
  });
  const sprite = screen.getByRole("button", { name: "Test species" });
  if (edge === "left") fireEvent.mouseEnter(sprite);
  else fireEvent.focus(sprite);
  await settle();
  const tip = screen.getByRole("tooltip");
  expect(tip.style.translate).toBe(edge === "left" ? "40px" : "-50px");
  const rect = tip.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(200);
  expect(canvas(host)).toBeTruthy();
});
