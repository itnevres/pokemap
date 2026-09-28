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
    // Fix round (spec review F11): onListEmptyMaps is now required for the
    // "List them" button to render at all -- added here to keep testing
    // what this test always tested, matching the real GBA call site
    // (WorldCanvas.tsx always passes onListEmptyMaps={focusEmptyMaps}), the
    // one necessary edit to a pre-existing test this fix requires.
    render(
      <LensPanel active="empty-maps" onChange={() => {}} summary={{ emptyMaps: 982, unusedSpecies: 12 }} onListEmptyMaps={() => {}} />,
    );
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

  // Plan 6b Task 6 (mutation check #5): pins the GBA DEFAULT method key's
  // full content -- no prior test in this file ever activated the method
  // lens at all, so a change to LensPanel's own default METHOD_LENS_KEY
  // (e.g. dropping Rock Smash) would previously have gone undetected by any
  // GBA test.
  it("the method lens's default key (no methodKey prop) lists Water, Fishing and Rock Smash", () => {
    render(<LensPanel active="method" onChange={() => {}} summary={{ emptyMaps: 982, unusedSpecies: 12 }} />);
    expect(screen.getByText("Water (surfing)")).toBeTruthy();
    expect(screen.getByText("Fishing")).toBeTruthy();
    expect(screen.getByText("Rock Smash")).toBeTruthy();
  });

  // Plan 6b Task 6 (deliverable 1b): GBC's own methodKey/legendCopy props,
  // additive and optional -- every test above (no methodKey/legendCopy prop
  // passed) already pins that the GBA default rendering is unaffected by
  // this component gaining them.
  describe("GBC props (Plan 6b Task 6)", () => {
    const GBC_METHOD_KEY = [
      { slug: "water", label: "Water (surfing)" },
      { slug: "fishing", label: "Fish" },
      { slug: "headbutt", label: "Headbutt" },
      { slug: "rock-smash", label: "Rock Smash" },
    ];

    it("renders the given methodKey instead of the GBA default", () => {
      render(
        <LensPanel
          active="method"
          onChange={() => {}}
          summary={{ emptyMaps: 5, unusedSpecies: 3 }}
          methodKey={GBC_METHOD_KEY}
        />,
      );
      expect(screen.getByText("Headbutt")).toBeTruthy();
      expect(screen.queryByText("Rock Smash")).toBeTruthy();
      // The GBA default key's own "Fishing" label is not among GBC's (which
      // renamed it to "Fish") -- proves this isn't just GBA's key rendering
      // alongside the new one.
      expect(screen.queryByText("Fishing")).toBeNull();
    });

    it("renders the given legendCopy override for a lens, leaving an un-overridden lens at its GBA default", () => {
      render(
        <LensPanel
          active="method"
          onChange={() => {}}
          summary={{ emptyMaps: 5, unusedSpecies: 3 }}
          legendCopy={{ method: () => "Which maps reward surfing, fishing, headbutting trees or rock smash." }}
        />,
      );
      expect(screen.getByText(/headbutting trees or rock smash/i)).toBeTruthy();

      const empty = render(
        <LensPanel
          active="empty-maps"
          onChange={() => {}}
          summary={{ emptyMaps: 5, unusedSpecies: 3 }}
          legendCopy={{ method: () => "GBC method copy" }}
        />,
      );
      // empty-maps has no override in legendCopy above -- falls back to the
      // GBA default LEGEND_COPY, interpolating the same summary.
      expect(empty.getByText(/5 maps have no encounters/i)).toBeTruthy();
    });

    // Fix round (spec review F11): GBC mounts LensPanel with no
    // onListEmptyMaps handler -- the "List them" button must not render at
    // all (a visible dead button is worse than none), while every GBA call
    // site (which always passes the prop) is unaffected.
    it("hides the 'List them' button when onListEmptyMaps is unset", () => {
      render(<LensPanel active="empty-maps" onChange={() => {}} summary={{ emptyMaps: 5, unusedSpecies: 3 }} />);
      expect(screen.queryByRole("button", { name: /list them/i })).toBeNull();
    });

    it("still shows 'List them' when onListEmptyMaps IS given (GBA default)", () => {
      render(<LensPanel active="empty-maps" onChange={() => {}} summary={{ emptyMaps: 5, unusedSpecies: 3 }} onListEmptyMaps={() => {}} />);
      expect(screen.getByRole("button", { name: /list them/i })).toBeTruthy();
    });
  });
});
