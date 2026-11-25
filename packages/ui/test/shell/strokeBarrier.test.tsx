import { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { gbaAdapter } from "../../src/gba/adapter.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { EngineAdapter, ShellSlots } from "../../src/shell/adapter.js";
import type { SettledChain } from "../../src/shared/useStrokeChain.js";
import type { GbcMapPayload } from "@pokemap/core/gbc/wire";

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
    layout: { blkPath: `maps/${name}.blk`, width: 2, height: 1 },
    blocks: [{ metatileId: 0 }, { metatileId: 1 }], metatileCount: 2, tileset: { constName: "TILESET_OLIVINE", name: "T" },
    collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
    collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
    events: EMPTY_EVENTS, defects: [], incomplete: [], paddingWidth: 3,
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

/** Session-closing actions wait for in-flight paint links (Plan H C1). */
for (const base of [gbaAdapter, gbcAdapter]) describe(`${base.family} stroke barrier`, () => {
  async function setup(options: { settled?: () => Promise<void>; applyWait?: () => Promise<void> | undefined } = {}) {
    const gba = base.family === "gba";
    const names = gba ? ["PalletTown", "Route1"] : ["OlivineCity", "OlivinePort"];
    const hubSession = { open: false }; // what the hub holds: a late paint reopens one from disk, a discard or commit closes it
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/groups") return ok({ groupOrder: ["Maps"], groups: { Maps: names } });
      if (url.startsWith("/api/map/")) return ok(gba ? { ...LAYOUT, map: { ...LAYOUT.map, name: url.split("/").pop() } } : payload(url.split("/").pop()!));
      if (url.endsWith("/plan")) return ok({ changes: [{ path: "map.bin", kind: "binary", summary: "1 block changed" }], refusals: [] });
      if (url.endsWith("/commit")) { hubSession.open = false; return ok({ changes: [], refusals: [] }); }
      if (url.endsWith("/discard")) { hubSession.open = false; return ok({ isDirty: false }); }
      if (url.endsWith("/session")) return ok({ blocks: [], border: [], map: null, events: null, isDirty: false, canUndo: false, canRedo: false });
      if (url.startsWith("/api/edit/")) {
        if (url.endsWith("/paint/apply")) await options.applyWait?.();
        if (url.includes("/paint/") || url.endsWith("/undo")) hubSession.open = true;
        return ok({ blocks: LAYOUT.blocks, map: LAYOUT.map, events: EMPTY_EVENTS, isDirty: true, canUndo: true, canRedo: false });
      }
      if (url.startsWith("/api/defects/")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ defects: [], incomplete: [] }) } as Response);
      throw new Error(`unexpected fetch ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", () => true);
    const chain: SettledChain = { settled: () => options.settled?.() ?? Promise.resolve() };
    const adapter: EngineAdapter = { ...base, useRuntime(args) {
      const runtime = base.useRuntime(args);
      return { ...runtime, renderMap: (slots) => <><Register slots={slots} chain={chain} />{runtime.renderMap(slots)}</> };
    } };
    render(<FamilyApp adapter={adapter} />);
    await screen.findByRole("button", { name: names[0] });
    click(names[0]!);
    await screen.findByRole("button", { name: "Pencil" });
    const stroke = () => {
      click("Pencil");
      fireEvent.click(screen.getByLabelText("metatile 0x1"));
      const canvas = document.querySelector("canvas.map-canvas__stage")!;
      fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
      fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 });
    };
    const dirty = async () => { stroke(); await screen.findByTestId("dirty-indicator"); };
    const sent = (suffix: string) => fetcher.mock.calls.filter(([url]) => url.endsWith(suffix));
    return { names, fetcher, dirty, stroke, sent, hubSession };
  }

  it("toolbar Discard sends no /discard until the stroke link settles", async () => {
    const link = deferred(); let hold = false;
    const h = await setup({ settled: () => (hold ? link.promise : Promise.resolve()) });
    await h.dirty(); hold = true;
    click("Discard Changes");
    await act(async () => {});
    expect(h.sent("/discard")).toHaveLength(0);
    await act(async () => link.resolve());
    await waitFor(() => expect(h.sent("/discard")).toHaveLength(1));
  });

  it("undo waits the same way", async () => {
    const link = deferred(); let hold = false;
    const h = await setup({ settled: () => (hold ? link.promise : Promise.resolve()) });
    await h.dirty(); hold = true;
    click("Undo");
    await act(async () => {});
    expect(h.sent("/undo")).toHaveLength(0);
    await act(async () => link.resolve());
    await waitFor(() => expect(h.sent("/undo")).toHaveLength(1));
  });

  it("the Save dialog sends neither /plan nor /commit until the link settles", async () => {
    const planLink = deferred(), commitLink = deferred(); let hold: Promise<void> | null = null;
    const h = await setup({ settled: () => hold ?? Promise.resolve() });
    await h.dirty(); hold = planLink.promise;
    click("Save Changes");
    await act(async () => {});
    expect(h.sent("/plan")).toHaveLength(0);
    await act(async () => planLink.resolve());
    await screen.findByText("1 block changed");
    expect(h.sent("/plan")).toHaveLength(1);
    hold = commitLink.promise; // another stroke link appeared before the user confirmed
    fireEvent.click(screen.getByRole("dialog").querySelector(".save-dialog__btn--primary")!);
    await act(async () => {});
    expect(h.sent("/commit")).toHaveLength(0);
    await act(async () => commitLink.resolve());
    await waitFor(() => expect(h.sent("/commit")).toHaveLength(1));
  });

  it("a stroke link that rejects does not block Discard", async () => {
    let fail = false;
    const h = await setup({ settled: () => (fail ? Promise.reject(new Error("link failed")) : Promise.resolve()) });
    await h.dirty(); fail = true;
    click("Discard Changes");
    await waitFor(() => expect(h.sent("/discard")).toHaveLength(1));
  });

  it("a real in-flight paint request lands before Discard, so the hub holds no session afterwards", async () => {
    const apply = deferred(); let hold = false;
    const h = await setup({ applyWait: () => (hold ? apply.promise : undefined) });
    await h.dirty(); hold = true;
    h.stroke();
    await waitFor(() => expect(h.sent("/paint/apply")).toHaveLength(2));
    click("Discard Changes");
    await act(async () => {});
    expect(h.sent("/discard")).toHaveLength(0);
    await act(async () => apply.resolve());
    await waitFor(() => expect(h.sent("/discard")).toHaveLength(1));
    await waitFor(() => expect(h.hubSession.open).toBe(false));
  });
});
