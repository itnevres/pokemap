import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { StrictMode } from "react";
import { GbcApp } from "../../src/gbc/GbcApp.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

// Plan 7 Task 5b: GBC in-context editing at the app level, the twin of AppContextEdit.test.tsx (6c E4). The World view's
// double-click enters it, the editing chrome appears around the SAME world canvas, exits go through the dirty guard, and a
// save refreshes only that map's tile. Viewport 200x200: the one 20x10-block component fits at zoom 10, pan (0, 50), so
// OlivineCity covers x [0,100) and OlivinePort x [100,200), both y [50,150).

const GROUPS = { groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", "OlivinePort"] } };
const EMPTY_EVENTS = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const WORLD = {
  family: "gbc", blockPx: 32,
  placements: {
    OlivineCity: { map: "OlivineCity", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
    OlivinePort: { map: "OlivinePort", x: 10, y: 0, width: 10, height: 10, component: 0, mapType: "TOWN", manual: false },
  },
  components: [{ index: 0, maps: ["OlivineCity", "OlivinePort"], bounds: { x: 0, y: 0, width: 20, height: 10 } }],
  conflicts: [],
};
const EMPTY_COVERAGE = { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [], unusedSpecies: [], fishGroupWithoutWater: [], defects: [] };

function payload(name: string): GbcMapPayload {
  return {
    family: "gbc",
    map: {
      name, constName: name.toUpperCase(), group: 1, number: 1, width: 10, height: 10, blkPath: `maps/${name}.blk`,
      tileset: "TILESET_OLIVINE", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P",
      fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
    },
    layout: { blkPath: `maps/${name}.blk`, width: 10, height: 10, writable: true },
    blocks: Array.from({ length: 100 }, () => ({ metatileId: 0 })),
    metatileCount: 2,
    tileset: { constName: "TILESET_OLIVINE", name: "TilesetOlivine" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], paddingWidth: 3,
  };
}

const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response);
const CLEAN = { blocks: payload("OlivinePort").blocks, events: EMPTY_EVENTS, isDirty: false, canUndo: false, canRedo: false };

/** A fetch mock for the whole GBC app plus the edit routes; `calls` records `METHOD url` in order. */
function mockFetch() {
  const calls: string[] = [];
  let state = { ...CLEAN };
  const f = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/groups") return ok(GROUPS);
    if (url === "/api/world") return ok(WORLD);
    if (url === "/api/coverage") return ok(EMPTY_COVERAGE);
    if (url === "/api/species") return ok([]);
    const enc = /^\/api\/encounters\/(.+)$/.exec(url);
    if (enc) return ok({ family: "gbc", mapName: decodeURIComponent(enc[1]!), sources: [], defects: [] });
    const m = /^\/api\/map\/(.+)$/.exec(url);
    if (m) return ok(payload(decodeURIComponent(m[1]!)));
    if (/\/discard$/.test(url)) return ok({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false });
    if (/\/plan$/.test(url)) return ok({ changes: [{ path: "maps/x.blk", kind: "binary", summary: "1 block changed" }], refusals: [] });
    if (/\/commit$/.test(url)) return ok({ changes: [], refusals: [] });
    if (/\/paint\/apply$/.test(url)) {
      const body = JSON.parse(init!.body as string) as { targets: { x: number; y: number }[]; stamp: { cells: { metatileId: number }[] } };
      const blocks = state.blocks.map((b) => ({ ...b }));
      for (const p of body.targets) blocks[p.y * 10 + p.x] = { metatileId: body.stamp.cells[0]!.metatileId };
      state = { ...state, blocks, isDirty: true, canUndo: true };
    }
    if (/\/api\/edit\//.test(url)) return ok(state);
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", f);
  return { calls, f };
}

class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  onload: (() => void) | null = null;
  constructor() { FakeImage.instances.push(this); }
}

const sizes = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 200, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 200, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (sizes.w) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes.w);
  if (sizes.h) Object.defineProperty(HTMLElement.prototype, "clientHeight", sizes.h);
});

const RECT = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON() {} };
const worldCanvas = () => document.querySelector("canvas.world-canvas__stage") as HTMLCanvasElement | null;
const contextOverlay = () => document.querySelector(".world-canvas__context");
const chrome = () => document.querySelector(".toolbar");
const status = () => document.querySelector(".world-canvas__status")?.textContent ?? "";
async function overlayStage() {
  await waitFor(() => expect(contextOverlay()?.querySelector("canvas.map-canvas__stage")).toBeTruthy());
  const stage = contextOverlay()!.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  stage.getBoundingClientRect = () => RECT;
  return stage;
}

async function startApp() {
  const mock = mockFetch();
  render(<GbcApp root="/x" />);
  await waitFor(() => expect(screen.getByText("OlivinePort")).toBeTruthy());
  return mock;
}

async function enterWorld() {
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  await waitFor(() => expect(worldCanvas()).toBeTruthy());
  const canvas = worldCanvas()!;
  canvas.getBoundingClientRect = () => RECT;
  await waitFor(() => expect(status()).toMatch(/1 components · 2 maps/));
  await waitFor(() => expect(screen.queryByText(/zoom 3%/)).toBeNull()); // the initial fit has been applied
  return canvas;
}

/** Fresh World view (nothing selected): OlivinePort's body is x in [100,200), y in [50,150). */
const dblClickPort = (canvas: HTMLCanvasElement) => fireEvent.doubleClick(canvas, { clientX: 150, clientY: 100 });

it("M5: Done waits for held paint/apply before deciding the dirty exit", async () => {
  const { f } = await startApp();
  const base = f.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  f.mockImplementation((url, init) => url.endsWith("/paint/apply") ? held.then(() => base(url, init)) : base(url, init));
  const canvas = await enterWorld();
  dblClickPort(canvas);
  const stage = await overlayStage();
  fireEvent.click(screen.getByRole("button", { name: "pencil" }));
  fireEvent.click(screen.getByLabelText("metatile 0x1"));
  fireEvent.mouseDown(stage, { clientX: 134, clientY: 52, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 134, clientY: 52, button: 0 });
  await waitFor(() => expect(f.mock.calls.some(([url]) => url.endsWith("/paint/apply"))).toBe(true));
  expect(screen.queryByTestId("dirty-indicator")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Done editing OlivinePort" }));
  await act(async () => {});
  expect(contextOverlay()).not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  await act(async () => { release(); });
  expect(await screen.findByRole("dialog", { name: "Save changes" })).toBeTruthy();
  expect(contextOverlay()).not.toBeNull();
});
