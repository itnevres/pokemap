import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const { container } = render(family === "gba" ? <WorldCanvas onPlacementSaved={saved} /> : <GbcWorldCanvas time="day" onPlacementSaved={saved} />);
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
    await waitFor(() => expect(api.gets()).toBe(2));
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
