import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GbcMetatilePalette } from "../../src/gbc/GbcMetatilePalette.js";

let originalScrollIntoView: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
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

  it("aria-current moves with highlightId, and the selected class follows it", () => {
    const { rerender, container } = render(
      <GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={0} />,
    );
    const cellAt = (id: number) => container.querySelectorAll(".gbc-metatile-palette__cell")[id] as HTMLElement;

    expect(cellAt(0).getAttribute("aria-current")).toBe("true");
    expect(cellAt(1).getAttribute("aria-current")).toBeNull();
    expect(cellAt(0).className).toContain("gbc-metatile-palette__cell--selected");

    rerender(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={2} />);
    expect(cellAt(0).getAttribute("aria-current")).toBeNull();
    expect(cellAt(2).getAttribute("aria-current")).toBe("true");
    expect(cellAt(2).className).toContain("gbc-metatile-palette__cell--selected");
  });

  it("no cell is aria-current when highlightId is null", () => {
    const { container } = render(<GbcMetatilePalette mapName="Foo" time="day" tilesetName="T" metatileCount={3} highlightId={null} />);
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
});
