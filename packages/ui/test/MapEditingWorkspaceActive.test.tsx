import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../src/components/MapEditingWorkspace.js";
import type { useMapEditing } from "../src/hooks/useMapEditing.js";
import type { UseEditSessionResult } from "../src/hooks/useEditSession.js";
import type { MapLayoutData } from "../src/hooks/useMapLayout.js";

// Plan 6c E4: `active={false}` renders only the wrapper and the canvas slot, so a host (the World view) can mount
// the chrome around a stable canvas and switch it on without remounting that canvas.

const DATA = {
  map: { id: "MAP_FOO", name: "Foo", connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [] },
  layout: { id: "LAYOUT_FOO", name: "Foo_Layout", width: 2, height: 2, borderWidth: 1, borderHeight: 1 },
  split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 },
  blocks: [],
  primaryCount: 512,
  secondaryCount: 144,
} as unknown as MapLayoutData;

const editSession = { blocks: [], border: [], map: undefined, isDirty: false, canUndo: false, canRedo: false } as unknown as UseEditSessionResult;

const editing = {
  selectedEvent: null, eventOpError: "boom", setEventOpError: vi.fn(), currentMap: undefined, onSelectEvent: vi.fn(),
  onCanvasMoveEvent: vi.fn(), onMoveEventFromInspector: vi.fn(), onDeleteEvent: vi.fn(), onAddEvent: vi.fn(),
  activeToolKind: "pencil", setActiveToolKind: vi.fn(), collisionValue: { collision: 0, elevation: 0 }, setCollisionValue: vi.fn(),
  currentStamp: null, setCurrentStamp: vi.fn(), saveDialogOpen: false, setSaveDialogOpen: vi.fn(), signComposerOpen: false,
  setSignComposerOpen: vi.fn(), signAddedMessage: "Added", setSignAddedMessage: vi.fn(), activeTool: null, handleDiscard: vi.fn(),
  resetForMapChange: vi.fn(),
} as unknown as ReturnType<typeof useMapEditing>;

const CHROME = [".toolbar", ".app__metatile-strip", ".app__event-op-error", ".app__sign-added", ".event-inspector"];

describe("MapEditingWorkspace: active flag (Plan 6c E4)", () => {
  it("inactive renders only the wrapper and the canvas slot, handing renderCanvas null when there is no map data", () => {
    const renderCanvas = vi.fn((_p: MapEditingCanvasProps | null) => <div data-testid="slot" />);
    const { container } = render(
      <MapEditingWorkspace active={false} mapName={null} data={null} editSession={editSession} editing={editing} renderCanvas={renderCanvas} />,
    );
    expect(renderCanvas).toHaveBeenCalledWith(null);
    for (const sel of CHROME) expect(container.querySelector(sel), sel).toBeNull();
    const body = container.querySelector(".app__map-editing > .app__map-editing-body")!;
    expect(body.children).toHaveLength(1);
    expect(body.firstElementChild!.getAttribute("data-testid")).toBe("slot");
  });

  it("inactive with map data still hands renderCanvas the canvas props", () => {
    const renderCanvas = vi.fn((_p: MapEditingCanvasProps | null) => <div />);
    render(<MapEditingWorkspace active={false} mapName="Foo" data={DATA} editSession={editSession} editing={editing} renderCanvas={renderCanvas} />);
    expect(renderCanvas.mock.calls[0]![0]).toMatchObject({ mapName: "Foo", data: DATA, editSession });
  });

  it("toggling active renders the chrome around the SAME canvas node and body (no remount)", () => {
    let mounts = 0;
    function Probe() {
      useEffect(() => { mounts++; }, []);
      return <div data-testid="probe" />;
    }
    const renderCanvas = () => <Probe />;
    const { container, rerender } = render(
      <MapEditingWorkspace active={false} mapName="Foo" data={DATA} editSession={editSession} editing={editing} renderCanvas={renderCanvas} />,
    );
    const probe = container.querySelector("[data-testid=probe]");
    const body = container.querySelector(".app__map-editing-body");
    expect(probe).not.toBeNull();
    rerender(<MapEditingWorkspace active mapName="Foo" data={DATA} editSession={editSession} editing={editing} renderCanvas={renderCanvas} />);
    for (const sel of CHROME) expect(container.querySelector(sel), sel).not.toBeNull();
    expect(container.querySelector("[data-testid=probe]")).toBe(probe);
    expect(container.querySelector(".app__map-editing-body")).toBe(body);
    rerender(<MapEditingWorkspace active={false} mapName="Foo" data={DATA} editSession={editSession} editing={editing} renderCanvas={renderCanvas} />);
    expect(container.querySelector("[data-testid=probe]")).toBe(probe);
    expect(mounts).toBe(1);
  });
});
