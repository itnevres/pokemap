import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { GbcEventInspector, duplicateArgs } from "../../src/gbc/GbcEventInspector.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";

// Measured from pokecrystal-PerfPlus maps/NewBarkTown.asm (read only), line 302.
const TEACHER = { x: 6, y: 8, sprite: "SPRITE_TEACHER", moveData: "SPRITEMOVEDATA_SPINRANDOM_SLOW", radiusX: 1, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "NewBarkTownTeacherScript", eventFlag: "-1", lineIndex: 0 };
const TEACHER_ARGS = ["7", "8", "SPRITE_TEACHER", "SPRITEMOVEDATA_SPINRANDOM_SLOW", "1", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", "NewBarkTownTeacherScript", "-1"];

const EVENTS: GbcMapEvents = {
  warps: [{ x: 3, y: 4, mapConst: "ELMS_HOUSE", destWarp: 2, lineIndex: 0 }],
  coords: [{ x: 1, y: 8, sceneConst: "SCENE_X", script: "CoordScript", lineIndex: 0 }],
  bgs: [{ x: 5, y: 5, bgEventType: "BGEVENT_READ", script: "SignScript", lineIndex: 0 }],
  objects: [TEACHER],
  sceneScripts: [], callbacks: [], objectConsts: [],
};

function setup(over: Partial<React.ComponentProps<typeof GbcEventInspector>> = {}) {
  const props = {
    events: EVENTS, selected: { kind: "object" as const, index: 0 }, stepsW: 40, stepsH: 18,
    onMove: vi.fn(), onDelete: vi.fn(() => Promise.resolve()), onDuplicate: vi.fn(() => Promise.resolve()),
    warnings: [], onDismissWarnings: vi.fn(), ...over,
  };
  render(<GbcEventInspector {...props} />);
  return props;
}

describe("duplicateArgs", () => {
  it("rebuilds a real NewBarkTown object's 13 args in macro order at (x+1, y)", () => {
    expect(duplicateArgs("object", TEACHER, 40, 18)).toEqual(TEACHER_ARGS);
  });
  it("warp / coord / bg in macro order", () => {
    expect(duplicateArgs("warp", EVENTS.warps[0]!, 40, 18)).toEqual(["4", "4", "ELMS_HOUSE", "2"]);
    expect(duplicateArgs("coord", EVENTS.coords[0]!, 40, 18)).toEqual(["2", "8", "SCENE_X", "CoordScript"]);
    expect(duplicateArgs("bg", EVENTS.bgs[0]!, 40, 18)).toEqual(["6", "5", "BGEVENT_READ", "SignScript"]);
  });
  it("at the right edge the copy goes LEFT of the source, never onto it; y is clamped to the grid", () => {
    expect(duplicateArgs("bg", { ...EVENTS.bgs[0]!, x: 39 }, 40, 18)[0]).toBe("38");
    expect(duplicateArgs("bg", { ...EVENTS.bgs[0]!, x: 0, y: 99 }, 1, 18).slice(0, 2)).toEqual(["0", "17"]);
  });

  it("every one of the 13 object fields lands in its own macro slot (all fields distinct)", () => {
    const o = { x: 10, y: 11, sprite: "SPRITE_S", moveData: "MOVE_M", radiusX: 2, radiusY: 3, hour1: "H1", hour2: "H2", palette: "PAL_P", objectType: "OBJECTTYPE_T", sightRange: 4, script: "ScriptL", eventFlag: "EVENT_F", lineIndex: 0 };
    expect(duplicateArgs("object", o, 40, 18)).toEqual(["11", "11", "SPRITE_S", "MOVE_M", "2", "3", "H1", "H2", "PAL_P", "OBJECTTYPE_T", "4", "ScriptL", "EVENT_F"]);
  });
});

describe("GbcEventInspector", () => {
  it("shows kind, index and a subtitle per kind", () => {
    setup();
    expect(screen.getByText("Object event #0")).toBeTruthy();
    expect(screen.getByText("SPRITE_TEACHER")).toBeTruthy();
  });

  it("warp subtitle reads -> MAP_CONST #destWarp", () => {
    setup({ selected: { kind: "warp", index: 0 } });
    expect(screen.getByText("→ ELMS_HOUSE #2")).toBeTruthy();
  });

  it("move commits in steps on blur and on Enter, not per keystroke", () => {
    const p = setup();
    const x = screen.getByLabelText("X (steps)") as HTMLInputElement;
    fireEvent.change(x, { target: { value: "9" } });
    expect(p.onMove).not.toHaveBeenCalled();
    fireEvent.blur(x);
    expect(p.onMove).toHaveBeenCalledWith({ kind: "object", index: 0, x: 9, y: 8 });
    const y = screen.getByLabelText("Y (steps)") as HTMLInputElement;
    fireEvent.change(y, { target: { value: "3" } });
    const blur = vi.spyOn(y, "blur");
    fireEvent.keyDown(y, { key: "Enter" });
    expect(blur).toHaveBeenCalled();
  });

  it("a cleared field reverts on blur and sends nothing; no NaN reaches the input", () => {
    const p = setup();
    const x = screen.getByLabelText("X (steps)") as HTMLInputElement;
    fireEvent.change(x, { target: { value: "" } });
    fireEvent.blur(x);
    expect(p.onMove).not.toHaveBeenCalled();
    expect(x.value).toBe("6");
  });

  it("a blur without a change sends nothing", () => {
    const p = setup();
    fireEvent.blur(screen.getByLabelText("X (steps)"));
    expect(p.onMove).not.toHaveBeenCalled();
  });

  it("delete passes the ref; the buttons are disabled while it is in flight", async () => {
    let done!: () => void;
    const p = setup({ onDelete: vi.fn(() => new Promise<void>((r) => { done = r; })) });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledWith({ kind: "object", index: 0 });
    await waitFor(() => expect((screen.getByRole("button", { name: /Deleting/ }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => done());
    await waitFor(() => expect((screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("Duplicate posts the exact reconstructed args", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(p.onDuplicate).toHaveBeenCalledWith("object", TEACHER_ARGS);
  });

  it("no selection: Duplicate is disabled and the empty state explains how to add", () => {
    setup({ selected: null });
    expect((screen.getByRole("button", { name: "Duplicate" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Select an event to duplicate it\. To add one from scratch, use/)).toBeTruthy();
    expect(screen.getByText("pokemap event add")).toBeTruthy();
  });

  it("warp renumber warnings are listed in a dismissible role=status", () => {
    const p = setup({ selected: null, warnings: [{ fromMap: "Other", warpIndex: 1, destWarp: 3 }] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Other warp[1] → 3");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss warnings" }));
    expect(p.onDismissWarnings).toHaveBeenCalled();
  });

  it("no warnings: no status region", () => {
    setup();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
