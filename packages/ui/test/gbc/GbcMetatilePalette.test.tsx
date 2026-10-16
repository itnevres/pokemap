import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { GbcMetatilePalette } from "../../src/gbc/GbcMetatilePalette.js";
import type { ThumbSignature } from "../../src/shared/useUniformRows.js";

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
    expect(img?.getAttribute("loading")).toBeNull();
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

  // Plan 9F
  const labels = (el: Element | null) => [...(el?.querySelectorAll(".gbc-metatile-palette__cell") ?? [])].map((b) => b.getAttribute("aria-label"));

  it("rows of 4, folded at the middle into two columns; caption, Selection, search and switch pinned", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={16} />);
    expect(labels(container.querySelector(".palette__column--left"))).toEqual(["metatile 0x0", "metatile 0x1", "metatile 0x2", "metatile 0x3", "metatile 0x4", "metatile 0x5", "metatile 0x6", "metatile 0x7"]);
    expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x8");
    expect((container.querySelector(".palette__column--left") as HTMLElement).style.gridTemplateColumns).toBe("repeat(4, 32px)");
    const pinned = container.querySelector(".palette__pinned")!;
    expect(pinned.textContent).toContain("T · 16 metatiles");
    expect(pinned.textContent).toContain("Selection · Nothing picked");
    expect(pinned.querySelector('input[placeholder="Search by hex id…"]')).toBeTruthy();
    expect(container.querySelector(".palette__scroll .gbc-metatile-palette__grid")).toBeTruthy();
  });

  it("one row of blocks is one column, no empty right column (Review Focus 5)", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={3} />);
    expect(container.querySelector(".palette__column--right")).toBeNull();
  });

  it("folds after a uniform row once thumbnails load; a time-of-day change starts over (Review Focus 2)", async () => {
    // 6 rows of 4; row 0 (ids 0-3) is blank -> cut 1? |1-3| = 2 -> it is the only candidate -> right column starts at 0x4.
    const sig: ThumbSignature = (img) => (/\/[0-3]\.png/.test(img.getAttribute("src")!) ? "blank" : img.getAttribute("src"));
    const { container, rerender } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={24} thumbSignature={sig} />);
    expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0xc");
    act(() => {
      for (const img of container.querySelectorAll(".palette__scroll img")) fireEvent.load(img);
    });
    await waitFor(() => expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0x4"));
    rerender(<GbcMetatilePalette mapName="M" time="nite" tilesetName="T" metatileCount={24} thumbSignature={sig} />);
    await waitFor(() => expect(labels(container.querySelector(".palette__column--right"))[0]).toBe("metatile 0xc"));
  });

  it("search filters by hex id into one column", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={32} />);
    fireEvent.change(screen.getByPlaceholderText("Search by hex id…"), { target: { value: "1f" } });
    expect(labels(container)).toEqual(["metatile 0x1f"]);
    expect(container.querySelector(".palette__column--right")).toBeNull();
  });

  it("the Selection box shows the picked block at 32 px", () => {
    const { container } = render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={8} onSelect={() => {}} selected={5} />);
    expect(container.querySelector(".palette__selection")!.textContent).toBe("Selection · 0x5");
    const img = container.querySelector(".palette__selection img")!;
    expect(img.getAttribute("src")).toBe("/api/metatile/M/5.png?time=day");
    expect(img.getAttribute("width")).toBe("32");
  });

  it("a block both picked and hovered carries both classes (Review Focus 4)", () => {
    render(<GbcMetatilePalette mapName="M" time="day" tilesetName="T" metatileCount={8} onSelect={() => {}} selected={2} highlightId={2} />);
    const cls = screen.getByRole("button", { name: "metatile 0x2" }).className;
    expect(cls).toContain("gbc-metatile-palette__cell--picked");
    expect(cls).toContain("gbc-metatile-palette__cell--selected");
  });
});
