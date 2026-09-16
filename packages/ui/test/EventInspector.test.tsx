import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventInspector, type SelectedEvent } from "../src/components/EventInspector.js";

const objectEvent: SelectedEvent = {
  kind: "object", index: 0, x: 5, y: 6, elevation: 3,
  graphicsId: "OBJ_EVENT_GFX_BOY_1", movementType: "MOVEMENT_TYPE_FACE_DOWN",
};

// Real WarpEvent.destWarpId is a STRING (packages/core/src/load/maps.ts) --
// a positional index into another map's warp_events array that is
// frequently a symbolic constant (e.g. WARP_ID_NONE) rather than a numeric
// literal, per events.ts's own doc comment. The plan's own illustrative
// test used a number literal here; adapted to the real type.
const warpEvent: SelectedEvent = {
  kind: "warp", index: 0, x: 1, y: 1, elevation: 0, destMap: "PalletTown", destWarpId: "2",
};

// No @testing-library/jest-dom in this repo (confirmed against
// CollisionPalette.test.tsx/Toolbar.test.tsx: no matcher extension
// anywhere under packages/ui/test) -- toBeInTheDocument/toHaveValue are not
// real assertions here. Presence is read via .toBeNull()/.toBeTruthy() on
// the query result, and input values via the DOM `.value` property (always
// a string on an <input>, even type="number" -- compared as such below).
describe("EventInspector", () => {
  it("with no selection, shows an 'Add Event' control and no field editors", () => {
    render(<EventInspector selected={null} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add event/i })).toBeTruthy();
    expect(screen.queryByLabelText("X")).toBeNull();
  });

  it("with a selected object event, shows editable X/Y/elevation fields pre-filled with its current values", () => {
    render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Y") as HTMLInputElement).value).toBe("6");
    expect((screen.getByLabelText("Elevation") as HTMLInputElement).value).toBe("3");
  });

  it("editing X and blurring calls onMove with the event's kind/index and the new x", () => {
    const onMove = vi.fn();
    render(<EventInspector selected={objectEvent} onMove={onMove} onDelete={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "9" } });
    fireEvent.blur(screen.getByLabelText("X"));
    expect(onMove).toHaveBeenCalledWith({ kind: "object", index: 0, x: 9, y: 6, elevation: 3 });
  });

  it("clicking Delete calls onDelete with the selected event's kind/index", () => {
    const onDelete = vi.fn();
    render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={onDelete} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith({ kind: "object", index: 0 });
  });

  it("a warp event additionally shows Dest Map / Dest Warp fields (read-only, real destWarpId is a string), an object event does not", () => {
    const { unmount } = render(<EventInspector selected={warpEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    const destMap = screen.getByLabelText("Dest Map") as HTMLInputElement;
    const destWarp = screen.getByLabelText("Dest Warp") as HTMLInputElement;
    expect(destMap.value).toBe("PalletTown");
    expect(destWarp.value).toBe("2");
    expect(destMap.readOnly).toBe(true);
    expect(destWarp.readOnly).toBe(true);
    unmount();

    render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.queryByLabelText("Dest Map")).toBeNull();
  });

  it("resyncs its draft when the selected event's own reference changes (e.g. a fresh selection or a server round trip)", () => {
    const { rerender } = render(<EventInspector selected={objectEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("5");

    const moved: SelectedEvent = { ...objectEvent, x: 42 };
    rerender(<EventInspector selected={moved} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("42");
  });

  it("a coord event's open-ended fields don't crash the inspector and its `type` shows as a subtitle, not a labelled field", () => {
    const coordEvent: SelectedEvent = {
      kind: "coord", index: 2, x: 3, y: 4, elevation: 0, type: "TRIGGER", var: "VAR_TEMP_1", var_value: "1", script: "EventScript_Foo",
    };
    render(<EventInspector selected={coordEvent} onMove={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("TRIGGER")).toBeTruthy();
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("3");
  });
});
