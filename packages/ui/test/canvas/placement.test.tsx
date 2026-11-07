import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MapCanvas } from "../../src/components/MapCanvas.js";
import { GbcMapCanvas } from "../../src/gbc/GbcMapCanvas.js";
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../../src/components/MapEditingWorkspace.js";
import { GbcMapEditing, type GbcMapEditingCanvasProps } from "../../src/gbc/GbcMapEditing.js";
import { useMapEditing } from "../../src/hooks/useMapEditing.js";
import type { UseEditSessionResult } from "../../src/hooks/useEditSession.js";
import type { UseGbcEditSessionResult } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { MapLayoutData } from "../../src/hooks/useMapLayout.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import { compositeOrigin } from "../../src/gba/mapSurface.js";
import { GBC_COMPOSITE_ORIGIN } from "../../src/gbc/mapSurface.js";
import { AddEventBar, useEventPlacement } from "../../src/shared/AddEventBar.js";

const GBA: MapLayoutData = {
  map: {
    id: "MAP_FOO", name: "Foo", layout: "LAYOUT_FOO", music: "MUS_DUMMY",
    regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  layout: {
    id: "LAYOUT_FOO", name: "Foo_Layout", width: 4, height: 3, borderWidth: 2, borderHeight: 3,
    primaryTileset: "gTileset_General", secondaryTileset: "gTileset_Petalburg",
    borderFilepath: "data/layouts/Foo/border.bin", blockdataFilepath: "data/layouts/Foo/map.bin",
  },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [
    { metatileId: 0x10, collision: 0, elevation: 3, behavior: 0x05 },
    { metatileId: 0x11, collision: 1, elevation: 3, behavior: 0x05 },
    { metatileId: 0x12, collision: 0, elevation: 0, behavior: 0x05 },
    { metatileId: 0x13, collision: 0, elevation: 3, behavior: 0x09 },
  ],
  primaryCount: 512,
  secondaryCount: 144,
};
const OBJECT = { x: 2, y: 2, sprite: "SPRITE_TEACHER", moveData: "M", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "S", eventFlag: "-1", lineIndex: 0 };
const WARP = { x: 3, y: 4, mapConst: "ELMS_HOUSE", destWarp: 1, lineIndex: 0 };
const EVENTS: GbcMapEvents = { warps: [WARP], coords: [], bgs: [], objects: [OBJECT], sceneScripts: [], callbacks: [], objectConsts: [] };
const BLOCKS = [0, 1, 2, 3, 4, 5].map((metatileId) => ({ metatileId }));

const GBC: GbcMapPayload = {
  family: "gbc",
  map: { name: "M", constName: "M", group: 1, number: 1, width: 3, height: 2, blkPath: "maps/M.blk", tileset: "T", environment: "E", landmark: "L", music: "X", phoneFlag: "0", palette: "P", fishGroup: "0", border: 1, connectionFlags: "0", connections: [] },
  layout: { blkPath: "maps/M.blk", width: 3, height: 2 },
  blocks: BLOCKS, metatileCount: 6, tileset: { constName: "T", name: "T" },
  collision: Array.from({ length: 6 }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 })),
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: EVENTS, defects: [], incomplete: [], paddingWidth: 3,
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const clickCell = (canvas: HTMLCanvasElement, x: number, y: number) => {
  fireEvent.mouseDown(canvas, { clientX: x, clientY: y, button: 0, buttons: 1 });
  fireEvent.mouseMove(canvas, { clientX: x + 1, clientY: y + 1, buttons: 1 });
  fireEvent.mouseUp(canvas, { clientX: x, clientY: y, button: 0 });
};
const label = "Add Warp: click a tile, then pick the destination";

describe.each(["gba", "gbc"] as const)("%s placement", family => {
  it.each([1, 2] as const)("picks event cell (2,1) with real geometry at zoom %s after pan, without any paint request", async zoom => {
    // Any unexpected request fails the test, including begin/apply/end paint lifecycle requests.
    const fetcher = vi.fn(() => { throw new Error("Unexpected placement fetch"); });
    vi.stubGlobal("fetch", fetcher);
    const post = () => fetch("/unexpected-paint", { method: "POST" }).then(() => {});
    const onEventPick = vi.fn(), onSignPick = vi.fn();
    const view = { zoom, pan: zoom === 1 ? { x: 0, y: 0 } : { x: 37, y: -19 } };
    const shared = { placing: "warp" as const, onEventPick, onSignPick, view };
    const host = render(family === "gba"
      ? <MapCanvas {...shared} mapName="M" data={GBA} activeTool={{ kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] } }}
          editSession={{ blocks: GBA.blocks, beginStroke: post, applyPaint: post, endStroke: post } as unknown as UseEditSessionResult} />
      : <GbcMapCanvas {...shared} mapName="M" data={GBC} time="day" activeTool={{ kind: "pencil", stamp: { width: 1, height: 1, cells: [{ metatileId: 1 }] } }}
          editSession={{ blocks: GBC.blocks, events: EVENTS, beginStroke: post, applyPaint: post, endStroke: post } as unknown as UseGbcEditSessionResult} />);
    const canvas = host.container.querySelector("canvas")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(11, 23, canvas.width, canvas.height));
    const origin = family === "gba" ? compositeOrigin(GBA.layout) : { x: GBC_COMPOSITE_ORIGIN, y: GBC_COMPOSITE_ORIGIN };
    // GBC event cells are 16 native pixels, independently of its 32px paint blocks.
    const left = 11 + view.pan.x + (origin.x + 2 * 16) * zoom;
    const top = 23 + view.pan.y + (origin.y + 1 * 16) * zoom;
    clickCell(canvas, left + 8 * zoom, top + 8 * zoom);
    await act(async () => {});
    expect(onEventPick).toHaveBeenCalledTimes(1);
    const [x, y, anchor] = onEventPick.mock.calls[0]!;
    expect([x, y]).toEqual([2, 1]);
    expect(anchor).toBeInstanceOf(DOMRect);
    expect([anchor.x, anchor.y, anchor.width, anchor.height]).toEqual([left, top, 16 * zoom, 16 * zoom]);
    expect(onSignPick).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText(/click a tile.*Esc/i)).toBeTruthy();
    clickCell(canvas, 0, 0);
    expect(onEventPick).toHaveBeenCalledTimes(1);
  });

  function mountWorkspace() {
    let canvasProps: MapEditingCanvasProps | GbcMapEditingCanvasProps | null = null;
    const session = {
      blocks: GBA.blocks, border: [], map: GBA.map, events: EVENTS, isDirty: true, canUndo: true, canRedo: false,
      undo: vi.fn(async () => {}), redo: vi.fn(async () => {}), discard: vi.fn(async () => {}),
    };
    const save = vi.fn();
    function GbaHost({ name }: { name: string }) {
      const editSession = session as unknown as UseEditSessionResult;
      const editing = useMapEditing({ editSession, layoutData: GBA, mapName: name });
      return <MapEditingWorkspace mapName={name} data={GBA} editSession={editSession} editing={editing}
        renderCanvas={p => { canvasProps = p; return null; }} />;
    }
    const tree = (name: string) => family === "gba" ? <GbaHost name={name} />
      : <GbcMapEditing mapName={name} data={GBC} time="day" session={session as unknown as UseGbcEditSessionResult}
          hoveredMetatileId={null} onHoverMetatile={vi.fn()} onOpenSave={save}
          renderCanvas={p => { canvasProps = p; return null; }} />;
    const host = render(tree("A"));
    return { session, host, switchMap: () => host.rerender(tree("B")), get props() { return canvasProps!; } };
  }
  it.each(["Escape", "same button", "tool change", "map switch", "Save", "Discard"])("clears placing on %s", async action => {
    const h = mountWorkspace();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(h.props.placing).toBe("warp");
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    if (action === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    if (action === "same button") fireEvent.click(screen.getByRole("button", { name: label }));
    if (action === "tool change") fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    if (action === "map switch") h.switchMap();
    if (action === "Save") fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    if (action === "Discard") {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
      expect(h.session.discard).toHaveBeenCalledTimes(1);
    }
    await act(async () => {});
    expect(h.props.placing).toBeNull();
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("false");
  });
  it("ends workspace placement on pick", () => {
    const h = mountWorkspace();
    fireEvent.click(screen.getByRole("button", { name: label }));
    act(() => h.props.onEventPick?.(2, 1, new DOMRect(10, 20, 16, 16)));
    expect(h.props.placing).toBeNull();
  });
});

// MapSurface is shared, so one family pins it: placing skips drag/paint but keeps the hover readout live.
it("keeps the hover readout live while placing", () => {
  const onHoverMetatile = vi.fn();
  const placement = { placing: "object" as const, onEventPick: vi.fn() };
  const host = render(<MapCanvas {...placement} mapName="M" data={GBA} onHoverMetatile={onHoverMetatile} view={{ zoom: 1, pan: { x: 0, y: 0 } }} />);
  const canvas = host.container.querySelector("canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, canvas.width, canvas.height));
  const origin = compositeOrigin(GBA.layout);
  // Block (1,0) of the 4x3 layout holds metatile 0x11.
  fireEvent.mouseMove(canvas, { clientX: origin.x + 16 + 8, clientY: origin.y + 8, buttons: 0 });
  expect(onHoverMetatile).toHaveBeenLastCalledWith(0x11);
});

it("retains kind, coordinates and anchor for the dialog, then retires them on a new visit", () => {
  const { result, rerender } = renderHook(({ name }) => useEventPlacement(name, null, true), { initialProps: { name: "A" } });
  const anchor = new DOMRect(10, 20, 16, 16);
  act(() => result.current.onToggle("bg"));
  act(() => result.current.onEventPick(2, 1, anchor));
  expect(result.current.placing).toBeNull();
  expect(result.current.pick).toEqual({ kind: "bg", x: 2, y: 1, anchor });
  rerender({ name: "B" });
  expect(result.current.pick).toBeNull();
  rerender({ name: "A" });
  expect(result.current.pick).toBeNull();
});

it("Escape cancels only the popup workspace's placement when two workspaces are mounted", () => {
  function Host({ popup }: { popup?: boolean }) {
    const placement = useEventPlacement("A", null, true);
    const bar = <AddEventBar ref={placement.barRef} placing={placement.placing} onToggle={placement.onToggle} />;
    return popup ? <div role="dialog" aria-modal="true" data-warp-popup="">{bar}</div> : bar;
  }
  const host = render(<><Host /></>);
  fireEvent.click(screen.getByRole("button", { name: label }));
  host.rerender(<><Host /><Host popup /></>);
  const buttons = screen.getAllByRole("button", { name: label });
  fireEvent.click(buttons[1]!);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
  expect(buttons[1]!.getAttribute("aria-pressed")).toBe("false");
});

it("placement takes Escape before the World host's capture listener can leave context", () => {
  const exit = vi.fn();
  function Workspace() {
    const placement = useEventPlacement("A", null, true);
    return <AddEventBar ref={placement.barRef} placing={placement.placing} onToggle={placement.onToggle} />;
  }
  function WorldHost() {
    useEffect(() => {
      const leave = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) exit(); };
      window.addEventListener("keydown", leave, true);
      return () => window.removeEventListener("keydown", leave, true);
    }, []);
    return <Workspace />;
  }
  render(<WorldHost />);
  const button = screen.getByRole("button", { name: label });
  fireEvent.click(button);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(exit).not.toHaveBeenCalled();
});

it("GBC capacity uses live session objects and scenes and supplies reasons", () => {
  const session = { events: { ...EVENTS, objects: Array.from({ length: 15 }, () => OBJECT) } } as unknown as UseGbcEditSessionResult;
  const props = { mapName: "M", data: GBC, time: "day" as const, session, hoveredMetatileId: null, onHoverMetatile: vi.fn(), onOpenSave: vi.fn(), renderCanvas: () => null };
  const host = render(<GbcMapEditing {...props} />);
  const object = screen.getByRole("button", { name: /^Add Object:/ }) as HTMLButtonElement;
  const coord = screen.getByRole("button", { name: /^Add Coord Event:/ }) as HTMLButtonElement;
  expect(object.disabled).toBe(true); expect(object.title).toMatch(/15.*object/i);
  expect(coord.disabled).toBe(true); expect(coord.title).toMatch(/no scene/i);
  host.rerender(<GbcMapEditing {...props} session={{ ...session, events: { ...EVENTS, sceneScripts: [{ script: "S", scene: "SCENE_M" }] } } as unknown as UseGbcEditSessionResult} />);
  expect(object.disabled).toBe(false); expect(coord.disabled).toBe(false);
});
