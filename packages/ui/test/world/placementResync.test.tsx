import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WorldCanvas } from "../../src/components/WorldCanvas.js";
import { GbcWorldCanvas } from "../../src/gbc/GbcWorldCanvas.js";
import { restoreViewport, stubViewport } from "../viewport.js";

let originalContext: typeof HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  stubViewport(200);
  originalContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ clearRect() {}, drawImage() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillText() {} });
});

it.each(["gba", "gbc"] as const)("%s keeps a newer drag when an older placement reload arrives", async (family) => {
  const api = server(family);
  let release: (() => void) | undefined;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    const response = api.fetcher(url, init);
    if (url === "/api/world" && api.gets() === 2) {
      return new Promise<Response>((resolve) => { release = () => { void response.then(resolve); }; });
    }
    return response;
  });
  const { container } = render(family === "gba" ? <WorldCanvas /> : <GbcWorldCanvas time="day" />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  const canvas = container.querySelector("canvas.world-canvas__stage")!;
  const drop = new MouseEvent("drop", { bubbles: true, clientX: 50, clientY: 100 });
  Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "Unplaced" } });
  fireEvent(canvas, drop);
  await waitFor(() => expect(api.gets()).toBe(2));
  fireEvent.mouseDown(canvas, { clientX: 20, clientY: 70, button: 0, shiftKey: true });
  fireEvent.mouseMove(canvas, { clientX: 30, clientY: 80, shiftKey: true });
  await act(async () => { release!(); await Promise.resolve(); });
  fireEvent.mouseUp(canvas);
  await waitFor(() => expect(api.posted).toEqual(["Unplaced", "Unplaced"]));
});
afterEach(() => { HTMLCanvasElement.prototype.getContext = originalContext; restoreViewport(); vi.unstubAllGlobals(); });

function server(family: "gba" | "gbc", failFirstPost = false) {
  let gets = 0; let posts = 0;
  const posted: string[] = [];
  const manual: Record<string, { x: number; y: number }> = {};
  const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/world/placement") {
      const p = JSON.parse(String(init?.body)) as { map: string; x: number; y: number };
      if (failFirstPost && ++posts === 1) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
      posted.push(p.map); manual[p.map] = p;
      return ok({ ok: true });
    }
    if (url === "/api/world") {
      gets++;
      const p = (map: string, x: number, y: number, component = 0) => ({ map, x, y, width: 10, height: 10, component, mapType: family === "gba" ? "MAP_TYPE_TOWN" : "TOWN", manual: !!manual[map] });
      const placements = { Source: p("Source", manual.Source?.x ?? 0, manual.Source?.y ?? 0), Neighbour: p("Neighbour", 10, posted.length ? 5 : 0),
        ...(manual.Unplaced ? { Unplaced: p("Unplaced", manual.Unplaced.x, manual.Unplaced.y, 1) } : {}) };
      const components = [{ index: 0, maps: ["Source", "Neighbour"], bounds: { x: 0, y: 0, width: 20, height: 10 } },
        { index: 1, maps: ["Unplaced"], bounds: { x: 0, y: 0, width: 10, height: 10 } }];
      return ok({ ...(family === "gbc" ? { family, blockPx: 32 } : { verticalLinks: [] }), placements, components, conflicts: [], sidecar: { dungeonAutoLayout: false } });
    }
    if (url === "/api/coverage") return ok(family === "gba"
      ? { mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [], byMethod: {} }
      : { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [] });
    if (url === "/api/species") return ok([]);
    if (url.startsWith("/api/encounters/")) return ok(family === "gbc" ? { family, mapName: url.split("/").at(-1), sources: [], defects: [] } : { mapName: url.split("/").at(-1), mapId: 0, methods: [] });
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  return { fetcher, posted, gets: () => gets };
}

describe.each(["gba", "gbc"] as const)("%s placement canvas resync", (family) => {
  it.each(["tree", "rail", "Shift-drag"])("%s save moves an automatic neighbour without a view switch", async (source) => {
    const api = server(family); vi.stubGlobal("fetch", api.fetcher);
    const saved = vi.fn();
    const { container } = render(family === "gba" ? <WorldCanvas onPlacementsSaved={saved} /> : <GbcWorldCanvas time="day" onPlacementsSaved={saved} />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    const canvas = container.querySelector("canvas.world-canvas__stage")!;
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 175 });
    expect(container.querySelector(".world-canvas__hover")?.textContent).not.toContain("Neighbour");
    if (source === "Shift-drag") {
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 70, button: 0, shiftKey: true });
      fireEvent.mouseMove(canvas, { clientX: 30, clientY: 80, shiftKey: true });
      fireEvent.mouseUp(canvas);
    } else {
      const map = "Unplaced";
      const drop = new MouseEvent("drop", { bubbles: true, clientX: 50, clientY: 100 });
      Object.defineProperty(drop, "dataTransfer", { value: { getData: () => map } });
      fireEvent(canvas, drop);
    }
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved).toHaveBeenCalledWith([source === "Shift-drag" ? "Source" : "Unplaced"]);
    await waitFor(() => {
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 175 });
      expect(container.querySelector(".world-canvas__hover")?.textContent).toContain("Neighbour");
    });
    expect(api.gets()).toBe(2);
    expect(screen.queryAllByRole("alert").map((node) => node.textContent)).toEqual([]);
  });
});

describe.each(["gba", "gbc"] as const)("%s unsaved edit does not pin a map against later reloads", (family) => {
  it.each([["same-tile Shift-drag", false], ["failed placement POST", true]] as const)("%s shows the server position after a reload", async (_name, failFirst) => {
    const api = server(family, failFirst); vi.stubGlobal("fetch", api.fetcher);
    const { container } = render(family === "gba" ? <WorldCanvas /> : <GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    const canvas = container.querySelector("canvas.world-canvas__stage")!;
    // Neighbour sits at screen x 100..200. A sub-tile move stays on its tile (no POST); a 1-tile move POSTs and gets a 500.
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 70, button: 0, shiftKey: true });
    fireEvent.mouseMove(canvas, failFirst ? { clientX: 120, clientY: 60, shiftKey: true } : { clientX: 121, clientY: 71, shiftKey: true });
    fireEvent.mouseUp(canvas);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    if (!failFirst) expect(api.posted).toEqual([]);
    const drop = new MouseEvent("drop", { bubbles: true, clientX: 50, clientY: 100 });
    Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "Unplaced" } });
    fireEvent(canvas, drop);
    // Plan 11 F5: a failed POST reloads too, so that case sees the rollback GET before the drop's.
    await waitFor(() => expect(api.gets()).toBe(failFirst ? 3 : 2));
    // The reload now has Neighbour at y=5 (screen y 100..200); (150,175) is inside it only once the server position shows.
    await waitFor(() => {
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 175 });
      expect(container.querySelector(".world-canvas__hover")?.textContent ?? "").toContain("Neighbour");
    });
  });
});

it("GBA group save reloads once after all members save", async () => {
  const api = server("gba"); vi.stubGlobal("fetch", api.fetcher);
  const { container } = render(<WorldCanvas />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  const canvas = container.querySelector("canvas.world-canvas__stage")!;
  fireEvent.mouseDown(canvas, { clientX: 20, clientY: 70, button: 0, ctrlKey: true });
  fireEvent.mouseDown(canvas, { clientX: 120, clientY: 70, button: 0, ctrlKey: true });
  fireEvent.mouseDown(canvas, { clientX: 20, clientY: 70, button: 0, shiftKey: true });
  fireEvent.mouseMove(canvas, { clientX: 30, clientY: 80, shiftKey: true });
  fireEvent.mouseUp(canvas);
  await waitFor(() => expect(api.gets()).toBe(2));
  expect(api.posted.sort()).toEqual(["Neighbour", "Source"]);
  expect(screen.queryAllByRole("alert").map((node) => node.textContent)).toEqual([]);
});

// Plan 11 F6: every POST and every GET after the first is resolved by hand, so each ordering is forced.
// A GET's body is the server state when it was issued; a POST changes the server state when it is resolved ok.
// A dungeon toggle POST changes the server when it is received (the server answers in order); only its response is held.
// A toggle answered with a failure never took effect: the server value is the latest toggle not failed.
function deferredServer(family: "gba" | "gbc", { failFirstGet = false } = {}) {
  const toggles: Array<{ enabled: boolean; failed: boolean; settle: (ok: boolean) => void }> = [];
  const dungeons = () => [...toggles].reverse().find((t) => !t.failed)?.enabled ?? false;
  const state: Record<string, { x: number; y: number; component: number }> = { Source: { x: 0, y: 0, component: 0 }, Neighbour: { x: 10, y: 0, component: 0 } };
  const posts: Array<{ map: string; x: number; y: number; settle: (ok: boolean) => void }> = [];
  const gets: Array<{ release: () => void; fail: () => void }> = [];
  // GETs answer at once until the test calls hold() (StrictMode mounts issue two initial GETs).
  let holding = false;
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
  const failed = { ok: false, status: 500, json: async () => ({}) } as Response;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/world/placement") {
      const p = JSON.parse(String(init?.body)) as { map: string; x: number; y: number };
      return new Promise<Response>((resolve) => posts.push({ ...p, settle: (good) => {
        if (good) state[p.map] = { x: p.x, y: p.y, component: p.map === "Unplaced" ? 1 : 0 };
        resolve(good ? ok({ ok: true }) : failed);
      } }));
    }
    if (url === "/api/world/dungeons") {
      const { enabled } = JSON.parse(String(init?.body)) as { enabled: boolean };
      return new Promise<Response>((resolve) => {
        const entry = { enabled, failed: false, settle: (good: boolean) => { entry.failed = !good; resolve(good ? ok({ dungeonAutoLayout: enabled }) : failed); } };
        toggles.push(entry);
      });
    }
    if (url === "/api/world") {
      if (failFirstGet) { failFirstGet = false; return Promise.resolve(failed); }
      const placements = Object.fromEntries(Object.entries(state).map(([map, at]) => [map, { map, ...at, width: 10, height: 10, mapType: family === "gba" ? "MAP_TYPE_TOWN" : "TOWN", manual: map !== "Neighbour" }]));
      const components = [{ index: 0, maps: ["Source", "Neighbour"], bounds: { x: 0, y: 0, width: 20, height: 10 } },
        { index: 1, maps: ["Unplaced"], bounds: { x: 0, y: 0, width: 10, height: 10 } }];
      const body = ok({ ...(family === "gbc" ? { family, blockPx: 32 } : { verticalLinks: [] }), placements, components, conflicts: [], sidecar: { dungeonAutoLayout: dungeons() } });
      if (!holding) return Promise.resolve(body);
      return new Promise<Response>((resolve) => gets.push({ release: () => resolve(body), fail: () => resolve(failed) }));
    }
    if (url === "/api/coverage") return Promise.resolve(ok(family === "gba"
      ? { mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [], byMethod: {} }
      : { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [] }));
    if (url === "/api/species") return Promise.resolve(ok([]));
    if (url.startsWith("/api/encounters/")) return Promise.resolve(ok(family === "gbc" ? { family, mapName: url.split("/").at(-1), sources: [], defects: [] } : { mapName: url.split("/").at(-1), mapId: 0, methods: [] }));
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  return { fetcher, state, posts, gets, toggles, hold: () => { holding = true; } };
}

describe.each(["gba", "gbc"] as const)("%s placement saves reconcile by version (Plan 11 F1-F6)", (family) => {
  let api: ReturnType<typeof deferredServer>;
  let canvas: Element;
  const settle = async (fn: () => void) => { await act(async () => { fn(); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
  // After Fit, world (x, y) is screen (10x, 50 + 10y); Neighbour is 10 wide and alone in screen x 100..200.
  const neighbourAt = (sy: number) => {
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: sy });
    return (document.querySelector(".world-canvas__hover")?.textContent ?? "").includes("Neighbour");
  };
  // Polled on a timer, not waitFor: each probe changes the hover text, which would re-trigger waitFor's DOM observer forever.
  const expectNeighbourY = async (y: number) => {
    let seen: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      seen = [neighbourAt(50 + 10 * y + 2), neighbourAt(50 + 10 * y - 2)];
      if (seen[0] && !seen[1]) return;
      await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    }
    expect(seen, `Neighbour at world y ${y}`).toEqual([true, false]);
  };
  // Shift-drag Neighbour from world y `from` to `to` (a whole-tile move POSTs; `to === from` moves 1 px and POSTs nothing).
  const dragNeighbour = (from: number, to: number) => {
    const sy = 50 + 10 * from + 5;
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: sy, button: 0, shiftKey: true });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: to === from ? sy + 1 : sy + 10 * (to - from), shiftKey: true });
    fireEvent.mouseUp(canvas);
  };
  // A rail drop of Unplaced: its own POST, whose success issues a world GET while Neighbour's save is still open.
  const dropUnplaced = () => {
    const drop = new MouseEvent("drop", { bubbles: true, clientX: 50, clientY: 100 });
    Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "Unplaced" } });
    fireEvent(canvas, drop);
  };
  const postFor = async (map: string, nth = 1) => { await waitFor(() => expect(api.posts.filter((p) => p.map === map).length).toBeGreaterThanOrEqual(nth)); return api.posts.filter((p) => p.map === map)[nth - 1]!; };
  const getNumber = async (n: number) => { await waitFor(() => expect(api.gets.length).toBeGreaterThanOrEqual(n)); return api.gets[n - 1]!; };

  const mount = async (strict = false) => {
    api = deferredServer(family); vi.stubGlobal("fetch", api.fetcher);
    const ui = family === "gba" ? <WorldCanvas /> : <GbcWorldCanvas time="day" />;
    const { container } = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    canvas = container.querySelector("canvas.world-canvas__stage")!;
    await expectNeighbourY(0);
    api.hold();
  };

  it("a late failure of an older save does not move a newer gesture", async () => {
    await mount();
    dragNeighbour(0, -1);
    const first = await postFor("Neighbour");
    dragNeighbour(-1, -2);
    const second = await postFor("Neighbour", 2);
    await settle(() => first.settle(false));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    { const g = await getNumber(1); await settle(() => g.release()); }
    await expectNeighbourY(-2);
    await settle(() => second.settle(true));
    { const g = await getNumber(2); await settle(() => g.release()); }
    await expectNeighbourY(-2);
  });

  it.each([["succeeds", true], ["fails", false]] as const)("a no-op during an in-flight save takes that save's outcome when it %s", async (_name, good) => {
    await mount();
    dragNeighbour(0, -1);
    const save = await postFor("Neighbour");
    dragNeighbour(-1, -1);
    dropUnplaced();
    { const p = await postFor("Unplaced"); await settle(() => p.settle(true)); }
    // This GET was issued while Neighbour's save was open: the no-op must not let it show the old server position.
    { const g = await getNumber(1); await settle(() => g.release()); }
    await expectNeighbourY(-1);
    await settle(() => save.settle(good));
    { const g = await getNumber(2); await settle(() => g.release()); }
    await expectNeighbourY(good ? -1 : 0);
    // Settled now: a later server-side move shows on the next GET.
    api.state.Neighbour = { x: 10, y: 3, component: 0 };
    dropUnplaced();
    { const p = await postFor("Unplaced", 2); await settle(() => p.settle(true)); }
    { const g = await getNumber(3); await settle(() => g.release()); }
    await expectNeighbourY(3);
  });

  it.each([["", false], [" under StrictMode", true]] as const)("a GET issued before a save's acknowledgement keeps the local position when it lands after it%s", async (_name, strict) => {
    await mount(strict);
    dragNeighbour(0, -1);
    const save = await postFor("Neighbour");
    dropUnplaced();
    { const p = await postFor("Unplaced"); await settle(() => p.settle(true)); }
    const stale = await getNumber(1);
    // Same tick: the acknowledgement lands first, then the stale GET, before the reload it requested can cancel it.
    await settle(() => { save.settle(true); stale.release(); });
    await expectNeighbourY(-1);
    const fresh = await getNumber(2);
    await settle(() => fresh.release());
    await expectNeighbourY(-1);
  });

  it("A to B to A with B in flight shows A", async () => {
    await mount();
    dragNeighbour(0, -1);
    const toB = await postFor("Neighbour");
    dragNeighbour(-1, 0);
    const toA = await postFor("Neighbour", 2);
    await settle(() => toB.settle(true));
    { const g = await getNumber(1); await settle(() => g.release()); }
    await expectNeighbourY(0);
    await settle(() => toA.settle(true));
    { const g = await getNumber(2); await settle(() => g.release()); }
    await expectNeighbourY(0);
  });

  it("a gesture started between a failure and its reload keeps its own position", async () => {
    await mount();
    dragNeighbour(0, -1);
    { const p = await postFor("Neighbour"); await settle(() => p.settle(false)); }
    const rollback = await getNumber(1);
    dragNeighbour(-1, -2);
    await postFor("Neighbour", 2);
    await settle(() => rollback.release());
    await expectNeighbourY(-2);
  });

  it("a failed save reverts to the server position once its reload lands", async () => {
    await mount();
    dragNeighbour(0, -1);
    { const p = await postFor("Neighbour"); await settle(() => p.settle(false)); }
    await expectNeighbourY(-1);
    { const g = await getNumber(1); await settle(() => g.release()); }
    await expectNeighbourY(0);
  });

  // A rollback GET landing in the same batch as another reload's issue still reconciles with its own snapshot.
  it("a rollback lands in the same batch as a newer reload, which then fails", async () => {
    await mount();
    dragNeighbour(0, -1);
    { const p = await postFor("Neighbour"); await settle(() => p.settle(false)); }
    const rollback = await getNumber(1);
    dropUnplaced();
    const drop = await postFor("Unplaced");
    await settle(() => { drop.settle(true); rollback.release(); });
    await expectNeighbourY(0);
    { const g = await getNumber(2); await settle(() => g.fail()); }
    await expectNeighbourY(0);
  });

  it("a failed rollback reload keeps the local position and the save error", async () => {
    await mount();
    dragNeighbour(0, -1);
    { const p = await postFor("Neighbour"); await settle(() => p.settle(false)); }
    { const g = await getNumber(1); await settle(() => g.fail()); }
    await expectNeighbourY(-1);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
});

it("GBA unchanged group members during an in-flight save keep the local position until it lands", async () => {
  const api = deferredServer("gba"); vi.stubGlobal("fetch", api.fetcher);
  const { container } = render(<WorldCanvas />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  const canvas = container.querySelector("canvas.world-canvas__stage")!;
  api.hold();
  const settle = async (fn: () => void) => { await act(async () => { fn(); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
  const neighbourAt = (sy: number) => {
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: sy });
    return (container.querySelector(".world-canvas__hover")?.textContent ?? "").includes("Neighbour");
  };
  // Polled on a timer, not waitFor: each probe changes the hover text, which would re-trigger waitFor's DOM observer forever.
  const expectNeighbourY = async (y: number) => {
    let seen: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      seen = [neighbourAt(50 + 10 * y + 2), neighbourAt(50 + 10 * y - 2)];
      if (seen[0] && !seen[1]) return;
      await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    }
    expect(seen, `Neighbour at world y ${y}`).toEqual([true, false]);
  };
  await expectNeighbourY(0);
  // Neighbour alone to y=-1; its POST stays open.
  fireEvent.mouseDown(canvas, { clientX: 120, clientY: 55, button: 0, shiftKey: true });
  fireEvent.mouseMove(canvas, { clientX: 120, clientY: 45, shiftKey: true });
  fireEvent.mouseUp(canvas);
  await waitFor(() => expect(api.posts.length).toBe(1));
  const save = api.posts[0]!;
  // Select both, then a sub-tile group move: both members end unchanged and POST nothing.
  fireEvent.mouseDown(canvas, { clientX: 20, clientY: 70, button: 0, ctrlKey: true }); fireEvent.mouseUp(canvas);
  fireEvent.mouseDown(canvas, { clientX: 120, clientY: 45, button: 0, ctrlKey: true }); fireEvent.mouseUp(canvas);
  fireEvent.mouseDown(canvas, { clientX: 20, clientY: 70, button: 0, shiftKey: true });
  fireEvent.mouseMove(canvas, { clientX: 21, clientY: 71, shiftKey: true });
  fireEvent.mouseUp(canvas);
  expect(api.posts.length).toBe(1);
  const drop = new MouseEvent("drop", { bubbles: true, clientX: 50, clientY: 100 });
  Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "Unplaced" } });
  fireEvent(canvas, drop);
  await waitFor(() => expect(api.posts.length).toBe(2));
  await settle(() => api.posts[1]!.settle(true));
  await waitFor(() => expect(api.gets.length).toBe(1));
  await settle(() => api.gets[0]!.release());
  await expectNeighbourY(-1);
  await settle(() => save.settle(true));
  await waitFor(() => expect(api.gets.length).toBe(2));
  await settle(() => api.gets[1]!.release());
  await expectNeighbourY(-1);
});

// Plan 11 Task 6 (F12 toggle generations, F11 failed reload keeps the canvas), both families, deferred fetches.
describe.each(["gba", "gbc"] as const)("%s dungeon switch and reload alert (Plan 11 F11, F12)", (family) => {
  let api: ReturnType<typeof deferredServer>;
  let canvas: Element;
  const settle = async (fn: () => void) => { await act(async () => { fn(); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
  const sw = () => screen.getByRole("switch", { name: "Dungeon auto-layout" });
  const shown = () => sw().getAttribute("aria-checked");
  const reloadAlert = () => screen.queryAllByRole("alert").find((node) => node.textContent?.includes("Could not reload the world"));
  const toggle = async (nth: number) => { await waitFor(() => expect(api.toggles.length).toBeGreaterThanOrEqual(nth)); return api.toggles[nth - 1]!; };
  const getNumber = async (n: number) => { await waitFor(() => expect(api.gets.length).toBeGreaterThanOrEqual(n)); return api.gets[n - 1]!; };
  const releaseAll = async () => { for (const g of [...api.gets]) await settle(() => g.release()); };
  const dropUnplaced = () => {
    const drop = new MouseEvent("drop", { bubbles: true, clientX: 50, clientY: 100 });
    Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "Unplaced" } });
    fireEvent(canvas, drop);
  };
  const mount = async () => {
    api = deferredServer(family); vi.stubGlobal("fetch", api.fetcher);
    const { container } = render(family === "gba" ? <WorldCanvas /> : <GbcWorldCanvas time="day" />);
    await waitFor(() => expect(shown()).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    canvas = container.querySelector("canvas.world-canvas__stage")!;
    api.hold();
  };
  // A world reload the switch did not ask for: a rail drop whose POST succeeds.
  const unrelatedReload = async (n: number) => {
    dropUnplaced();
    await waitFor(() => expect(api.posts.length).toBeGreaterThanOrEqual(n));
    await settle(() => api.posts[n - 1]!.settle(true));
  };

  it("two successes resolving in order never show the older value", async () => {
    await mount();
    fireEvent.click(sw()); fireEvent.click(sw());
    expect(shown()).toBe("false");
    const first = await toggle(1), second = await toggle(2);
    await settle(() => first.settle(true));
    await releaseAll();
    expect(shown()).toBe("false");
    await settle(() => second.settle(true));
    await releaseAll();
    expect(shown()).toBe("false");
  });

  it("two successes resolving reversed end on the latest value", async () => {
    await mount();
    fireEvent.click(sw()); fireEvent.click(sw());
    const first = await toggle(1), second = await toggle(2);
    await settle(() => second.settle(true));
    await releaseAll();
    expect(shown()).toBe("false");
    const gets = api.gets.length;
    // The older success lands last: ignored, so no reload and the switch keeps the latest value.
    await settle(() => first.settle(true));
    expect(api.gets.length).toBe(gets);
    expect(shown()).toBe("false");
  });

  it("an older failure with a newer toggle pending keeps the pending value and shows no error", async () => {
    await mount();
    fireEvent.click(sw()); fireEvent.click(sw()); fireEvent.click(sw());
    expect(shown()).toBe("true");
    const second = await toggle(2);
    await toggle(3);
    await settle(() => second.settle(false));
    expect(shown()).toBe("true");
    expect(screen.queryAllByRole("alert").map((node) => node.textContent)).toEqual([]);
  });

  it("the latest failure after an older success clears pending, shows the error and reloads the server value", async () => {
    await mount();
    fireEvent.click(sw()); fireEvent.click(sw());
    const first = await toggle(1), second = await toggle(2);
    // The older success is ignored: no reload of its own.
    await settle(() => first.settle(true));
    expect(api.gets.length).toBe(0);
    await settle(() => second.settle(false));
    expect(shown()).toBe("false");
    expect(screen.queryAllByRole("alert").length).toBeGreaterThan(0);
    // The failure's reload shows what the server holds: the older toggle, on.
    { const g = await getNumber(1); await settle(() => g.release()); }
    await waitFor(() => expect(shown()).toBe("true"));
  });

  it("an older toggle's reload landing after a newer click keeps the newer pending value", async () => {
    await mount();
    fireEvent.click(sw());
    { const t = await toggle(1); await settle(() => t.settle(true)); }
    // This reload was issued while the server said on.
    const older = await getNumber(1);
    fireEvent.click(sw());
    expect(shown()).toBe("false");
    await settle(() => older.release());
    expect(shown()).toBe("false");
  });

  it("a failed latest toggle drops its pending value at once", async () => {
    await mount();
    fireEvent.click(sw());
    expect(shown()).toBe("true");
    { const t = await toggle(1); await settle(() => t.settle(false)); }
    expect(shown()).toBe("false");
    expect(screen.queryAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("an unrelated GET landing between the last success and its reload does not clear pending", async () => {
    await mount();
    await unrelatedReload(1);
    const unrelated = await getNumber(1);
    fireEvent.click(sw());
    const post = await toggle(1);
    // The unrelated GET (issued before the toggle, so it still says off) lands in the same tick as the success.
    await settle(() => { post.settle(true); unrelated.release(); });
    expect(shown()).toBe("true");
    await releaseAll();
    expect(shown()).toBe("true");
  });

  it("a failed reload after the latest success keeps pending and shows the reload alert", async () => {
    await mount();
    fireEvent.click(sw());
    { const t = await toggle(1); await settle(() => t.settle(true)); }
    { const g = await getNumber(1); await settle(() => g.fail()); }
    await waitFor(() => expect(reloadAlert()).toBeTruthy());
    expect(shown()).toBe("true");
  });

  it("a failed reload keeps the canvas working; Dismiss clears the alert", async () => {
    await mount();
    await unrelatedReload(1);
    { const g = await getNumber(1); await settle(() => g.fail()); }
    await waitFor(() => expect(reloadAlert()).toBeTruthy());
    expect(screen.queryByText(/Could not load the world/)).toBeNull();
    // Still interactive: a plain drag on empty space pans (Neighbour moves 50 px left), hover finds it, a Shift-drag POSTs.
    fireEvent.mouseDown(canvas, { clientX: 150, clientY: 180, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 180 });
    fireEvent.mouseUp(canvas);
    fireEvent.mouseMove(canvas, { clientX: 60, clientY: 75 });
    expect(document.querySelector(".world-canvas__hover")?.textContent).toContain("Neighbour");
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 180, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 180 });
    fireEvent.mouseUp(canvas);
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 75 });
    expect(document.querySelector(".world-canvas__hover")?.textContent).toContain("Neighbour");
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 55, button: 0, shiftKey: true });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 45, shiftKey: true });
    fireEvent.mouseUp(canvas);
    await waitFor(() => expect(api.posts.some((p) => p.map === "Neighbour")).toBe(true));
    fireEvent.click(within(reloadAlert()! as HTMLElement).getByRole("button", { name: "Dismiss error" }));
    expect(reloadAlert()).toBeUndefined();
  });

  it("a successful reload after a failed one clears the alert", async () => {
    await mount();
    await unrelatedReload(1);
    { const g = await getNumber(1); await settle(() => g.fail()); }
    await waitFor(() => expect(reloadAlert()).toBeTruthy());
    await unrelatedReload(2);
    { const g = await getNumber(2); await settle(() => g.release()); }
    await waitFor(() => expect(reloadAlert()).toBeUndefined());
  });

  it("a failed first load still shows the placeholder, not the reload alert", async () => {
    api = deferredServer(family, { failFirstGet: true }); vi.stubGlobal("fetch", api.fetcher);
    render(family === "gba" ? <WorldCanvas /> : <GbcWorldCanvas time="day" />);
    await waitFor(() => expect(screen.getByText(/Could not load the world/)).toBeTruthy());
    expect(reloadAlert()).toBeUndefined();
  });
});
