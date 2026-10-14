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

vi.mock("../../src/gbc/GbcWorldCanvas.js", () => ({ GbcWorldCanvas: (props: { onOpenWarpDestination?: (name: string) => void }) => <button onClick={() => props.onOpenWarpDestination?.("OlivinePort")}>Open warp destination</button> }));

it.each(["begin", "apply", "end"])("protects held %s, saves the shared session, and keeps World mounted", async (held) => {
  const { f, calls } = mockFetch();
  const implementation = f.getMockImplementation()!;
  let release!: () => void;
  f.mockImplementation((url, init) => url.endsWith(`/paint/${held}`) ? new Promise<Response>((resolve) => { release = () => { implementation(url, init).then(resolve); }; }) : implementation(url, init));
  render(<GbcApp root="/x" />);
  await screen.findByRole("button", { name: "OlivinePort" });
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  const world = screen.getByRole("button", { name: "Open warp destination" });
  world.focus();
  fireEvent.click(world);
  const dialog = await screen.findByRole("dialog", { name: "OlivinePort preview" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "pencil" })).toBeTruthy());
  fireEvent.click(within(dialog).getByRole("button", { name: "pencil" }));
  fireEvent.click(within(dialog).getByLabelText("metatile 0x1"));
  const stage = dialog.querySelector("canvas.map-canvas__stage")!;
  fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 40, clientY: 40, button: 0 });
  await waitFor(() => expect(release).toBeTypeOf("function"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(dialog.isConnected).toBe(true);
  expect((within(dialog).getByRole("button", { name: "Save Changes" }) as HTMLButtonElement).closest("fieldset")!.disabled).toBe(true);
  if (held === "end") {
    fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 });
    fireEvent.mouseUp(stage, { clientX: 40, clientY: 40, button: 0 });
  }
  await act(async () => release());
  await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());
  await waitFor(() => expect(calls).toContain("POST /api/edit/OlivinePort/paint/end"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  const save = await screen.findByRole("dialog", { name: /Save/ });
  fireEvent.keyDown(save, { key: "Escape" });
  expect(dialog.isConnected).toBe(true);
  expect(screen.getByRole("button", { name: "Open warp destination" })).toBe(world);
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: /Save/ })).getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(screen.queryByTestId("dirty-indicator")).toBeNull());
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(calls.filter((call) => call.endsWith("/paint/begin"))).toHaveLength(1);
  expect(document.activeElement).toBe(world);
  expect(dialog.isConnected).toBe(false);
  expect(screen.getByRole("button", { name: "Open warp destination" })).toBe(world);
});


it.each(["move", "add", "delete"])("keeps a pending GBC event %s owned by the popup", async (operation) => {
  const { f, calls } = mockFetch(); const original = f.getMockImplementation()!;
  const events = { ...EMPTY_EVENTS, warps: [{ x: 0, y: 0, mapConst: "OLIVINE_CITY", destWarp: 1, lineIndex: 0 }] };
  let finish!: () => void;
  f.mockImplementation((url, init) => url === "/api/map/OlivinePort" ? ok({ ...payload("OlivinePort"), events })
    : url.endsWith(`/event/${operation}`) ? new Promise<Response>((resolve) => { finish = () => { ok({ ...CLEAN, events, isDirty: true, canUndo: true }).then(resolve); }; }) : original(url, init));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<GbcApp root="/x" />); await screen.findByRole("button", { name: "OlivinePort" });
  fireEvent.click(screen.getByRole("button", { name: "World" }));
  fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  const dialog = await screen.findByRole("dialog", { name: "OlivinePort preview" });
  await within(dialog).findByRole("button", { name: "pencil" });
  const stage = dialog.querySelector("canvas.map-canvas__stage")!;
  fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 });
  fireEvent.mouseUp(stage, { clientX: 40, clientY: 40, button: 0 });
  if (operation === "move") {
    const x = within(dialog).getByLabelText("X (steps)");
    fireEvent.change(x, { target: { value: "1" } }); fireEvent.blur(x);
  } else fireEvent.click(within(dialog).getByRole("button", { name: operation === "add" ? "Duplicate" : "Delete" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(dialog.isConnected).toBe(true);
  expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
  fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 });
  expect(calls.filter((call) => call.endsWith("/paint/begin"))).toHaveLength(0);
  await act(async () => finish());
  await screen.findByTestId("dirty-indicator");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(await screen.findByRole("dialog", { name: "Save changes" })).toBeTruthy();
});


it("blocks GBC editing after failed saved-seed reload until retry succeeds", async () => {
  const { f, calls } = mockFetch(); const original = f.getMockImplementation()!;
  let saved = false; let refreshes = 0;
  f.mockImplementation((url, init) => {
    if (url.endsWith("/commit")) saved = true;
    if (url === "/api/map/OlivinePort" && saved && ++refreshes === 1) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "reload failed" }) } as Response);
    return original(url, init);
  });
  render(<GbcApp root="/x" />); await screen.findByRole("button", { name: "OlivinePort" });
  fireEvent.click(screen.getByRole("button", { name: "World" })); fireEvent.click(screen.getByRole("button", { name: "Open warp destination" }));
  const popup = await screen.findByRole("dialog", { name: "OlivinePort preview" });
  fireEvent.click(await within(popup).findByRole("button", { name: "pencil" }));
  fireEvent.click(within(popup).getByLabelText("metatile 0x1"));
  const stage = popup.querySelector("canvas.map-canvas__stage")!;
  const paint = () => { fireEvent.mouseDown(stage, { clientX: 40, clientY: 40, button: 0 }); fireEvent.mouseUp(stage, { clientX: 40, clientY: 40, button: 0 }); };
  paint(); await screen.findByTestId("dirty-indicator");
  await waitFor(() => expect(within(popup).getByRole("button", { name: "Save Changes" }).closest("fieldset")!.disabled).toBe(false));
  fireEvent.click(within(popup).getByRole("button", { name: "Save Changes" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Save changes" })).getByRole("button", { name: "Save Changes" }));
  const retry = await within(popup).findByRole("button", { name: "Retry reload" });
  expect(retry.closest("fieldset")).toBeNull();
  expect(within(popup).getByRole("alert").textContent).toMatch(/could not reload.*500/);
  expect(within(popup).getByRole("button", { name: "pencil" }).closest("fieldset")!.disabled).toBe(true);
  paint(); fireEvent.click(within(popup).getByRole("button", { name: "Close" })); fireEvent.keyDown(popup, { key: "Escape" });
  expect(popup.isConnected).toBe(true);
  expect(calls.filter((call) => call.endsWith("/paint/begin"))).toHaveLength(1);
  retry.focus(); fireEvent.click(retry);
  await waitFor(() => expect(within(popup).queryByRole("button", { name: "Retry reload" })).toBeNull());
  expect(document.activeElement).toBe(within(popup).getByRole("button", { name: "Close" }));
  expect(within(popup).getByRole("button", { name: "pencil" }).closest("fieldset")!.disabled).toBe(false);
  fireEvent.click(within(popup).getByRole("button", { name: "Close" })); expect(popup.isConnected).toBe(false);
});
