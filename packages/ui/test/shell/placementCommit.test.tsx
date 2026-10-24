import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { EngineAdapter, ShellSlots } from "../../src/shell/adapter.js";
import { restoreViewport, stubViewport } from "../viewport.js";

// React batches same-tick refresh() calls into one GET, so a per-name refresh only shows as a call count.
const visibilityRefreshes = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../src/hooks/useWorldVisibility.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/hooks/useWorldVisibility.js")>();
  return {
    ...actual,
    useWorldVisibility: (enabled: boolean) => {
      const result = actual.useWorldVisibility(enabled);
      return { ...result, refresh: () => { visibilityRefreshes.count++; result.refresh(); } };
    },
  };
});

/**
 * Plan 11 F7-F9: a placement commit marks every acknowledged name and makes one visibility refresh.
 * World 20x10 tiles in a 200x200 viewport after Fit: 10 px per tile, y offset 50. A at screen x 0-100, B 100-150,
 * C 150-200 (one component); Hut is a singleton left out of the world (auto-layout off). GET /api/world never
 * reflects a placement, so every GET after a commit is a reload, never a change of answer.
 */
type Family = "gba" | "gbc";

function server(family: Family, failing: ReadonlySet<string> = new Set()) {
  let gets = 0;
  const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/world/placement" && method === "POST") {
      const { map } = JSON.parse(String(init!.body)) as { map: string };
      return failing.has(map) ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response) : ok({ ok: true });
    }
    if (url === "/api/world" && method === "GET") {
      gets++;
      const p = (map: string, x: number, width: number) => ({ map, x, y: 0, width, height: 10, component: 0, mapType: family === "gba" ? "MAP_TYPE_TOWN" : "TOWN", manual: false });
      const placements = { A: p("A", 0, 10), B: p("B", 10, 5), C: p("C", 15, 5) };
      const components = [{ index: 0, maps: ["A", "B", "C"], bounds: { x: 0, y: 0, width: 20, height: 10 } }, { index: 1, maps: ["Hut"], bounds: { x: 0, y: 0, width: 5, height: 5 } }];
      return ok(family === "gbc"
        ? { family, blockPx: 32, placements, components, conflicts: [], sidecar: { dungeonAutoLayout: false } }
        : { placements, components, conflicts: [], verticalLinks: [], sidecar: { version: 1, dungeonAutoLayout: false, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } } });
    }
    if (url === "/api/groups") return ok({ groupOrder: ["All"], groups: { All: ["A", "B", "C", "Hut"] } });
    if (url === "/api/dungeons" && method === "GET") return ok([{ id: "d1", name: "Den", maps: ["A", "Hut"] }]);
    if (url === "/api/coverage") return ok(family === "gba"
      ? { mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [], byMethod: {} }
      : { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [] });
    if (url === "/api/species") return ok([]);
    if (url.startsWith("/api/encounters/")) return ok(family === "gbc" ? { family, mapName: url.split("/").at(-1), sources: [], defects: [] } : { mapName: url.split("/").at(-1), mapId: 0, methods: [] });
    return Promise.reject(new Error(`unexpected fetch ${method} ${url}`));
  });
  return { fetcher, gets: () => gets };
}

/** The family adapter with every markManualPlacement the shell hands its world and dungeon views recorded. */
function spied(base: EngineAdapter, marked: string[]): EngineAdapter {
  const wrap = (s: ShellSlots): ShellSlots => ({ ...s, markManualPlacement: (name) => { marked.push(name); s.markManualPlacement(name); } });
  return {
    ...base,
    useRuntime: (args) => {
      const runtime = base.useRuntime(args);
      return { ...runtime, renderWorld: (s) => runtime.renderWorld(wrap(s)), renderDungeon: (f, s) => runtime.renderDungeon(f, wrap(s)) };
    },
  };
}

const canvas = () => document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement;
const row = (name: string) => within(screen.getByRole("navigation", { name: "Maps" })).getByRole("button", { name });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

async function mount(family: Family, failing?: ReadonlySet<string>) {
  const api = server(family, failing);
  vi.stubGlobal("fetch", api.fetcher);
  const marked: string[] = [];
  render(<FamilyApp adapter={spied(family === "gba" ? gbaAdapter : gbcAdapter, marked)} />);
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(screen.getByRole("switch", { name: "Dungeon auto-layout" }).getAttribute("aria-checked")).toBe("false"));
  fireEvent.click(screen.getByRole("button", { name: "Fit" }));
  await settle();
  return { api, marked };
}

/** Ctrl-select A, B and C, then Shift-drag A one tile right and down: one commit of three moved maps. */
function groupMove() {
  for (const x of [50, 125, 175]) fireEvent.mouseDown(canvas(), { clientX: x, clientY: 100, button: 0, ctrlKey: true });
  fireEvent.mouseDown(canvas(), { clientX: 50, clientY: 100, button: 0, shiftKey: true });
  fireEvent.mouseMove(canvas(), { clientX: 60, clientY: 110, shiftKey: true });
  fireEvent.mouseUp(canvas());
}

let originalContext: typeof HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  stubViewport(200);
  originalContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ clearRect() {}, drawImage() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillText() {}, strokeRect() {}, save() {}, restore() {}, setLineDash() {}, stroke() {} });
});
afterEach(() => { HTMLCanvasElement.prototype.getContext = originalContext; restoreViewport(); vi.unstubAllGlobals(); });

// Each commit: one canvas reload plus, when any name was acknowledged, one visibility refresh (both GET /api/world).
describe("GBA group move marks acknowledged names with one visibility refresh (F7)", () => {
  it.each([
    ["all succeed", [], ["A", "B", "C"], 2],
    ["one fails", ["B"], ["A", "C"], 2],
    ["all fail", ["A", "B", "C"], [], 1],
  ] as const)("%s", async (_name, failing, expected, getsAfter) => {
    const { api, marked } = await mount("gba", new Set(failing));
    const before = api.gets();
    const refreshesBefore = visibilityRefreshes.count;
    groupMove();
    if (expected.length) await waitFor(() => expect([...marked].sort()).toEqual(expected));
    else await waitFor(() => expect(screen.queryAllByRole("alert").length).toBeGreaterThan(0));
    await settle();
    expect([...marked].sort()).toEqual(expected);
    expect(api.gets() - before).toBe(getsAfter);
    expect(visibilityRefreshes.count - refreshesBefore).toBe(expected.length ? 1 : 0);
  });
});

describe.each<Family>(["gba", "gbc"])("%s Shift-drag move marks the map (F8)", (family) => {
  it("marks it once, with one visibility refresh", async () => {
    const { api, marked } = await mount(family);
    const before = api.gets();
    fireEvent.mouseDown(canvas(), { clientX: 50, clientY: 100, button: 0, shiftKey: true });
    fireEvent.mouseMove(canvas(), { clientX: 60, clientY: 110, shiftKey: true });
    fireEvent.mouseUp(canvas());
    await waitFor(() => expect(marked).toEqual(["A"]));
    await settle();
    expect(marked).toEqual(["A"]);
    expect(api.gets() - before).toBe(2);
  });
});

it("GBA dungeon-mode placement marks the map, so its World row is not greyed (F9)", async () => {
  const { marked } = await mount("gba");
  await waitFor(() => expect(row("Hut").className).toContain("map-tree__map--greyed"));
  fireEvent.click(screen.getByRole("button", { name: "Dungeon" }));
  fireEvent.click(await screen.findByRole("button", { name: /Den/ }));
  await waitFor(() => expect(canvas()).toBeTruthy());
  await settle();
  const drop = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX: 50, clientY: 100 });
  Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "Hut" } });
  fireEvent(canvas(), drop);
  await waitFor(() => expect(marked).toEqual(["Hut"]));
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(row("Hut").className).not.toContain("map-tree__map--greyed"));
});
