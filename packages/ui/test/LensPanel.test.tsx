import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LensPanel } from "../src/components/LensPanel.js";

const LENSES = ["level-curve", "empty-maps", "unused-species", "method"] as const;

describe("LensPanel", () => {
  it("starts with every lens off", () => {
    render(<LensPanel active={null} onChange={() => {}} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    for (const l of LENSES) expect(screen.getByLabelText(new RegExp(l, "i")).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a legend the moment a lens is turned on", () => {
    const onChange = vi.fn();
    render(<LensPanel active="level-curve" onChange={onChange} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByText(/average encounter level/i)).toBeTruthy();
  });

  it("states the finding in plain words with a next action", () => {
    render(<LensPanel active="empty-maps" onChange={() => {}} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    expect(screen.getByText(/982 maps have no encounters/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /list them/i })).toBeTruthy();
  });

  it("only one lens is active at a time", () => {
    const onChange = vi.fn();
    render(<LensPanel active="level-curve" onChange={onChange} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    fireEvent.click(screen.getByLabelText(/empty-maps/i));
    expect(onChange).toHaveBeenCalledWith("empty-maps");
  });

  // Added during this task's own teeth-proof pass: none of the four tests
  // above ever click the CURRENTLY active lens's own button -- every one of
  // them either starts with nothing active, or clicks a DIFFERENT lens.
  // Deliberately breaking the toggle-off branch (onChange(active === lens
  // ? null : lens) -> unconditional onChange(lens)) left all four still
  // green, which is exactly the gap this closes.
  it("clicking the already-active lens's own button turns it off", () => {
    const onChange = vi.fn();
    render(<LensPanel active="method" onChange={onChange} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    fireEvent.click(screen.getByLabelText(/method/i));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // Added during this task's own teeth-proof pass: the given tests' fixture
  // ({ emptyMaps: 982, unusedSpecies: 12 }) happens to equal the spec's own
  // example numbers, so a component that hardcoded the literal strings
  // "982"/"12" instead of interpolating `summary` would still pass every
  // test above -- confirmed by deliberately hardcoding them and re-running
  // this file, which stayed green. Different fixture numbers here would
  // fail against a hardcoded implementation while still passing a correct,
  // interpolating one.
  it("renders whatever counts it is given, not the spec's own example numbers", () => {
    const first = render(<LensPanel active="empty-maps" onChange={() => {}} summary={{ emptyMaps: 5, unusedSpecies: 3 }} />);
    expect(screen.getByText(/5 maps have no encounters/i)).toBeTruthy();
    expect(screen.queryByText(/982 maps/i)).toBeNull();
    first.unmount();

    render(<LensPanel active="unused-species" onChange={() => {}} summary={{ emptyMaps: 5, unusedSpecies: 3 }} />);
    expect(screen.getByText(/3 species appear in no encounter table/i)).toBeTruthy();
  });
});
