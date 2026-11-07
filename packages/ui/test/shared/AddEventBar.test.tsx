import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EventKind } from "@pokemap/core/src/addEvent/types.js";
import { AddEventBar } from "../../src/shared/AddEventBar.js";

const labels = [
  "Add Object: click a tile, then fill in the details",
  "Add Warp: click a tile, then pick the destination",
  "Add Coord Event: click a tile, then pick the trigger and script",
  "Add BG Event: click a tile, then pick the sign or hidden item",
];
describe("AddEventBar", () => {
  it("has four distinct decorative icons and exact labels/tooltips in one row", () => {
    render(<AddEventBar placing={null} onToggle={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(new Set(buttons.map(b => b.querySelector("svg")?.innerHTML)).size).toBe(4);
    buttons.forEach((button, i) => {
      expect(button.getAttribute("aria-label")).toBe(labels[i]);
      expect(button.title).toBe(labels[i]);
      expect(button.textContent).toBe("");
      expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(button.parentElement).toBe(buttons[0]!.parentElement);
    });
  });
  it.each(["object", "warp", "coord", "bg"] as const)("toggles %s and reflects pressed state", kind => {
    function Host() {
      const [placing, setPlacing] = useState<EventKind | null>(null);
      return <AddEventBar placing={placing} onToggle={k => setPlacing(old => old === k ? null : k)} />;
    }
    render(<Host />);
    const button = screen.getAllByRole("button")[["object", "warp", "coord", "bg"].indexOf(kind)]!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
  it("uses the disabled reason as title and blocks toggles", () => {
    const toggle = vi.fn();
    render(<AddEventBar placing={null} onToggle={toggle} disabled={{ object: "Map has 15 objects" }} />);
    const button = screen.getByRole("button", { name: labels[0] }) as HTMLButtonElement;
    expect(button.title).toBe("Map has 15 objects");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(toggle).not.toHaveBeenCalled();
  });
});
