import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LensPanel, LensLegend } from "../src/components/LensPanel.js";

const LENSES = ["level-curve", "empty-maps", "unused-species", "method"] as const;

const names = (n: number) => Array.from({ length: n }, (_, i) => `Map${i}`);
const sum = (e: number, u: number) => ({ emptyMapNames: names(e), unusedSpeciesNames: names(u) });

describe("LensPanel", () => {
  it("starts with every lens off", () => {
    render(<LensPanel active={null} onChange={() => {}} />);
    for (const l of LENSES) expect(screen.getByLabelText(new RegExp(l, "i")).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a legend the moment a lens is turned on", () => {
    render(<LensLegend active="level-curve" summary={sum(982, 12)} />);
    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByText(/average encounter level/i)).toBeTruthy();
  });

  it("states the finding in plain words with a next action", () => {
    render(<LensLegend active="empty-maps" summary={sum(982, 12)} onJumpToMap={() => {}} />);
    expect(screen.getByText(/982 maps have no encounters/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /list them/i })).toBeTruthy();
  });

  it("only one lens is active at a time", () => {
    const onChange = vi.fn();
    render(<LensPanel active="level-curve" onChange={onChange} />);
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
    render(<LensPanel active="method" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/method/i));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // Added during this task's own teeth-proof pass: the given tests' fixture
  // (`sum(982, 12)`) happens to equal the spec's own
  // example numbers, so a component that hardcoded the literal strings
  // "982"/"12" instead of interpolating `summary` would still pass every
  // test above -- confirmed by deliberately hardcoding them and re-running
  // this file, which stayed green. Different fixture numbers here would
  // fail against a hardcoded implementation while still passing a correct,
  // interpolating one.
  it("renders whatever counts it is given, not the spec's own example numbers", () => {
    const first = render(<LensLegend active="empty-maps" summary={sum(5, 3)} />);
    expect(screen.getByText(/5 maps have no encounters/i)).toBeTruthy();
    expect(screen.queryByText(/982 maps/i)).toBeNull();
    first.unmount();

    render(<LensLegend active="unused-species" summary={sum(5, 3)} />);
    expect(screen.getByText(/3 species appear in no encounter table/i)).toBeTruthy();
  });

  // Plan 6b Task 6 (mutation check #5): pins the GBA DEFAULT method key's
  // full content -- no prior test in this file ever activated the method
  // lens at all, so a change to LensPanel's own default METHOD_LENS_KEY
  // (e.g. dropping Rock Smash) would previously have gone undetected by any
  // GBA test.
  it("the method lens's default key (no methodKey prop) lists Water, Fishing and Rock Smash", () => {
    render(<LensLegend active="method" summary={sum(982, 12)} />);
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
        <LensLegend
          active="method"
          summary={sum(5, 3)}
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
        <LensLegend
          active="method"
          summary={sum(5, 3)}
          legendCopy={{ method: () => "Which maps reward surfing, fishing, headbutting trees or rock smash." }}
        />,
      );
      expect(screen.getByText(/headbutting trees or rock smash/i)).toBeTruthy();

      const empty = render(
        <LensLegend
          active="empty-maps"
          summary={sum(5, 3)}
          legendCopy={{ method: () => "GBC method copy" }}
        />,
      );
      // empty-maps has no override in legendCopy above -- falls back to the
      // GBA default LEGEND_COPY, interpolating the same summary.
      expect(empty.getByText(/5 maps have no encounters/i)).toBeTruthy();
    });
  });

  describe("LensLegend lists", () => {
    const MAPS = ["Route1", "PetalburgCity_Gym", "Interior9"];
    const lists = (e: string[], u: string[]) => ({ emptyMapNames: e, unusedSpeciesNames: u });

    it("renders nothing with no active lens", () => {
      const { container } = render(<LensLegend active={null} summary={sum(5, 3)} />);
      expect(container.firstChild).toBeNull();
    });

    it("List them toggles a list of exactly the given maps, in order", () => {
      render(<LensLegend active="empty-maps" summary={lists(MAPS, [])} onJumpToMap={() => {}} />);
      const btn = screen.getByRole("button", { name: "List them" });
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("list", { name: "Maps with no encounters" })).toBeNull();
      fireEvent.click(btn);
      const ul = screen.getByRole("list", { name: "Maps with no encounters" });
      expect(Array.from(ul.querySelectorAll("button")).map((b) => b.textContent)).toEqual(MAPS);
      const hide = screen.getByRole("button", { name: "Hide list" });
      expect(hide.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(hide);
      expect(screen.queryByRole("list", { name: "Maps with no encounters" })).toBeNull();
      const again = screen.getByRole("button", { name: "List them" });
      expect(again.getAttribute("aria-expanded")).toBe("false");
    });

    it("map entries carry the full name as a title", () => {
      render(<LensLegend active="empty-maps" summary={lists(MAPS, [])} onJumpToMap={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "List them" }));
      const ul = screen.getByRole("list", { name: "Maps with no encounters" });
      expect(Array.from(ul.querySelectorAll("button")).map((b) => b.getAttribute("title"))).toEqual(MAPS);
    });

    it("clicking an entry calls onJumpToMap with that map name", () => {
      const onJumpToMap = vi.fn();
      render(<LensLegend active="empty-maps" summary={lists(MAPS, [])} onJumpToMap={onJumpToMap} />);
      fireEvent.click(screen.getByRole("button", { name: "List them" }));
      fireEvent.click(screen.getByRole("button", { name: "PetalburgCity_Gym" }));
      expect(onJumpToMap).toHaveBeenCalledTimes(1);
      expect(onJumpToMap).toHaveBeenCalledWith("PetalburgCity_Gym");
    });

    it("without onJumpToMap there is no List them button (nothing to jump to)", () => {
      render(<LensLegend active="empty-maps" summary={lists(MAPS, [])} />);
      expect(screen.getByText(/3 maps have no encounters/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "List them" })).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("unused species list shows display names and icon urls, in order", () => {
      render(<LensLegend active="unused-species" summary={lists([], ["SPECIES_MR_MIME", "CELEBI"])} />);
      const btn = screen.getByRole("button", { name: "Show list" });
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(btn);
      const ul = screen.getByRole("list", { name: "Unused species" });
      expect(Array.from(ul.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["Mr. Mime", "Celebi"]);
      expect(Array.from(ul.querySelectorAll("img")).map((i) => i.getAttribute("src"))).toEqual([
        "/api/species/SPECIES_MR_MIME/icon.png",
        "/api/species/CELEBI/icon.png",
      ]);
      expect(screen.getByRole("button", { name: "Hide list" }).getAttribute("aria-expanded")).toBe("true");
      expect(Array.from(ul.querySelectorAll("span")).map((sp) => sp.getAttribute("title"))).toEqual(["Mr. Mime", "Celebi"]);
      fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
      expect(screen.queryByRole("list", { name: "Unused species" })).toBeNull();
      const again = screen.getByRole("button", { name: "Show list" });
      expect(again.getAttribute("aria-expanded")).toBe("false");
    });

    it("the species lens never shows the maps list, even with empty maps present", () => {
      render(<LensLegend active="unused-species" summary={lists(MAPS, ["CELEBI"])} onJumpToMap={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Show list" }));
      expect(screen.getByRole("list", { name: "Unused species" })).toBeTruthy();
      expect(screen.queryByRole("list", { name: "Maps with no encounters" })).toBeNull();
    });

    it("a list starts closed after every lens change", () => {
      const summary = lists(MAPS, ["CELEBI"]);
      const { rerender } = render(<LensLegend active="empty-maps" summary={summary} onJumpToMap={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "List them" }));
      expect(screen.getByRole("list", { name: "Maps with no encounters" })).toBeTruthy();
      rerender(<LensLegend active="unused-species" summary={summary} />);
      expect(screen.getByRole("button", { name: "Show list" })).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
      rerender(<LensLegend active="empty-maps" summary={summary} onJumpToMap={() => {}} />);
      expect(screen.getByRole("button", { name: "List them" })).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("has no list button when the array is empty", () => {
      const first = render(<LensLegend active="empty-maps" summary={lists([], ["CELEBI"])} onJumpToMap={() => {}} />);
      expect(screen.queryByRole("button", { name: "List them" })).toBeNull();
      first.unmount();
      render(<LensLegend active="unused-species" summary={lists(MAPS, [])} />);
      expect(screen.queryByRole("button", { name: "Show list" })).toBeNull();
    });

    it("a null summary (coverage not loaded) shows 'Loading coverage…' with no counts, buttons or method key", () => {
      for (const lens of ["empty-maps", "unused-species", "method"] as const) {
        const { unmount } = render(<LensLegend active={lens} summary={null} onJumpToMap={() => {}} />);
        expect(screen.getByText("Loading coverage…")).toBeTruthy();
        expect(screen.getByRole("note").textContent).not.toMatch(/\d|have no|appears? in no/);
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByText("Fishing")).toBeNull();
        unmount();
      }
    });

    it("the legend row is a named note", () => {
      render(<LensLegend active="level-curve" summary={sum(5, 3)} />);
      expect(screen.getByRole("note", { name: "Coverage lens legend" })).toBeTruthy();
    });

    it("singular counts read 'map has' / 'species appears'; other counts keep the plural copy", () => {
      const one = render(<LensLegend active="empty-maps" summary={sum(1, 1)} />);
      expect(one.container.textContent).toMatch(/^Empty maps1 map has no encounters\./);
      one.unmount();
      const sp = render(<LensLegend active="unused-species" summary={sum(1, 1)} />);
      expect(sp.container.textContent).toMatch(/1 species appears in no encounter table\./);
      sp.unmount();
      const zero = render(<LensLegend active="empty-maps" summary={sum(0, 0)} />);
      expect(zero.container.textContent).toMatch(/0 maps have no encounters\./);
    });
  });
});
