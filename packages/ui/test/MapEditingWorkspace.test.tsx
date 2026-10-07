import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../src/components/MapEditingWorkspace.js";
import type { useMapEditing } from "../src/hooks/useMapEditing.js";
import type { UseEditSessionResult } from "../src/hooks/useEditSession.js";
import type { MapLayoutData } from "../src/hooks/useMapLayout.js";

// Plan 6c E2: the workspace is the extracted `.app__map-editing` chrome. App's
// own tests prove the default (no renderCanvas) path end to end; these pin the
// renderCanvas seam E4 relies on, against a stub `editing` object.

const DATA: MapLayoutData = {
  map: {
    id: "MAP_FOO", name: "Foo", layout: "LAYOUT_FOO", music: "MUS_DUMMY",
    regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  layout: {
    id: "LAYOUT_FOO", name: "Foo_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1,
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

const editSession = {
  blocks: [], border: [], map: undefined, isDirty: false, canUndo: false, canRedo: false,
} as unknown as UseEditSessionResult;

function makeEditing(overrides: Partial<ReturnType<typeof useMapEditing>> = {}): ReturnType<typeof useMapEditing> {
  return {
    selectedEvent: null,
    eventOpError: null,
    setEventOpError: vi.fn(),
    currentMap: undefined,
    onSelectEvent: vi.fn(),
    onCanvasMoveEvent: vi.fn(),
    onMoveEventFromInspector: vi.fn(),
    onDeleteEvent: vi.fn().mockResolvedValue(undefined),
    onAddEvent: vi.fn().mockResolvedValue(undefined),
    activeToolKind: null,
    setActiveToolKind: vi.fn(),
    collisionValue: { collision: 0, elevation: 0 },
    setCollisionValue: vi.fn(),
    currentStamp: null,
    setCurrentStamp: vi.fn(),
    saveDialogOpen: false,
    setSaveDialogOpen: vi.fn(),
    signComposerOpen: false,
    setSignComposerOpen: vi.fn(),
    signAddedMessage: null,
    setSignAddedMessage: vi.fn(),
    activeTool: null,
    handleDiscard: vi.fn(),
    resetForMapChange: vi.fn(),
    ...overrides,
  };
}

describe("MapEditingWorkspace", () => {
  it("renderCanvas receives exactly the canvas props built from `editing`, and its output sits in .app__map-editing-body before EventInspector", () => {
    const activeTool = { kind: "dropper" as const };
    const editing = makeEditing({
      activeTool,
      selectedEvent: { kind: "warp", index: 2, x: 1, y: 1, elevation: 0, destMap: "MAP_BAR", destWarpId: "0" },
    });
    const renderCanvas = vi.fn((_p: MapEditingCanvasProps) => <div data-testid="custom-canvas" />);
    const { container } = render(
      <MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={editing} renderCanvas={renderCanvas} />,
    );
    expect(renderCanvas).toHaveBeenCalled();
    const p = renderCanvas.mock.calls[0]![0];
    expect(Object.keys(p).sort()).toEqual(
      ["activeTool", "data", "editSession", "mapName", "onDropperPick", "onMoveEvent", "onSelectEvent", "selectedEventRef"],
    );
    expect(p.mapName).toBe("Foo");
    expect(p.data).toBe(DATA);
    expect(p.editSession).toBe(editSession);
    expect(p.activeTool).toBe(activeTool);
    expect(p.selectedEventRef).toEqual({ kind: "warp", index: 2 });
    expect(p.onSelectEvent).toBe(editing.onSelectEvent);
    expect(p.onMoveEvent).toBe(editing.onCanvasMoveEvent);
    expect(p.onDropperPick).toBe(editing.setCurrentStamp);

    const body = container.querySelector(".app__map-editing-body")!;
    const custom = body.querySelector("[data-testid=custom-canvas]")!;
    expect(body.firstElementChild).toBe(custom);
    expect(custom.nextElementSibling).not.toBeNull(); // EventInspector follows
    expect(container.querySelector("canvas.map-canvas__stage")).toBeNull();
  });

  it("without renderCanvas, renders a MapCanvas stage canvas in .app__map-editing-body", () => {
    const { container } = render(
      <MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing()} />,
    );
    expect(container.querySelector(".app__map-editing-body canvas.map-canvas__stage")).not.toBeNull();
  });
  // Plan 6c E2 fix round (review F1): the wiring App.test.tsx never reaches.
  it("renders the collision strip only while the collision tool is active", () => {
    const { container, rerender } = render(
      <MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "collision" })} />,
    );
    expect(container.querySelector(".app__collision-strip")).not.toBeNull();
    rerender(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "shift" })} />);
    expect(container.querySelector(".app__collision-strip")).toBeNull();
  });

  it("renders signAddedMessage as a status banner whose Dismiss calls setSignAddedMessage(null)", () => {
    const editing = makeEditing({ signAddedMessage: "Added wild sign: Foo_Sign" });
    const { container } = render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={editing} />);
    const banner = container.querySelector("[role=status]")!;
    expect(banner.textContent).toContain("Added wild sign: Foo_Sign");
    fireEvent.click(banner.querySelector("button[aria-label=Dismiss]")!);
    expect(editing.setSignAddedMessage).toHaveBeenCalledWith(null);
  });

  it("Toolbar Save and Add Sign call their own open-flag setters, and only those", () => {
    const editing = makeEditing();
    // Save is disabled while clean (Toolbar gates it on isDirty).
    const dirty = { ...editSession, isDirty: true } as UseEditSessionResult;
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={dirty} editing={editing} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(editing.setSaveDialogOpen).toHaveBeenCalledWith(true);
    expect(editing.setSignComposerOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add Sign" }));
    expect(editing.setSignComposerOpen).toHaveBeenCalledWith(true);
    expect(editing.setSaveDialogOpen).toHaveBeenCalledTimes(1);
  });

  it("the metatile strip is keyed on data.layout.name, not mapName", () => {
    const { container } = render(
      <MapEditingWorkspace mapName="Map1" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "pencil" })} />,
    );
    const srcs = [...container.querySelectorAll(".app__metatile-strip img")].map((i) => i.getAttribute("src")!);
    expect(srcs.length).toBeGreaterThan(0);
    expect(srcs.every((s) => s.startsWith("/api/metatile/Foo_Layout/"))).toBe(true);
  });
});
