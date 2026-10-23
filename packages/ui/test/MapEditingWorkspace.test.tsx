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
    indicatorOpen: false, indicatorEdit: undefined, setIndicatorEdit: vi.fn(),
    setIndicatorOpen: vi.fn(),
    signAddedMessage: null,
    setSignAddedMessage: vi.fn(),
    activeTool: null,
    handleDiscard: vi.fn(),
    isVisitCurrent: () => true,
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
      ["activeTool", "data", "editSession", "mapName", "onDropperPick", "onMoveEvent", "onSelectEvent", "onSignPick", "selectedEventRef"],
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
  it("renders the collision palette in the rail only while the collision tool is active", () => {
    const { container, rerender } = render(
      <MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "collision" })} />,
    );
    expect(container.querySelector(".edit-rail > .collision-palette")).not.toBeNull();
    rerender(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "shift" })} />);
    expect(container.querySelector(".edit-rail > .collision-palette")).toBeNull();
  });

  it("renders signAddedMessage as a status banner whose Dismiss calls setSignAddedMessage(null)", () => {
    const editing = makeEditing({ signAddedMessage: "Placed Pok\u00e9mon Indicator: Foo_Sign" });
    const { container } = render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={editing} />);
    const banner = container.querySelector("[role=status]")!;
    expect(banner.textContent).toContain("Placed Pok\u00e9mon Indicator: Foo_Sign");
    fireEvent.click(banner.querySelector("button[aria-label=Dismiss]")!);
    expect(editing.setSignAddedMessage).toHaveBeenCalledWith(null);
  });

  it("Toolbar Save and Pok\u00e9mon Indicator call their own open-flag setters, and only those", () => {
    const editing = makeEditing();
    // Save is disabled while clean (Toolbar gates it on isDirty).
    const dirty = { ...editSession, isDirty: true } as UseEditSessionResult;
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={dirty} editing={editing} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(editing.setSaveDialogOpen).toHaveBeenCalledWith(true);
    expect(editing.setIndicatorOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Pok\u00e9mon Indicator" }));
    expect(editing.setIndicatorOpen).toHaveBeenCalledWith(true);
    expect(editing.setSaveDialogOpen).toHaveBeenCalledTimes(1);
  });

  it("the rail's metatile palette is keyed on data.layout.name, not mapName", () => {
    const { container } = render(
      <MapEditingWorkspace mapName="Map1" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "pencil" })} />,
    );
    const srcs = [...container.querySelectorAll(".edit-rail .metatile-palette img")].map((i) => i.getAttribute("src")!);
    expect(srcs.length).toBeGreaterThan(0);
    expect(srcs.every((s) => s.startsWith("/api/metatile/Foo_Layout/"))).toBe(true);
  });

  // Plan 9 (D4): one right-hand rail -- [collision palette] over the metatile palette over the inspector.
  const railOrder = (container: HTMLElement) =>
    [...container.querySelector(".edit-rail")!.children].map((el) => el.className.split(" ")[0]);

  it("rail order: collision palette (Collision only), then the metatile palette, then the inspector", () => {
    const { container, rerender } = render(
      <MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "collision" })} />,
    );
    expect(railOrder(container)).toEqual(["collision-palette", "metatile-palette", "event-inspector"]);
    rerender(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "shift" })} />);
    expect(railOrder(container)).toEqual(["metatile-palette", "event-inspector"]);
    expect(container.querySelector(".app__metatile-strip, .app__collision-strip")).toBeNull();
  });

  it("the GBA palette shows with no paint tool, and a pick only sets the stamp", () => {
    const editing = makeEditing({ activeToolKind: null });
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={editing} />);
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));
    expect(editing.setCurrentStamp).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 1 }] });
    expect(editing.setActiveToolKind).not.toHaveBeenCalled();
  });
});

describe("MapEditingWorkspace Duplicate (Plan 10b D6)", () => {
  const obj = {
    graphicsId: "G", x: 1, y: 0, elevation: 0, movementType: "M", movementRangeX: 1, movementRangeY: 1,
    trainerType: "T", trainerSightOrBerryTreeId: "0", script: "S", flag: "0",
  };
  const selectedObj = { kind: "object" as const, index: 0, x: 1, y: 0, elevation: 0, graphicsId: "G", movementType: "M" };
  const withMap = (objectEvents: typeof obj[]) => ({ ...DATA.map, objectEvents });

  it("adds the full session-map event one tile right through editSession.addEvent", async () => {
    const addEvent = vi.fn().mockResolvedValue(undefined);
    const setEventOpError = vi.fn();
    const session = { ...editSession, addEvent } as unknown as UseEditSessionResult;
    const editing = makeEditing({ selectedEvent: selectedObj, currentMap: withMap([obj]), setEventOpError });
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={session} editing={editing} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(addEvent).toHaveBeenCalledWith("object", expect.objectContaining({ graphics_id: "G", x: 0, y: 0, script: "S", trainer_type: "T" }));
    await vi.waitFor(() => expect(setEventOpError).toHaveBeenCalledWith(null));
  });

  it("an object on a 64-object map cannot be duplicated", () => {
    const addEvent = vi.fn();
    const session = { ...editSession, addEvent } as unknown as UseEditSessionResult;
    const editing = makeEditing({ selectedEvent: selectedObj, currentMap: withMap(Array.from({ length: 64 }, () => obj)) });
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={session} editing={editing} />);
    const b = screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("The map already has 64 object events");
    fireEvent.click(b);
    expect(addEvent).not.toHaveBeenCalled();
  });

  it("a failed add surfaces through setEventOpError", async () => {
    const addEvent = vi.fn().mockRejectedValue(new Error("boom"));
    const setEventOpError = vi.fn();
    const session = { ...editSession, addEvent } as unknown as UseEditSessionResult;
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={session} editing={makeEditing({ selectedEvent: selectedObj, currentMap: withMap([obj]), setEventOpError })} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await vi.waitFor(() => expect(setEventOpError).toHaveBeenCalledWith("boom"));
  });

  it.each([["resolves", vi.fn().mockResolvedValue(undefined)], ["fails", vi.fn().mockRejectedValue(new Error("boom"))]])(
    "an add that %s after a map switch leaves the error state alone", async (_, addEvent) => {
      const setEventOpError = vi.fn();
      let current = true;
      const session = { ...editSession, addEvent } as unknown as UseEditSessionResult;
      render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={session} editing={makeEditing({ selectedEvent: selectedObj, currentMap: withMap([obj]), setEventOpError, isVisitCurrent: () => current })} />);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      current = false;
      await vi.waitFor(() => expect(addEvent).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(setEventOpError).not.toHaveBeenCalled();
    });
});
