import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteFrame, PaletteSelection, paletteHex } from "../../src/shared/PaletteFrame.js";
import { FoldedGrid } from "../../src/shared/FoldedGrid.js";

const src = (id: number) => `/t/${id}.png`;

describe("PaletteFrame (Plan 9 addendum R-F5)", () => {
  it("pins caption, selection, search and Follow hover outside the scroller; only children scroll", () => {
    const onQuery = vi.fn();
    const { container } = render(
      <PaletteFrame className="metatile-palette" caption="T · 3 metatiles" selection={<p>sel</p>} query="" onQuery={onQuery} follow onFollow={() => {}}>
        <div className="kid" />
      </PaletteFrame>,
    );
    const root = container.firstElementChild!;
    expect(root.className.split(" ")[0]).toBe("metatile-palette");
    const pinned = root.querySelector(".palette__pinned")!;
    const scroll = root.querySelector(".palette__scroll")!;
    expect(pinned.textContent).toContain("T · 3 metatiles");
    expect(pinned.textContent).toContain("sel");
    expect(pinned.querySelector('input[placeholder="Search by hex id…"]')).toBeTruthy();
    expect(pinned.querySelector('[role="switch"][aria-label="Follow hover"]')).toBeTruthy();
    expect(scroll.querySelector(".kid")).toBeTruthy();
    expect(pinned.contains(scroll)).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("Search by hex id…"), { target: { value: "1a" } });
    expect(onQuery).toHaveBeenCalledWith("1a");
  });
});

describe("PaletteSelection (Plan 9 addendum R-F6)", () => {
  it("says Nothing picked and shows no image when empty", () => {
    const { container } = render(<PaletteSelection cells={[]} width={0} src={src} cellPx={16} />);
    expect(container.textContent).toBe("Selection · Nothing picked");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows one cell with its hex id", () => {
    const { container } = render(<PaletteSelection cells={[26]} width={1} src={src} cellPx={32} />);
    expect(container.textContent).toBe("Selection · 0x1A");
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/t/26.png");
  });

  it("shows a 3x2 stamp abutting, holes kept as blanks, captioned from the first id", () => {
    const { container } = render(<PaletteSelection cells={[null, 1, 2, 8, 9, 10]} width={3} src={src} cellPx={16} />);
    expect(container.textContent).toBe("Selection · 3x2 from 0x1");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.querySelectorAll(".palette__selection-hole")).toHaveLength(1);
    expect((container.querySelector(".palette__selection-grid") as HTMLElement).style.gridTemplateColumns).toBe("repeat(3, 16px)");
  });

  it("paletteHex is uppercase", () => {
    expect(paletteHex(0x2bc)).toBe("0x2BC");
  });
});

describe("FoldedGrid (Plan 9 addendum R-F2)", () => {
  const rows = [[0, 1], [2, 3], [4, 5], [6]];
  const cell = (id: number) => <span key={id} data-id={id} />;
  const ids = (el: Element | null) => [...(el?.querySelectorAll("[data-id]") ?? [])].map((e) => Number(e.getAttribute("data-id")));

  it("puts rows [0, fold) left and [fold, end) right, each a grid of `columns` cells", () => {
    const { container } = render(<FoldedGrid rows={rows} fold={2} columns={2} cellPx={16} className="metatile-palette__grid" renderCell={cell} />);
    const left = container.querySelector(".palette__column--left") as HTMLElement;
    const right = container.querySelector(".palette__column--right") as HTMLElement;
    expect(ids(left)).toEqual([0, 1, 2, 3]);
    expect(ids(right)).toEqual([4, 5, 6]);
    expect(left.style.gridTemplateColumns).toBe("repeat(2, 16px)");
    expect(container.querySelector(".metatile-palette__grid.palette__grid")).toBeTruthy();
  });

  it("renders no right column when fold >= rows.length (Review Focus 5)", () => {
    const { container } = render(<FoldedGrid rows={[[0]]} fold={1} columns={4} cellPx={32} className="g" renderCell={cell} />);
    expect(container.querySelector(".palette__column--right")).toBeNull();
    expect(ids(container.querySelector(".palette__column--left"))).toEqual([0]);
  });

  it("labels the grid as a group when asked (GBC keeps role=group, aria-label=Metatiles)", () => {
    const { container } = render(<FoldedGrid rows={rows} fold={2} columns={2} cellPx={32} className="gbc-metatile-palette__grid" groupLabel="Metatiles" renderCell={cell} />);
    const grid = container.querySelector(".gbc-metatile-palette__grid")!;
    expect(grid.getAttribute("role")).toBe("group");
    expect(grid.getAttribute("aria-label")).toBe("Metatiles");
  });
});
