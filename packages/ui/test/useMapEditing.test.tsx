import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapEditing } from "../src/hooks/useMapEditing.js";
import type { UseEditSessionResult } from "../src/hooks/useEditSession.js";
import type { MapData } from "@pokemap/core/src/load/maps.js";

const MAP: MapData = {
  id: "MAP_FOO", name: "Foo", layout: "LAYOUT_FOO", music: "MUS_DUMMY",
  regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
  connections: [],
  objectEvents: [
    { graphicsId: "OBJ_EVENT_GFX_BOY_1", x: 3, y: 4, elevation: 0, movementType: "MOVEMENT_TYPE_FACE_DOWN", movementRangeX: 1, movementRangeY: 1, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "NULL", flag: "0" },
  ],
  warpEvents: [], coordEvents: [], bgEvents: [],
};
const editSession = { map: MAP } as unknown as UseEditSessionResult;

describe("useMapEditing", () => {
  it("resetForMapChange clears selectedEvent and currentStamp but keeps activeToolKind and collisionValue", () => {
    const { result } = renderHook(() => useMapEditing({ editSession, layoutData: null }));
    const stamp = { width: 1, height: 1, cells: [{ metatileId: 9 }] };
    act(() => {
      result.current.setActiveToolKind("pencil");
      result.current.setCollisionValue({ collision: 1, elevation: 2 });
      result.current.setCurrentStamp(stamp);
      result.current.onSelectEvent({ kind: "object", index: 0 });
    });
    expect(result.current.selectedEvent).toMatchObject({ kind: "object", index: 0, x: 3, y: 4 });
    expect(result.current.currentStamp).toBe(stamp);
    expect(result.current.activeTool).toEqual({ kind: "pencil", stamp });

    act(() => result.current.resetForMapChange());

    expect(result.current.selectedEvent).toBeNull();
    expect(result.current.currentStamp).toBeNull();
    expect(result.current.activeToolKind).toBe("pencil");
    expect(result.current.collisionValue).toEqual({ collision: 1, elevation: 2 });
  });
});
