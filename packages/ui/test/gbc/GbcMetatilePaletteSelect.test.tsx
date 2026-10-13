import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { GbcMetatilePalette } from "../../src/gbc/GbcMetatilePalette.js";

const cells = (c: HTMLElement) => Array.from(c.querySelectorAll(".gbc-metatile-palette__cell")) as HTMLElement[];

describe("GbcMetatilePalette selection (Plan 7 Task 5)", () => {
  it("clicking a cell calls onSelect with a 1x1 stamp of that id", () => {
    const onSelect = vi.fn();
    const { container } = render(<GbcMetatilePalette mapName="A" time="day" tilesetName="T" metatileCount={4} onSelect={onSelect} />);
    fireEvent.click(cells(container)[2]!);
    expect(onSelect).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 2 }] });
  });

  it("the picked cell is aria-pressed and aria-current; the hover highlight is a distinct class and neither", () => {
    const { container } = render(<GbcMetatilePalette mapName="A" time="day" tilesetName="T" metatileCount={4} selected={1} highlightId={3} />);
    const cs = cells(container);
    expect(cs[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(cs[1]!.getAttribute("aria-current")).toBe("true");
    expect(cs[1]!.className).toContain("gbc-metatile-palette__cell--picked");
    expect(cs[1]!.className).not.toContain("gbc-metatile-palette__cell--selected");
    expect(cs[3]!.className).toContain("gbc-metatile-palette__cell--selected");
    expect(cs[3]!.className).not.toContain("gbc-metatile-palette__cell--picked");
    expect(cs[3]!.getAttribute("aria-current")).toBeNull();
    expect(cs[3]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("without onSelect cells are disabled buttons (inert, out of the Tab order)", () => {
    const onSelect = vi.fn();
    const { container } = render(<GbcMetatilePalette mapName="A" time="day" tilesetName="T" metatileCount={2} />);
    expect((cells(container)[0] as HTMLButtonElement).disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
