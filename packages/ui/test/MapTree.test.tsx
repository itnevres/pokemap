import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapTree } from "../src/components/MapTree.js";

const GROUPS = {
  groupOrder: ["gMapGroup_TownsAndRoutes", "gMapGroup_Dungeons"],
  groups: {
    gMapGroup_TownsAndRoutes: ["NewBarkTown", "Route29"],
    gMapGroup_Dungeons: ["NavelRock_Base"],
  },
};

describe("MapTree", () => {
  it("renders every group with its map count", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/TownsAndRoutes/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    // A substring regex matches the raw `gMapGroup_TownsAndRoutes` key just as
    // well as the stripped label, so the assertion above cannot tell whether
    // the prefix was stripped at all. Verified by mutation: deleting the
    // `.replace()` left all five tests green.
    expect(screen.queryByText(/^gMapGroup_/)).toBeNull();
  });

  it("filters maps as the user types, keeping groups that still match", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "navel" } });
    expect(screen.queryByText("NewBarkTown")).toBeNull();
    expect(screen.getByText("NavelRock_Base")).toBeTruthy();
  });

  it("calls onSelect with the map name", () => {
    let picked: string | null = null;
    render(<MapTree data={GROUPS} selected={null} onSelect={(n) => { picked = n; }} />);
    fireEvent.click(screen.getByText("Route29"));
    expect(picked).toBe("Route29");
  });

  it("says so when a filter matches nothing, rather than showing an empty panel", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "zzzz" } });
    expect(screen.getByText(/no maps match/i)).toBeTruthy();
  });

  it("marks the selected map for assistive tech, not just visually", () => {
    // `selected` is otherwise accepted and never asserted on, so a component
    // that ignored the prop entirely would pass every test above.
    render(<MapTree data={GROUPS} selected="Route29" onSelect={() => {}} />);
    expect(screen.getByText("Route29").getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("NewBarkTown").getAttribute("aria-current")).toBeNull();
  });

  it("does not grey anything out in Map mode, even with visibility data", () => {
    const visibility = new Map([["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={false} visibility={visibility} />);
    expect(screen.getByText("Route29").className).not.toContain("greyed");
  });

  it("greys out a World-mode map with no placement at all", () => {
    const visibility = new Map<string, { mapType: string; manual: boolean }>(); // nothing placed
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("Route29").className).toContain("greyed");
  });

  it("greys out a placed-but-hidden-by-type World-mode map, but not a shown one", () => {
    const visibility = new Map([
      ["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }],
      ["Route29", { mapType: "MAP_TYPE_INDOOR", manual: false }],
    ]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("NewBarkTown").className).not.toContain("greyed");
    expect(screen.getByText("Route29").className).toContain("greyed");
  });

  it("a manually-placed indoor map is not greyed out", () => {
    const visibility = new Map([["Route29", { mapType: "MAP_TYPE_INDOOR", manual: true }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("Route29").className).not.toContain("greyed");
  });

  it("a greyed entry is draggable, carrying its own map name as plain text", () => {
    const visibility = new Map<string, { mapType: string; manual: boolean }>();
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    const el = screen.getByText("Route29");
    expect(el.getAttribute("draggable")).toBe("true");
    const dataTransfer = { setData: vi.fn() };
    fireEvent.dragStart(el, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "Route29");
  });

  it("a shown entry is not specially draggable", () => {
    const visibility = new Map([["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    // React renders `draggable="false"` explicitly here (not merely "not
    // true") -- `.not.toBe("true")` would also pass for `null` or a typo
    // like "treu", so assert the actual value instead.
    expect(screen.getByText("NewBarkTown").getAttribute("draggable")).toBe("false");
  });

  it("gives a greyed row an explanatory title, and leaves a shown row without one", () => {
    const visibility = new Map([["NewBarkTown", { mapType: "MAP_TYPE_TOWN", manual: false }]]);
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={visibility} />);
    expect(screen.getByText("NewBarkTown").getAttribute("title")).toBeNull();
    expect(screen.getByText("Route29").getAttribute("title")).toContain("Not currently drawn");
  });

  it("treats every entry as shown while visibility is still loading (null), avoiding a flash of all-grey", () => {
    render(<MapTree data={GROUPS} selected={null} onSelect={() => {}} worldMode={true} visibility={null} />);
    expect(screen.getByText("Route29").className).not.toContain("greyed");
  });
});

describe("MapTree: scroll the selected row into view (Plan 6c C2)", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(Element.prototype, "scrollIntoView");
  });
  afterEach(() => spy.mockRestore());

  const props = { data: GROUPS, onSelect: () => {} };
  const calledOn = (i: number) => (spy.mock.contexts[i] as HTMLElement).textContent;

  it("a selection change scrolls the new row into view once, with block: nearest", () => {
    const { rerender } = render(<MapTree {...props} selected={null} />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<MapTree {...props} selected="Route29" />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    expect(calledOn(0)).toBe("Route29");
  });

  it("mounting with a selection scrolls that row once", () => {
    render(<MapTree {...props} selected="NavelRock_Base" />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calledOn(0)).toBe("NavelRock_Base");
  });

  it("a rerender with the same selection (even a new-but-equal data object) does not scroll again", () => {
    const { rerender } = render(<MapTree {...props} selected="Route29" />);
    rerender(<MapTree {...props} data={{ ...GROUPS }} selected="Route29" />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("typing in the filter does not scroll", () => {
    render(<MapTree {...props} selected="Route29" />);
    spy.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "route" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("a selection change while the filter has focus does not scroll, and focus stays in the filter", () => {
    const { rerender } = render(<MapTree {...props} selected={null} />);
    const filter = screen.getByPlaceholderText(/filter/i) as HTMLInputElement;
    filter.focus();
    rerender(<MapTree {...props} selected="Route29" />);
    expect(spy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(filter);
  });

  it("expands a collapsed group holding the newly selected map, then scrolls to it", () => {
    const { rerender } = render(<MapTree {...props} selected="NewBarkTown" />);
    const group = screen.getByText("NavelRock_Base").closest("details")!;
    group.open = false;
    spy.mockClear();
    rerender(<MapTree {...props} selected="NavelRock_Base" />);
    expect(group.open).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calledOn(0)).toBe("NavelRock_Base");
  });

  it("a selected map hidden by the filter does not scroll or throw", () => {
    const { rerender } = render(<MapTree {...props} selected={null} />);
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: "navel" } });
    rerender(<MapTree {...props} selected="Route29" />);
    expect(spy).not.toHaveBeenCalled();
  });
});
