import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GbcMetatilePalette } from "../../src/gbc/GbcMetatilePalette.js";

let originalScrollIntoView: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe("GbcMetatilePalette", () => {
  it("renders metatileCount cells, with the exact src for one id", () => {
    const { container } = render(
      <GbcMetatilePalette mapName="NewBarkTown" time="day" tilesetName="TilesetJohto" metatileCount={5} />,
    );
    const cells = container.querySelectorAll(".gbc-metatile-palette__cell");
    expect(cells.length).toBe(5);

    const img = container.querySelector('img[src="/api/metatile/NewBarkTown/3.png?time=day"]');
    expect(img).toBeTruthy();
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("the grid is a labelled group of real buttons (Plan 7 Task 5 fix round: was list/listitem)", () => {
    const { container } = render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} />);
    const grid = container.querySelector(".gbc-metatile-palette__grid");
    expect(grid?.getAttribute("role")).toBe("group");
    expect(grid?.getAttribute("aria-label")).toBe("Metatiles");
    const cells = container.querySelectorAll(".gbc-metatile-palette__cell");
    expect(cells.length).toBe(3);
    for (const cell of cells) expect(cell.tagName).toBe("BUTTON");
  });

  it("encodes the map name in the thumbnail src", () => {
    const { container } = render(
      <GbcMetatilePalette mapName="New Bark Town" time="nite" tilesetName="TilesetJohto" metatileCount={1} />,
    );
    expect(container.querySelector('img[src="/api/metatile/New%20Bark%20Town/0.png?time=nite"]')).toBeTruthy();
  });

  it("each cell has an aria-label of metatile 0x..", () => {
    render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={17} />);
    expect(screen.getByLabelText("metatile 0x10")).toBeTruthy();
  });

  it("shows the header: <tileset name> · <count> metatiles", () => {
    render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="TilesetJohto" metatileCount={640} />);
    expect(screen.getByText("TilesetJohto · 640 metatiles")).toBeTruthy();
  });

  it("the hover class follows highlightId; hover is NOT aria-current (that marks the picked cell only)", () => {
    const { rerender, container } = render(
      <GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={0} />,
    );
    const cellAt = (id: number) => container.querySelectorAll(".gbc-metatile-palette__cell")[id] as HTMLElement;

    expect(cellAt(0).className).toContain("gbc-metatile-palette__cell--selected");
    expect(cellAt(1).className).not.toContain("gbc-metatile-palette__cell--selected");
    expect(container.querySelector('[aria-current="true"]')).toBeNull();

    rerender(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={2} />);
    expect(cellAt(0).className).not.toContain("gbc-metatile-palette__cell--selected");
    expect(cellAt(2).className).toContain("gbc-metatile-palette__cell--selected");
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
  });

  it("scrollIntoView is called once per highlight change, not per render", () => {
    const { rerender } = render(
      <GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={1} />,
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    // A re-render with the SAME highlightId (e.g. an unrelated parent
    // state change, like the time-of-day toggle) must NOT scroll again.
    rerender(<GbcMetatilePalette mapName="Foo" time="nite" tilesetName="T" metatileCount={3} highlightId={1} />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);

    // A real highlight change scrolls again.
    rerender(<GbcMetatilePalette mapName="Foo" time="nite" tilesetName="T" metatileCount={3} highlightId={2} />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("mutation check: scrolling on every render would call scrollIntoView more than once for the same highlightId", () => {
    // This is the same assertion as above, restated as the mutation check
    // the spec names explicitly (#7): a buggy version that scrolls
    // unconditionally on every render (e.g. no dependency array, or one
    // that always differs) would call scrollIntoView on the SECOND render
    // below too, failing this exact expectation.
    const { rerender } = render(
      <GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={1} />,
    );
    rerender(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={1} />);
    rerender(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={1} />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll at all when highlightId stays null across renders", () => {
    const { rerender } = render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} />);
    rerender(<GbcMetatilePalette mapName="Foo" time="nite" tilesetName="T" metatileCount={3} />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls the hovered cell into view while Follow hover is on (Plan 9 R4)", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={null} />);
    expect(screen.getByRole("switch", { name: "Follow hover" }).getAttribute("aria-checked")).toBe("true");
    rerender(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={1} />);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does not scroll once Follow hover is switched off, and the switch shows off (Plan 9 R4)", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={null} />);
    fireEvent.click(screen.getByRole("switch", { name: "Follow hover" }));
    expect(screen.getByRole("switch", { name: "Follow hover" }).getAttribute("aria-checked")).toBe("false");
    rerender(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={1} />);
    expect(scroll).not.toHaveBeenCalled();
  });
});
