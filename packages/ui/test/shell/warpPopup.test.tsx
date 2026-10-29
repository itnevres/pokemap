import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { EngineAdapter, ShellSlots } from "../../src/shell/adapter.js";
import type { SettledChain } from "../../src/shared/useStrokeChain.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import { restoreViewport, stubViewport } from "../viewport.js";

const LAYOUT = {
  map: {
    id: "MAP_PALLET_TOWN", name: "PalletTown", layout: "LAYOUT_PALLET_TOWN",
    music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  layout: {
    id: "LAYOUT_PALLET_TOWN", name: "PalletTown_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1,
    primaryTileset: "gTileset_General", secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/PalletTown/border.bin", blockdataFilepath: "data/layouts/PalletTown/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x11, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x12, collision: 0, elevation: 3, behavior: 0 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0 },
  ],
  primaryCount: 4,
  secondaryCount: 2,
};
const EMPTY_EVENTS = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };


function payload(name: string): GbcMapPayload {
  return {
    family: "gbc",
    map: {
      name, constName: name.toUpperCase(), group: 1, number: 1, width: 2, height: 1, blkPath: `maps/${name}.blk`,
      tileset: "T", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P", fishGroup: "0",
      border: 3, connectionFlags: "0", connections: [],
    },
    layout: { blkPath: `maps/${name}.blk`, width: 2, height: 1 },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }], metatileCount: 2, tileset: { constName: "TILESET_OLIVINE", name: "T" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], incomplete: [], paddingWidth: 3,
  };
}

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
function Register({ slots, chain }: { slots: ShellSlots; chain: SettledChain }) {
  useEffect(() => {
    slots.onStrokeChain(chain, true);
    return () => slots.onStrokeChain(chain, false);
  }, [slots.onStrokeChain, chain]);
  return null;
}
const popup = () => screen.getByRole("dialog", { name: /warp destination/ });
const maybePopup = () => screen.queryByRole("dialog", { name: /warp destination/ });
const button = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));
const flush = () => act(async () => {});
function cycle(panel: HTMLElement) {
  const controls = [...panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")]
    .filter((el) => !el.matches(":disabled") && el.tabIndex >= 0 && !el.hidden);
  const first = controls[0]!, last = controls.at(-1)!;
  last.focus(); fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
  first.focus(); fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
}

beforeEach(() => {
  stubViewport(200);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => { restoreViewport(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(base: EngineAdapter, options: {
  mode?: "World" | "Dungeon"; chain?: SettledChain; mapWait?: Promise<void>; paintWait?: Promise<void>;
  reloadFails?: boolean;
} = {}) {
  const gba = base.family === "gba";
  const names = gba ? ["PalletTown", "Route1", "Route2"] : ["OlivineCity", "OlivinePort", "Route2"];
  let committed = false;
  const dirtyMaps = new Set<string>();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/groups") return ok({ groupOrder: ["Maps"], groups: { Maps: names } });
    if (url.startsWith("/api/map/")) {
      const name = url.split("/").pop()!;
      if (name === names[1]) {
        await options.mapWait;
        if (committed && options.reloadFails) throw new Error("reload failed");
      }
      return ok(gba ? { ...LAYOUT, map: { ...LAYOUT.map, name } } : payload(name));
    }
    if (url === "/api/world" || url === "/api/world?scope=dungeon") {
      const placements = Object.fromEntries(names.map((map, i) => [map, {
        map, x: i * 4, y: 0, width: 2, height: 2, component: i,
        mapType: gba ? "MAP_TYPE_TOWN" : "TOWN", manual: false,
      }]));
      const components = names.map((map, i) => ({
        index: i, maps: [map], bounds: { x: i * 4, y: 0, width: 2, height: 2 },
      }));
      return ok(gba ? { placements, components, conflicts: [], verticalLinks: [],
        sidecar: { version: 1, dungeonAutoLayout: true, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } },
      } : { family: "gbc", blockPx: 32, placements, components, conflicts: [], sidecar: { dungeonAutoLayout: true } });
    }
    if (url === "/api/dungeons") return ok([{ id: "den", name: "Den", maps: names }]);
    if (url === "/api/species") return ok([]);
    if (url === "/api/coverage") return ok(gba
      ? { mapsWithEncounters: 0, encounterTables: 0, mapsWithoutEncounters: [], levelByMap: [], unusedSpecies: [], byMethod: {} }
      : { mapsWithEncounters: 0, mapsWithoutEncounters: [], sourcesByMethod: {}, levelByMap: [],
        unusedSpecies: [], fishGroupWithoutWater: [], defects: [] });
    if (url.startsWith("/api/encounters/")) return ok(gba
      ? { mapName: url.split("/").at(-1), mapId: 0, methods: [] }
      : { family: "gbc", mapName: url.split("/").at(-1), sources: [], defects: [] });
    if (url.startsWith("/api/warps/")) return ok(gba ? { mapName: url.split("/").at(-1), warps: [] }
      : { family: "gbc", mapName: url.split("/").at(-1), warps: [] });
    if (url.includes("/sign/at?")) return ok({ kind: "empty" });
    if (url.endsWith("/plan")) return ok({ changes: [{ path: "map.bin", kind: "binary", summary: "1 block changed" }],
      refusals: [] });
    if (url.endsWith("/commit")) { committed = true; return ok({ changes: [], refusals: [] }); }
    if (url.endsWith("/discard")) return ok({ isDirty: false });
    if (url.startsWith("/api/edit/")) {
      if (url.endsWith("/paint/apply")) await options.paintWait;
      const name = url.split("/")[3]!;
      if (url.endsWith("/paint/apply") || url.endsWith("/event/add")) dirtyMaps.add(name);
      return ok({ blocks: gba ? LAYOUT.blocks : payload(name).blocks, border: [], map: { ...LAYOUT.map, name },
        events: EMPTY_EVENTS, isDirty: dirtyMaps.has(name), canUndo: dirtyMaps.has(name), canRedo: dirtyMaps.has(name) });
    }
    if (url.startsWith("/api/defects/")) return ok({ defects: [], incomplete: [] });
    throw new Error(`unexpected fetch ${init?.method} ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  let slots!: ShellSlots;
  let selected: string | null = null;
  let forward!: ShellSlots["onStrokeChain"];
  const registrations = vi.fn((chain: SettledChain, mounted: boolean) => forward(chain, mounted));
  const capture = (s: ShellSlots) => { slots = s; forward = s.onStrokeChain; return { ...s, onStrokeChain: registrations }; };
  const adapter: EngineAdapter = { ...base, useRuntime(args) {
    selected = args.selected;
    const runtime = base.useRuntime(args);
    return { ...runtime,
      renderMap(s: ShellSlots) {
        const observed = capture(s);
        return <>{options.chain && <Register slots={observed} chain={options.chain} />}{runtime.renderMap(observed)}</>;
      },
      renderWorld(s: ShellSlots) {
        const observed = capture(s);
        return <>{options.chain && <Register slots={observed} chain={options.chain} />}{runtime.renderWorld(observed)}</>;
      },
      renderDungeon: (f: Set<string>, s: ShellSlots) => runtime.renderDungeon(f, capture(s)),
    };
  } };
  render(<FamilyApp adapter={adapter} />);
  await screen.findByRole("button", { name: names[0] });
  click(names[0]!);
  await screen.findByRole("button", { name: "Pencil" });
  click(options.mode ?? "World");
  if (options.mode === "Dungeon") {
    fireEvent.click(await screen.findByRole("button", { name: /^Den/ }));
  }
  await waitFor(() => expect(document.querySelector("canvas.world-canvas__stage")).not.toBeNull());
  const open = async (dest = names[1]!) => { act(() => slots.openWarpDestination(dest)); await flush(); };
  const paint = async (scope: HTMLElement) => {
    const q = within(scope);
    fireEvent.click(q.getByRole("button", { name: "Pencil" }));
    fireEvent.click(q.getByLabelText("metatile 0x1"));
    const canvas = scope.querySelector("canvas.map-canvas__stage")!;
    // Context entry centres the map in the 200px viewport; an ordinary map starts at native scale.
    const coord = canvas.closest(".map-canvas--chromeless") ? 90 : 40;
    fireEvent.mouseDown(canvas, { clientX: coord, clientY: coord, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: coord, clientY: coord, button: 0 });
    await flush();
  };
  const dirty = async () => {
    if (gba) fireEvent.click(within(popup()).getByRole("button", { name: "Add Event" }));
    else await paint(popup());
    await within(popup()).findByTestId("dirty-indicator");
  };
  return { names, open, dirty, paint, fetcher, registrations, slots: () => slots, selected: () => selected,
    calls: (suffix: string) => fetcher.mock.calls.filter(([url]) => url.endsWith(suffix)) };
}

describe.each([gbaAdapter, gbcAdapter])("$family shell warp popup", (base) => {
  it("opens the clean destination workspace and closes to the source with focus restored", async () => {
    const h = await setup(base);
    const opener = document.querySelector<HTMLCanvasElement>("canvas.world-canvas__stage")!;
    opener.focus();
    await h.open();
    expect(h.selected()).toBe(h.names[1]);
    expect(within(popup()).getByRole("button", { name: "Pencil" })).toBeTruthy();
    expect(popup().querySelector(".edit-rail")).not.toBeNull();
    const close = within(popup()).getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    await waitFor(() => expect(maybePopup()).toBeNull());
    expect(h.selected()).toBe(h.names[0]);
    expect(document.activeElement).toBe(opener);
  });

  it("prompts on dirty open and Cancel leaves the source selected without a popup", async () => {
    const h = await setup(base);
    act(() => h.slots().enterContext(h.names[0]!)); await flush();
    const host = document.querySelector<HTMLElement>(".app__canvas")!;
    if (base.family === "gba") click("Add Event"); else await h.paint(host);
    await screen.findByTestId("dirty-indicator");
    await h.open();
    expect(screen.getByText(`You have unsaved changes on ${h.names[0]}.`)).toBeTruthy();
    click("Cancel");
    expect(maybePopup()).toBeNull(); expect(h.selected()).toBe(h.names[0]);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
  });

  it.each(["Cancel", "Discard", "Save"])("dirty close: %s preserves or returns through the guard", async (action) => {
    const h = await setup(base); await h.open(); await h.dirty();
    fireEvent.click(within(popup()).getByRole("button", { name: "Close" })); await flush();
    const prompt = screen.getByText(`You have unsaved changes on ${h.names[1]}.`).closest('[role="dialog"]')!;
    cycle(prompt as HTMLElement);
    fireEvent.click(within(prompt as HTMLElement).getByRole("button", { name: action }));
    if (action === "Cancel") {
      expect(maybePopup()).not.toBeNull(); expect(h.selected()).toBe(h.names[1]);
      expect(within(popup()).getByTestId("dirty-indicator")).toBeTruthy();
      return;
    }
    if (action === "Save") {
      const save = await screen.findByRole("dialog", { name: "Save changes" });
      await within(save).findByText("1 block changed"); cycle(save);
      fireEvent.click(save.querySelector(".save-dialog__btn--primary")!);
    }
    await waitFor(() => expect(maybePopup()).toBeNull());
    expect(h.selected()).toBe(h.names[0]);
    if (action === "Save") expect(h.slots().tileVersions[h.names[1]!]).toBe(1);
    else expect(h.calls("/discard")).toHaveLength(1);
  });

  it("Escape closes the clean popup; Escape in SaveDialog closes only that dialog", async () => {
    const h = await setup(base); await h.open(); await h.dirty();
    fireEvent.click(within(popup()).getByRole("button", { name: "Save Changes" }));
    const save = await screen.findByRole("dialog", { name: "Save changes" });
    fireEvent.keyDown(save, { key: "Escape" });
    expect(maybePopup()).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
    fireEvent.click(within(popup()).getByRole("button", { name: "Close" })); await flush();
    fireEvent.click(within(screen.getByText(`You have unsaved changes on ${h.names[1]}.`)
      .closest('[role="dialog"]') as HTMLElement).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(maybePopup()).toBeNull());
    await h.open(); fireEvent.keyDown(popup(), { key: "Escape" });
    await waitFor(() => expect(maybePopup()).toBeNull());
  });

  it("sign editor traps Tab and consumes text-field Escape without closing the popup", async () => {
    const h = await setup(base); await h.open();
    const search = popup().querySelector<HTMLInputElement>(".palette__search")!;
    search.focus(); fireEvent.keyDown(search, { key: "Escape" }); await flush();
    expect(maybePopup()).not.toBeNull();
    fireEvent.click(within(popup()).getByRole("button", { name: "Sign" }));
    const canvas = popup().querySelector("canvas.map-canvas__stage")!;
    fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
    const sign = await screen.findByRole("dialog", { name: "Sign editor" });
    const text = await within(sign).findByRole("textbox", { name: "Text" });
    cycle(sign); fireEvent.keyDown(text, { key: "Escape" });
    expect(maybePopup()).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Sign editor" })).toBeNull();
  });

  it("waits for a close stroke and uses fresh dirty state; repeated close requests act once", async () => {
    const paint = deferred();
    const h = await setup(base, { paintWait: paint.promise }); await h.open();
    await h.paint(popup());
    const close = within(popup()).getByRole("button", { name: "Close" });
    fireEvent.click(close); fireEvent.click(close); await flush();
    expect(maybePopup()).not.toBeNull();
    expect(screen.queryByText(/You have unsaved changes/)).toBeNull();
    await act(async () => paint.resolve());
    await screen.findByText(`You have unsaved changes on ${h.names[1]}.`);
    expect(h.calls("/paint/end")).toHaveLength(1);
    click("Cancel"); expect(maybePopup()).not.toBeNull();
  });

  it("waits for an opening stroke and prompts using its post-stroke dirty state", async () => {
    const paint = deferred();
    const h = await setup(base, { paintWait: paint.promise });
    act(() => h.slots().enterContext(h.names[0]!)); await flush();
    await h.paint(document.querySelector<HTMLElement>(".app__canvas")!);
    await h.open(); expect(maybePopup()).toBeNull();
    await act(async () => paint.resolve());
    await screen.findByText(`You have unsaved changes on ${h.names[0]}.`);
    click("Cancel"); expect(maybePopup()).toBeNull();
  });

  it.each([false, true])("self warp skips prompts and ends context (%s)", async (context) => {
    const h = await setup(base);
    if (context) {
      act(() => h.slots().enterContext(h.names[0]!)); await flush();
      if (base.family === "gba") click("Add Event");
      else await h.paint(document.querySelector<HTMLElement>(".app__canvas")!);
      await screen.findByTestId("dirty-indicator");
    }
    const opener = document.querySelector<HTMLCanvasElement>("canvas.world-canvas__stage")!;
    opener.focus();
    await h.open(h.names[0]);
    expect(h.selected()).toBe(h.names[0]); expect(h.slots().contextMap).toBeNull();
    expect(screen.getAllByRole("button", { name: "Pencil" })).toHaveLength(1);
    const close = within(popup()).getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close); await flush();
    expect(maybePopup()).toBeNull(); expect(h.selected()).toBe(h.names[0]);
    expect(document.activeElement).toBe(opener);
    expect(h.calls("/discard")).toHaveLength(0);
  });

  it("shows Loading for a delayed destination rather than the source workspace", async () => {
    const map = deferred(); const h = await setup(base, { mapWait: map.promise }); await h.open();
    expect(within(popup()).getByText(`Loading ${h.names[1]}\u2026`)).toBeTruthy();
    expect(within(popup()).queryByRole("button", { name: "Pencil" })).toBeNull();
    await act(async () => map.resolve());
    await within(popup()).findByRole("button", { name: "Pencil" });
  });

  it.each(["mode", "tree"])("drops a pending open after a %s change", async (change) => {
    const link = deferred(); const h = await setup(base, { chain: { settled: () => link.promise } });
    act(() => h.slots().enterContext(h.names[0]!)); await flush();
    await h.open();
    if (change === "mode") click("Map"); else click(h.names[2]!);
    await act(async () => link.resolve());
    expect(maybePopup()).toBeNull();
    if (change === "mode") expect(screen.getAllByRole("button", { name: "Pencil" })).toHaveLength(1);
    else expect(h.selected()).toBe(h.names[2]);
  });

  it.each(["World", "Dungeon"] as const)("owns tools, history, Fit and one stroke in %s", async (mode) => {
    const h = await setup(base, { mode });
    h.registrations.mockClear(); await h.open();
    expect(h.registrations.mock.calls.filter(([, mounted]) => mounted)).toHaveLength(1);
    const q = within(popup());
    fireEvent.keyDown(window, { key: "r" });
    expect(q.getByRole("button", { name: "Rect" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("button", { name: "Rect" })).toHaveLength(1);
    await h.paint(popup()); await q.findByTestId("dirty-indicator");
    expect(h.calls("/paint/begin")).toHaveLength(1);
    expect(h.calls("/paint/apply")).toHaveLength(1);
    expect(h.calls("/paint/end")).toHaveLength(1);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true }); await flush();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true }); await flush();
    expect(h.calls("/undo")).toHaveLength(1); expect(h.calls("/redo")).toHaveLength(1);
    const zoom = q.getByRole("group", { name: "Zoom" });
    const zoomIn = within(zoom).getAllByRole("button").find((b) => b.textContent === "4\u00d7")!;
    fireEvent.click(zoomIn);
    const worldCanvas = document.querySelector("canvas.world-canvas__stage")!;
    const readWorldZoom = () => document.querySelector(base.family === "gba"
      ? ".world-canvas__zoom-readout" : ".world-canvas__status")?.textContent;
    const worldZoom = readWorldZoom();
    expect(worldZoom).toBeTruthy();
    const zoomKey = new KeyboardEvent("keydown", { key: "-", bubbles: true, cancelable: true });
    fireEvent(worldCanvas, zoomKey);
    expect(zoomKey.defaultPrevented).toBe(false);
    expect(readWorldZoom()).toBe(worldZoom);
    fireEvent.keyDown(window, { key: "f" });
    const fitted = zoom.querySelector('[aria-pressed="true"]')?.textContent;
    expect(fitted).toBeTruthy(); expect(fitted).not.toBe("4\u00d7");
    expect(readWorldZoom()).toBe(worldZoom);
    fireEvent.click(q.getByRole("button", { name: "Save Changes" }));
    await screen.findByRole("dialog", { name: "Save changes" });
    fireEvent.click(zoomIn);
    const before = zoom.querySelector('[aria-pressed="true"]')?.textContent;
    const rect = q.getByRole("button", { name: "Rect" }).getAttribute("aria-pressed");
    for (const key of ["r", "f"]) fireEvent.keyDown(window, { key });
    for (const key of ["z", "y"]) fireEvent.keyDown(window, { key, ctrlKey: true });
    await flush();
    expect(q.getByRole("button", { name: "Rect" }).getAttribute("aria-pressed")).toBe(rect);
    expect(zoom.querySelector('[aria-pressed="true"]')?.textContent).toBe(before);
    expect(h.calls("/undo")).toHaveLength(1); expect(h.calls("/redo")).toHaveLength(1);
  });

  it("popup text-field Escape leaves the background context menu open and keeps focus", async () => {
    const h = await setup(base);
    const worldCanvas = document.querySelector<HTMLCanvasElement>("canvas.world-canvas__stage")!;
    await waitFor(() => expect(document.querySelector(".world-canvas__status")?.textContent)
      .toContain(base.family === "gba" ? "placed 3" : "3 maps"));
    fireEvent.contextMenu(worldCanvas, { clientX: 100, clientY: 100 });
    const menu = await screen.findByRole("menu", { name: "Map actions" });
    await h.open();
    expect(menu.isConnected).toBe(true);
    const search = popup().querySelector<HTMLInputElement>(".palette__search")!;
    search.focus();
    fireEvent.keyDown(search, { key: "Escape" }); await flush();
    expect(maybePopup()).not.toBeNull();
    expect(screen.getByRole("menu", { name: "Map actions" })).toBe(menu);
    expect(document.activeElement).toBe(search);
  });
});

it("GBC displays a post-save reload error inside the open popup", async () => {
  const h = await setup(gbcAdapter, { reloadFails: true }); await h.open(); await h.dirty();
  fireEvent.click(within(popup()).getByRole("button", { name: "Save Changes" }));
  const save = await screen.findByRole("dialog", { name: "Save changes" });
  await within(save).findByText("1 block changed");
  fireEvent.click(save.querySelector(".save-dialog__btn--primary")!);
  await within(popup()).findByText("Saved, but could not reload the map: reload failed");
  expect(h.slots().tileVersions[h.names[1]!]).toBe(1);
});

