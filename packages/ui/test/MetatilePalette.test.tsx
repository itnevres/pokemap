import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetatilePalette } from "../src/components/MetatilePalette.js";

afterEach(() => vi.unstubAllGlobals());

const SPLIT = { version: "hns" as const, tiles: 640, metatiles: 640, pals: 7 };

describe("MetatilePalette", () => {
  it("renders one thumbnail per metatile up to primaryCount + secondaryCount, split-aware", () => {
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={() => {}} />);
    // 4 primary (0-3) + 3 secondary (640-642) = 7 selectable thumbnails.
    expect(screen.getAllByRole("button", { name: /^metatile 0x/i })).toHaveLength(7);
  });

  it("shows the split boundary as a labelled divider naming the real primary count and layout_version", () => {
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={() => {}} />);
    expect(screen.getByText(/640/)).toBeTruthy();
    expect(screen.getByText(/hns/)).toBeTruthy();
  });

  it("an id past the owning tileset's real count is struck through and not selectable", () => {
    // primaryCount=2 means ids 2..639 (up to split.metatiles) are past the
    // REAL primary count but still under the split boundary -- exactly the
    // Saffron_Temp shape (an id legal by split, illegal by real tileset
    // size). Render a small window so the test stays fast; pass a prop
    // limiting the visible id range for this purpose (see step 5's
    // component -- `visibleCount` overrides the rendered id set with a raw
    // 0..N-1 range specifically to force rendering into this gap for
    // testing; the default renders only real ids and never reaches here).
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={2} secondaryCount={3} onSelect={() => {}} visibleCount={5} />);
    const outOfRange = screen.getByRole("button", { name: /metatile 0x2\b/i }) as HTMLButtonElement;
    // No @testing-library/jest-dom in this repo (confirmed: no matcher
    // extension anywhere under packages/ui/test) -- `toBeDisabled()` is not
    // a real chai assertion here, so this checks the DOM property directly,
    // the same way every other test in this repo reads plain attributes
    // (e.g. EncounterGutter.test.tsx's `toggle.getAttribute("aria-pressed")`).
    expect(outOfRange.disabled).toBe(true);
    expect(outOfRange.className).toContain("out-of-range");
  });

  it("clicking a valid metatile calls onSelect with a 1x1 stamp naming that id", () => {
    const onSelect = vi.fn();
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));
    expect(onSelect).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 1 }] });
  });

  it("dragging a rectangle of metatiles selects a stamp matching that rectangle's own shape and ids", () => {
    const onSelect = vi.fn();
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={onSelect} columns={2} />);
    // With columns=2: ids 0,1 on row 0, ids 2,3 on row 1. Drag from id 0 to id 3 selects all four in a 2x2 stamp.
    fireEvent.mouseDown(screen.getByRole("button", { name: /metatile 0x0\b/i }));
    fireEvent.mouseUp(screen.getByRole("button", { name: /metatile 0x3\b/i }));
    expect(onSelect).toHaveBeenCalledWith({ width: 2, height: 2, cells: [{ metatileId: 0 }, { metatileId: 1 }, { metatileId: 2 }, { metatileId: 3 }] });
  });

  it("filters by hex id as the user types", () => {
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={20} secondaryCount={0} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "0x1" } });
    // 0x1, 0x10-0x13 (16-19 decimal, within primaryCount=20) all contain "1" in hex form when matched as a substring of "0x1..".
    expect(screen.queryByRole("button", { name: /metatile 0x0\b/i })).toBeNull();
    expect(screen.getByRole("button", { name: /metatile 0x1\b/i })).toBeTruthy();
  });
});
