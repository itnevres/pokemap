import { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { EngineAdapter, ShellSlots } from "../../src/shell/adapter.js";
import type { SettledChain } from "../../src/shared/useStrokeChain.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";

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
    map: { name, constName: name.toUpperCase(), group: 1, number: 1, width: 2, height: 1, blkPath: `maps/${name}.blk`, tileset: "T", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P", fishGroup: "0", border: 3, connectionFlags: "0", connections: [] },
    layout: { blkPath: `maps/${name}.blk`, width: 2, height: 1, writable: true },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }], metatileCount: 2, tileset: { constName: "TILESET_OLIVINE", name: "T" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], paddingWidth: 3,
  };
}

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }
function Register({ slots, chain }: { slots: ShellSlots; chain: SettledChain }) {
  useEffect(() => { slots.onStrokeChain(chain, true); return () => slots.onStrokeChain(chain, false); }, [slots.onStrokeChain, chain]);
  return null;
}
const status = () => document.querySelector(".app__status")?.textContent;
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

for (const base of [gbaAdapter, gbcAdapter]) describe(`${base.family} switch prompt`, () => {
  async function setup(options: { discardFails?: boolean; commitFails?: boolean; refused?: boolean; chain?: SettledChain; commitWait?: Promise<void>; discardWait?: Promise<void> } = {}) {
    const gba = base.family === "gba";
    const names = gba ? ["PalletTown", "Route1", "Route2"] : ["OlivineCity", "OlivinePort", "Route2"];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/groups") return ok({ groupOrder: ["Maps"], groups: { Maps: names } });
      if (url.startsWith("/api/map/")) return ok(gba ? { ...LAYOUT, map: { ...LAYOUT.map, name: url.split("/").pop() } } : payload(url.split("/").pop()!));
      if (url.endsWith("/plan")) return ok({ changes: [{ path: "map.bin", kind: "binary", summary: "1 block changed" }], refusals: [] });
      if (url.endsWith("/commit")) {
        await options.commitWait;
        if (options.commitFails) throw new Error("commit failed");
        return ok({ changes: [], refusals: options.refused ? [{ code: "blocked", message: "refused", fix: "retry", subject: "map" }] : [] });
      }
      if (url.endsWith("/discard")) {
        await options.discardWait;
        if (options.discardFails) throw new Error("discard failed");
        return ok({ isDirty: false });
      }
      if (url.startsWith("/api/edit/")) return ok({ blocks: LAYOUT.blocks, map: LAYOUT.map, events: EMPTY_EVENTS, isDirty: true, canUndo: true, canRedo: false });
      throw new Error(`unexpected fetch ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const chain = options.chain ?? { settled: () => Promise.resolve() };
    const adapter: EngineAdapter = { ...base, useRuntime(args) {
      const runtime = base.useRuntime(args);
      return { ...runtime, renderMap: (slots) => <><Register slots={slots} chain={chain} />{runtime.renderMap(slots)}</> };
    } };
    render(<FamilyApp adapter={adapter} />);
    await screen.findByRole("button", { name: names[0] });
    click(names[0]!);
    await screen.findByRole("button", { name: "Pencil" });
    async function dirty() {
      if (gba) click("Add Event");
      else {
        click("Pencil");
        fireEvent.click(screen.getByLabelText("metatile 0x1"));
        const canvas = document.querySelector("canvas.map-canvas__stage")!;
        fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
        fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 });
      }
      await screen.findByTestId("dirty-indicator");
    }
    return { names, fetcher, dirty, discards: () => fetcher.mock.calls.filter(([url]) => url.endsWith("/discard")) };
  }
  it("prompts on dirty switch; Cancel keeps map and sends no request", async () => {
    const settled = vi.fn(() => Promise.resolve());
    const h = await setup({ chain: { settled } }); await h.dirty();
    const requestsBeforeSwitch = h.fetcher.mock.calls.length;
    click(h.names[1]!);
    expect(screen.getByText(`You have unsaved changes on ${h.names[0]}.`)).toBeTruthy();
    click("Cancel"); expect(status()).toBe(h.names[0]); expect(h.discards()).toHaveLength(0);
    expect(h.fetcher.mock.calls).toHaveLength(requestsBeforeSwitch);
    expect(settled).not.toHaveBeenCalled();
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
  });
  it("discard waits for queued stroke link", async () => {
    const link = deferred(), discard = deferred();
    const h = await setup({ chain: { settled: () => link.promise }, discardWait: discard.promise });
    await h.dirty(); click(h.names[1]!); click("Discard");
    click(h.names[2]!);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await act(async () => {});
    expect(h.discards()).toHaveLength(0); expect(status()).toBe(h.names[0]);
    for (const b of within(screen.getByRole("dialog")).getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
    await act(async () => link.resolve());
    expect(h.discards()).toHaveLength(1); expect(h.discards()[0]![1]?.method).toBe("POST");
    expect(h.discards()[0]![0]).toBe(`/api/edit/${h.names[0]}/discard`);
    expect(status()).toBe(h.names[0]);
    await act(async () => discard.resolve());
    await waitFor(() => expect(status()).toBe(h.names[1]));
    const urls = h.fetcher.mock.calls.map(([url]) => url);
    expect(urls.indexOf(`/api/edit/${h.names[0]}/discard`)).toBeLessThan(urls.indexOf(`/api/map/${h.names[1]}`));
  });
  it("save path switches only after commit", async () => {
    const commit = deferred(); const h = await setup({ commitWait: commit.promise });
    await h.dirty(); click(h.names[1]!); click("Save");
    await screen.findByRole("dialog", { name: "Save changes" }); click("Cancel");
    expect(status()).toBe(h.names[0]); expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    click(h.names[1]!); click("Save"); await screen.findByText("1 block changed");
    fireEvent.click(screen.getByRole("dialog").querySelector(".save-dialog__btn--primary")!);
    await act(async () => {}); expect(status()).toBe(h.names[0]);
    click(h.names[2]!);
    await act(async () => commit.resolve()); await waitFor(() => expect(status()).toBe(h.names[1]));
    expect(h.discards()).toHaveLength(0);
  });
  for (const mode of ["commitFails", "refused"] as const) it(`save ${mode} keeps the current dirty map`, async () => {
    const h = await setup({ [mode]: true }); await h.dirty(); click(h.names[1]!); click("Save");
    await screen.findByText("1 block changed");
    fireEvent.click(screen.getByRole("dialog").querySelector(".save-dialog__btn--primary")!);
    await screen.findByText(mode === "commitFails" ? /Could not save: commit failed/ : "refused");
    expect(status()).toBe(h.names[0]); expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    click("Cancel"); click(h.names[2]!); expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("discard failure shows switchError and stays", async () => {
    const h = await setup({ discardFails: true }); await h.dirty(); click(h.names[1]!); click("Discard");
    await screen.findByText("discard failed"); expect(status()).toBe(h.names[0]);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy(); click("Dismiss"); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("no prompt when clean or same map", async () => {
    const h = await setup(); click(h.names[1]!); await waitFor(() => expect(status()).toBe(h.names[1]));
    click(h.names[0]!); await screen.findByRole("button", { name: "Pencil" }); await h.dirty();
    click(h.names[0]!); expect(screen.queryByRole("dialog")).toBeNull(); expect(h.discards()).toHaveLength(0);
  });
  it("second switch while prompt open is ignored", async () => {
    const h = await setup(); await h.dirty(); click(h.names[1]!); click(h.names[2]!); click("Discard");
    await waitFor(() => expect(status()).toBe(h.names[1])); expect(h.discards()).toHaveLength(1);
  });
});
