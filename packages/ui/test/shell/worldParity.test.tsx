import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import { WorldCanvas } from "../../src/components/WorldCanvas.js";
import { GbcWorldCanvas } from "../../src/gbc/GbcWorldCanvas.js";
import { restoreViewport, stubViewport } from "../viewport.js";

/**
 * Plan 10b Task 7b (SR8, SR9): the auto-layout toggle and placements refresh every world consumer, in both families,
 * with no view switch. Stateful fake server: Town and Gate form one two-map component; Hut and Cave are singletons.
 * Auto-layout on: all four are placed (Cave is INDOOR, so its tree row is greyed). Off: Hut and Cave leave
 * `placements` unless manually placed. Every fetch outside the routes below rejects (a strict mock): an unexpected
 * request surfaces as a role="alert".
 */
type Family = "gba" | "gbc";
const TYPES = { gba: { town: "MAP_TYPE_TOWN", indoor: "MAP_TYPE_INDOOR" }, gbc: { town: "TOWN", indoor: "INDOOR" } } as const;
const BOUNDS = { Town: [0, 0, 10, 10], Gate: [10, 0, 4, 10], Hut: [30, 0, 5, 5], Cave: [40, 0, 5, 5] } as const;

function makeServer(family: Family, opts: { staleWorld?: boolean } = {}) {
  const t = TYPES[family];
  let layout = true;
  const manual = new Map<string, { x: number; y: number }>();
  const calls: Array<{ method: string; url: string }> = [];
  const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  const type = (name: string) => (name === "Cave" ? t.indoor : t.town);
  const world = () => {
    const placements: Record<string, unknown> = {};
    ComponentsOf: for (const [index, maps] of [["Town", "Gate"], ["Hut"], ["Cave"]].entries()) {
      for (const name of maps) {
        const m = opts.staleWorld ? undefined : manual.get(name); // staleWorld: GET /api/world never reflects a placement
        if (!m && maps.length === 1 && !layout) continue ComponentsOf;
        const [x, y, width, height] = BOUNDS[name as keyof typeof BOUNDS];
        placements[name] = { map: name, x: m?.x ?? x, y: m?.y ?? y, width, height, component: index, mapType: type(name), manual: !!m };
      }
    }
    const components = [["Town", "Gate"], ["Hut"], ["Cave"]].map((maps, index) => {
      const [x, y] = BOUNDS[maps[0] as keyof typeof BOUNDS];
      return { index, maps, bounds: maps.length === 2 ? { x, y, width: 14, height: 10 } : { x, y, width: BOUNDS[maps[0] as keyof typeof BOUNDS][2], height: BOUNDS[maps[0] as keyof typeof BOUNDS][3] } };
    });
    return family === "gbc"
      ? { family: "gbc", blockPx: 32, placements, components, conflicts: [], sidecar: { dungeonAutoLayout: layout } }
      : { placements, components, conflicts: [], verticalLinks: [], sidecar: { version: 1, dungeonAutoLayout: layout, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } } };
  };
  const coverage = family === "gbc"
    ? { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [] }
    : { mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [], byMethod: { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 } };
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url === "/api/groups") return ok({ groupOrder: ["All"], groups: { All: ["Town", "Gate", "Hut", "Cave"] } });
    if (url === "/api/world" && method === "GET") return ok(world());
    if (url === "/api/world/dungeons" && method === "POST") {
      layout = (JSON.parse(String(init!.body)) as { enabled: boolean }).enabled;
      return ok({ dungeonAutoLayout: layout });
    }
    if (url === "/api/world/placement" && method === "POST") {
      const body = JSON.parse(String(init!.body)) as { map: string; x: number; y: number };
      manual.set(body.map, { x: body.x, y: body.y });
      return ok({ ok: true });
    }
    if (url === "/api/coverage") return ok(coverage);
    if (url === "/api/species") return ok([]);
    const enc = new RegExp("^/api/encounters/(.+)$").exec(url);
    if (enc) return ok(family === "gbc" ? { family: "gbc", mapName: enc[1], sources: [], defects: [] } : { mapName: enc[1], mapId: 0, methods: [] });
    return Promise.reject(new Error(`unexpected fetch ${method} ${url}`));
  });
  return { fetcher, calls };
}

/** Only the greyed class matters; the row is the tree button named `name`. */
const row = (name: string) => within(screen.getByRole("navigation", { name: "Maps" })).getByRole("button", { name });
const greyed = (name: string) => row(name).className.includes("map-tree__map--greyed");
const rail = () => screen.getByRole("complementary", { name: "Unplaced maps" });
const railItems = () => within(rail()).queryAllByRole("button").map((b) => b.textContent);
const world = () => document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
const dt = () => {
  const data: Record<string, string> = {};
  return { setData: (k: string, v: string) => { data[k] = v; }, getData: (k: string) => data[k] ?? "" };
};
const drop = (transfer: ReturnType<typeof dt>) => {
  const ev = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 });
  Object.defineProperty(ev, "dataTransfer", { value: transfer });
  fireEvent(world(), ev);
};

async function mountWorld(family: Family, opts: { staleWorld?: boolean } = {}) {
  stubViewport(200);
  const server = makeServer(family, opts);
  vi.stubGlobal("fetch", server.fetcher);
  render(<FamilyApp adapter={family === "gba" ? gbaAdapter : gbcAdapter} />);
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" })).toBeTruthy());
  await waitFor(() => expect(greyed("Cave")).toBe(true)); // visibility landed: INDOOR is greyed, Hut is not
  expect(greyed("Hut")).toBe(false);
  return server;
}
const toggle = () => screen.getByRole("switch", { name: "Dungeon auto-layout" });

afterEach(() => {
  vi.unstubAllGlobals();
  restoreViewport();
});

describe.each<Family>(["gba", "gbc"])("world parity (Plan 10b SR8, SR9): %s", (family) => {
  it("shows the Dungeon auto-layout switch and the Unplaced rail", async () => {
    await mountWorld(family);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(railItems()).toEqual([]);
  });

  it("SR9: toggling off greys a singleton and lists it in the rail; toggling on un-greys it, with no view switch", async () => {
    const server = await mountWorld(family);
    fireEvent.click(toggle());
    await waitFor(() => expect(greyed("Hut")).toBe(true));
    await waitFor(() => expect(railItems()).toEqual(["Cave", "Hut"]));
    expect(greyed("Town")).toBe(false);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(server.calls.filter((c) => c.url === "/api/world/dungeons")).toEqual([{ method: "POST", url: "/api/world/dungeons" }]);

    fireEvent.click(toggle());
    await waitFor(() => expect(greyed("Hut")).toBe(false));
    await waitFor(() => expect(railItems()).toEqual([]));
    expect(screen.getByRole("button", { name: "World" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryAllByRole("alert").map((a) => a.textContent)).toEqual([]);
  });

  it("SR8: with auto-layout on, a tree drop of a greyed map un-greys its row", async () => {
    const server = await mountWorld(family);
    const transfer = dt();
    fireEvent.dragStart(row("Cave"), { dataTransfer: transfer });
    drop(transfer);
    await waitFor(() => expect(greyed("Cave")).toBe(false));
    expect(server.calls).toContainEqual({ method: "POST", url: "/api/world/placement" });
    expect(screen.queryAllByRole("alert").map((a) => a.textContent)).toEqual([]);
  });

  it("SR8: with auto-layout off, a tree drop of a map absent from the world un-greys its row", async () => {
    const server = await mountWorld(family);
    fireEvent.click(toggle());
    await waitFor(() => expect(greyed("Hut")).toBe(true));
    const transfer = dt();
    fireEvent.dragStart(row("Hut"), { dataTransfer: transfer });
    drop(transfer);
    await waitFor(() => expect(greyed("Hut")).toBe(false));
    expect(greyed("Cave")).toBe(true);
    expect(server.calls).toContainEqual({ method: "POST", url: "/api/world/placement" });
    expect(screen.queryAllByRole("alert").map((a) => a.textContent)).toEqual([]);
  });

  it("SR8: the shell merge alone un-greys an absent map, even if /api/world still omits the placement", async () => {
    await mountWorld(family, { staleWorld: true });
    fireEvent.click(toggle());
    await waitFor(() => expect(greyed("Hut")).toBe(true));
    const transfer = dt();
    fireEvent.dragStart(row("Hut"), { dataTransfer: transfer });
    drop(transfer);
    await waitFor(() => expect(greyed("Hut")).toBe(false));
    expect(greyed("Cave")).toBe(true);
  });

  it("SR8: with auto-layout off, a rail drop un-greys the row and leaves the rail", async () => {
    await mountWorld(family);
    fireEvent.click(toggle());
    await waitFor(() => expect(railItems()).toEqual(["Cave", "Hut"]));
    const transfer = dt();
    fireEvent.dragStart(within(rail()).getByRole("button", { name: "Hut" }), { dataTransfer: transfer });
    drop(transfer);
    await waitFor(() => expect(greyed("Hut")).toBe(false));
    await waitFor(() => expect(railItems()).toEqual(["Cave"]));
    expect(greyed("Cave")).toBe(true);
    expect(screen.queryAllByRole("alert").map((a) => a.textContent)).toEqual([]);
  });
});

describe("onPlacementsSaved (Plan 10b, Plan 11 F7)", () => {
  it("GBA WorldCanvas fires it after a rail drop", async () => {
    stubViewport(200);
    const server = makeServer("gba");
    vi.stubGlobal("fetch", server.fetcher);
    const onPlacementsSaved = vi.fn();
    const { container } = render(<WorldCanvas onPlacementsSaved={onPlacementsSaved} />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" })).toBeTruthy());
    fireEvent.click(screen.getByRole("switch", { name: "Dungeon auto-layout" }));
    await waitFor(() => expect(railItems()).toEqual(["Cave", "Hut"]));
    const transfer = dt();
    fireEvent.dragStart(within(rail()).getByRole("button", { name: "Hut" }), { dataTransfer: transfer });
    drop(transfer);
    await waitFor(() => expect(onPlacementsSaved).toHaveBeenCalledWith(["Hut"]));
    expect(container.querySelector(".world-canvas__status")?.textContent).toContain("unplaced 1");
  });

  it("GbcWorldCanvas: a rail drop posts the placement and fires it", async () => {
    stubViewport(200);
    const server = makeServer("gbc");
    vi.stubGlobal("fetch", server.fetcher);
    const onPlacementsSaved = vi.fn();
    render(<GbcWorldCanvas time="day" onPlacementsSaved={onPlacementsSaved} />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" })).toBeTruthy());
    fireEvent.click(screen.getByRole("switch", { name: "Dungeon auto-layout" }));
    await waitFor(() => expect(railItems()).toEqual(["Cave", "Hut"]));
    const transfer = dt();
    fireEvent.dragStart(within(rail()).getByRole("button", { name: "Hut" }), { dataTransfer: transfer });
    drop(transfer);
    await waitFor(() => expect(onPlacementsSaved).toHaveBeenCalledWith(["Hut"]));
    expect(server.calls).toContainEqual({ method: "POST", url: "/api/world/placement" });
    await waitFor(() => expect(railItems()).toEqual(["Cave"]));
  });
});
