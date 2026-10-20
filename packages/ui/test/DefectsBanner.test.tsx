import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DefectsBanner } from "../src/shared/DefectsBanner.js";
import type { DataDefect } from "@pokemap/core/src/defects/types.js";

const defect = (i: number): DataDefect => ({
  file: `maps/Test${i}.asm`, message: `Broken event ${i}`, kind: "gameplay", fix: `Move the event in maps/Test${i}.asm.`,
});

describe("DefectsBanner", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<DefectsBanner defects={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the kind label, message, file and fix in a non-dismissible alert", () => {
    render(<DefectsBanner defects={[defect(1)]} />);
    const alert = within(screen.getByRole("alert"));
    for (const text of ["Gameplay", "Broken event 1", "maps/Test1.asm", "Move the event in maps/Test1.asm."]) {
      expect(alert.getByText(text)).toBeTruthy();
    }
    expect(alert.queryByRole("button")).toBeNull();
  });

  it("shows five of seven defects and reveals the rest with Show all 7", () => {
    render(<DefectsBanner defects={Array.from({ length: 7 }, (_, i) => defect(i))} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("Broken event 5")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("Broken event 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("has no expansion control for exactly five defects", () => {
    render(<DefectsBanner defects={Array.from({ length: 5 }, (_, i) => defect(i))} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
