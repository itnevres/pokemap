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

  // Review fix: selectRect used to derive row/col straight from the raw
  // metatileId, which only works for a gapless 0..N-1 id run. `ids` jumps
  // from `primaryCount-1` straight to `split.metatiles` -- e.g. with
  // primaryCount=4, secondaryCount=3, columns=4, primary fills exactly one
  // row (ids 0-3) and secondary starts on the next visual row (640-642),
  // adjacent on screen but 636 apart by raw id. Dragging between them used
  // to produce a stamp spanning ids 504-647 (144 cells) -- none of which
  // the user could see or intended to select. This pins the fix: the
  // result must stay small and contain only ids actually on screen.
  it("a drag from the last primary id to the first secondary id produces a small rect, not one spanning the unused split gap", () => {
    const onSelect = vi.fn();
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={onSelect} columns={4} />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "metatile 0x3" })); // last primary id
    fireEvent.mouseUp(screen.getByRole("button", { name: "metatile 0x280" })); // first secondary id (640 decimal)

    expect(onSelect).toHaveBeenCalledTimes(1);
    const stamp = onSelect.mock.calls[0]![0] as { width: number; height: number; cells: ({ metatileId: number } | undefined)[] };
    expect(stamp.width).toBeLessThanOrEqual(4);
    expect(stamp.height).toBeLessThanOrEqual(2);
    const ids = stamp.cells.filter((c): c is { metatileId: number } => Boolean(c)).map((c) => c.metatileId).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 640, 641, 642]);
    // The old bug's own failure signature: nothing from the unused gap
    // (real ids 4-639, none of them ever rendered) leaks into the stamp.
    expect(ids.every((id) => id < 4 || id >= 640)).toBe(true);
  });

  // Review fix, second angle: the same raw-id math also broke under an
  // active search filter, since a filtered `visible` list is non-contiguous
  // by value in general (not just at the primary/secondary boundary).
  // primaryCount=18 with query "1" filters to ids 1 (0x1), 16 (0x10) and 17
  // (0x11) -- a real 14-id gap (2..15) sits, unrendered, between the first
  // two matches. Dragging between the first two cells actually on screen
  // (adjacent visually, columns=1) must select only those two filtered
  // ids, not the hidden gap between their raw values.
  it("a drag while a search filter is active operates against the filtered visible list, not the full id space", () => {
    const onSelect = vi.fn();
    render(<MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={18} secondaryCount={0} onSelect={onSelect} columns={1} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "1" } });

    fireEvent.mouseDown(screen.getByRole("button", { name: "metatile 0x1" }));
    fireEvent.mouseUp(screen.getByRole("button", { name: "metatile 0x10" }));
    expect(onSelect).toHaveBeenCalledWith({ width: 1, height: 2, cells: [{ metatileId: 1 }, { metatileId: 16 }] });
  });

  // Follow-up 6: MetatilePalette had no notion of a currently-selected cell
  // -- a pick worked (fed onSelect) but was invisible. `selected` is a
  // purely visual echo of App.tsx's own currentStamp, same controlled-prop
  // shape CollisionPalette's own `selected` already uses.
  it("highlights the cell whose id is in selected.cells, and no other", () => {
    render(
      <MetatilePalette
        layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3}
        onSelect={() => {}} selected={{ width: 1, height: 1, cells: [{ metatileId: 1 }] }}
      />,
    );
    const picked = screen.getByRole("button", { name: /metatile 0x1\b/i }) as HTMLButtonElement;
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.className).toContain("metatile-palette__cell--selected");
    // Regression guard: an <img> is natively draggable by default, which in
    // a real browser fires dragstart/dragend instead of a same-cell
    // mousedown -> different-cell mouseup pair, silently breaking
    // selectRect's own drag-to-select entirely (confirmed live, invisible
    // under jsdom's fireEvent.mouseDown/mouseUp, which has no native-drag
    // concept) -- pins the fix so a future cleanup of this <img> tag can't
    // silently drop the prop and reintroduce it.
    expect(picked.querySelector("img")!.draggable).toBe(false);

    const notPicked = screen.getByRole("button", { name: /metatile 0x2\b/i }) as HTMLButtonElement;
    expect(notPicked.getAttribute("aria-pressed")).toBe("false");
    expect(notPicked.className).not.toContain("metatile-palette__cell--selected");
  });

  // Regression guard, not just "doesn't crash": omitting `selected` (or
  // passing null, App.tsx's own initial currentStamp value) must not mark
  // ANY cell as selected.
  it("shows no cell as selected when selected is omitted or null", () => {
    const { rerender } = render(
      <MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={() => {}} />,
    );
    for (const btn of screen.getAllByRole("button", { name: /^metatile 0x/i })) {
      expect((btn as HTMLButtonElement).getAttribute("aria-pressed")).toBe("false");
    }

    rerender(
      <MetatilePalette layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3} onSelect={() => {}} selected={null} />,
    );
    for (const btn of screen.getAllByRole("button", { name: /^metatile 0x/i })) {
      expect((btn as HTMLButtonElement).getAttribute("aria-pressed")).toBe("false");
    }
  });

  // MetatilePalette is a controlled/uncontrolled mix: it calls onSelect, but
  // the actual highlight only moves once the PARENT re-renders with a new
  // `selected` prop (App.tsx's own currentStamp, set from onSelect). This
  // simulates that parent round trip and confirms the OLD highlight clears
  // -- not two cells highlighted at once.
  it("moves the highlight to a newly selected cell once the parent re-renders with the new selected prop, clearing the old one", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <MetatilePalette
        layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3}
        onSelect={onSelect} selected={{ width: 1, height: 1, cells: [{ metatileId: 1 }] }}
      />,
    );
    const first = screen.getByRole("button", { name: /metatile 0x1\b/i }) as HTMLButtonElement;
    const second = screen.getByRole("button", { name: /metatile 0x2\b/i }) as HTMLButtonElement;
    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 2 }] });
    // A real click alone doesn't move the highlight -- this component holds
    // no selection state of its own -- so without a re-render the OLD
    // selected prop is still in effect here.
    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("false");

    // Simulate App.tsx's own re-render with the new currentStamp.
    rerender(
      <MetatilePalette
        layoutName="Test_Layout" split={SPLIT} primaryCount={4} secondaryCount={3}
        onSelect={onSelect} selected={{ width: 1, height: 1, cells: [{ metatileId: 2 }] }}
      />,
    );
    expect(screen.getByRole("button", { name: /metatile 0x1\b/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /metatile 0x2\b/i }).getAttribute("aria-pressed")).toBe("true");
  });
});
