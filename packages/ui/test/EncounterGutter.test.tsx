import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EncounterGutter, type EncounterGutterMapEntry } from "../src/components/EncounterGutter.js";

// Task 28's own file list has no "Test:" entry for this component -- every
// other UI component built in this plan (MapTree, MapCanvas, WorldCanvas)
// has one, and Plan 0 Section 4 states TDD is the norm. Treated as an
// omission, not an instruction to skip testing: this covers Step 5's four
// requirements the same way WorldCanvas.test.tsx covers WorldCanvas's own.

const RECT = { x: 100, y: 200, width: 32, height: 32 };

/**
 * Espeon's percent (37.5) is deliberately NOT derivable from its slot count
 * (2) or from Rattata's (1) -- if the gutter ever displayed
 * `slots.length` where it should display `percent`, every assertion below
 * that pins "37.5%" would catch it, and none would pass by coincidence.
 */
function oneMap(overrides: Partial<EncounterGutterMapEntry> = {}): EncounterGutterMapEntry[] {
  return [
    {
      map: "Route101",
      rect: RECT,
      methods: [
        {
          method: "land_mons",
          chances: [
            { species: "SPECIES_ESPEON", percent: 37.5, minLevel: 2, maxLevel: 4, slots: [0, 1] },
            { species: "SPECIES_RATTATA", percent: 12.5, minLevel: 2, maxLevel: 3, slots: [2] },
          ],
        },
      ],
      ...overrides,
    },
  ];
}

describe("EncounterGutter", () => {
  it("is off by default: the toggle reads unpressed and nothing else renders", () => {
    render(<EncounterGutter maps={oneMap()} zoom={16} />);
    const toggle = screen.getByRole("button", { name: /encounters/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("button", { name: /espeon/i })).toBeNull();
  });

  it("turning the toggle on opens the legend and shows the map's icon strip, grouped by method", () => {
    render(
      <EncounterGutter
        maps={oneMap({
          map: "Route102",
          methods: [
            {
              method: "water_mons",
              chances: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0, 1, 2] }],
            },
          ],
        })}
        zoom={16}
      />,
    );
    const toggle = screen.getByRole("button", { name: /encounters/i });
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    // No lens/overlay is ever active without its legend visible (spec §9).
    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByRole("button", { name: /marill/i })).toBeTruthy();
  });

  it("groups icons under separate method rows rather than one flat list", () => {
    render(
      <EncounterGutter
        maps={oneMap({
          methods: [
            { method: "land_mons", chances: [{ species: "SPECIES_ESPEON", percent: 100, minLevel: 2, maxLevel: 3, slots: [0] }] },
            { method: "water_mons", chances: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0] }] },
          ],
        })}
        zoom={16}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    // getAllByText, not getByText: the always-visible legend key repeats
    // every method name too, so "Land"/"Water" each appear at least twice
    // once the toggle is on -- this only needs to confirm the strip's own
    // per-method row tag is among them, not that it's the sole match.
    expect(screen.getAllByText(/^land$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^water$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /espeon/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /marill/i })).toBeTruthy();
  });

  it("hover reports species, level band and the true percentage -- never slot count", () => {
    render(<EncounterGutter maps={oneMap()} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));

    const icon = screen.getByRole("button", { name: /espeon/i });
    fireEvent.mouseEnter(icon);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toMatch(/espeon/i);
    expect(tooltip.textContent).toMatch(/Lv 2-4/);
    expect(tooltip.textContent).toMatch(/37\.5%/);
    // Espeon's own slot count (2) must not leak through in the percentage's
    // place -- it would misreport a 37.5% encounter as a 2% (or "2 slots") one.
    expect(tooltip.textContent).not.toMatch(/\b2%/);
    expect(tooltip.textContent).not.toMatch(/slot/i);
  });

  it("focus (not just mouse hover) reveals the same tooltip, for keyboard users", () => {
    render(<EncounterGutter maps={oneMap()} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    const icon = screen.getByRole("button", { name: /espeon/i });
    fireEvent.focus(icon);
    expect(screen.getByRole("tooltip").textContent).toMatch(/37\.5%/);
    fireEvent.blur(icon);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  // Review fix: a hovered/focused icon's tooltip used to be a DOM child of
  // the icon button, positioned via CSS `bottom: 100%` relative to it --
  // which put it inside two nested stacking contexts (the strip's own
  // `position: absolute` + `z-index`, and the icon's own on :hover/
  // :focus-visible) that trapped it no matter how high its own z-index was
  // set, so it painted underneath the legend rather than above it. jsdom
  // does not lay out real pixels, so a test cannot assert the fix's visual
  // effect the way live-browser verification did -- but it CAN assert the
  // structural fix that makes escaping possible: the tooltip must be a
  // sibling of the legend region, not a descendant of any per-map strip.
  it("renders the tooltip as a sibling of the legend region, not nested inside a map's strip", () => {
    const { container } = render(<EncounterGutter maps={oneMap()} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    fireEvent.mouseEnter(screen.getByRole("button", { name: /espeon/i }));

    const tooltip = screen.getByRole("tooltip");
    const root = container.querySelector(".encounter-gutter");
    const strip = container.querySelector(".encounter-gutter__strip");
    expect(tooltip.parentElement).toBe(root);
    expect(strip?.contains(tooltip)).toBe(false);
  });

  // Review fix: lifting the tooltip out to a top-level sibling (previous
  // fix, above) also lifted it out of its anchor icon's LIFETIME -- nothing
  // cleared `tooltip` state when the icon that opened it moved, unmounted,
  // or the whole gutter switched off out from under it. Confirmed live,
  // three ways (see the long comment on the useLayoutEffect in
  // EncounterGutter.tsx for the full account); these three tests pin each
  // one directly against the component's own state, not just its CSS.
  it("toggling the feature off clears an open tooltip, not just the strips it belonged to", () => {
    render(<EncounterGutter maps={oneMap()} zoom={16} />);
    const toggle = screen.getByRole("button", { name: /encounters/i });
    fireEvent.click(toggle);
    fireEvent.focus(screen.getByRole("button", { name: /espeon/i }));
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.click(toggle); // off -- legend, strips and the tooltip should all go
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("zooming past the collapse threshold clears an open tooltip rather than leaving it floating over a badge", () => {
    const { rerender } = render(<EncounterGutter maps={oneMap()} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    fireEvent.focus(screen.getByRole("button", { name: /espeon/i }));
    expect(screen.getByRole("tooltip")).toBeTruthy();

    rerender(<EncounterGutter maps={oneMap()} zoom={1} />); // crosses LOW_ZOOM_THRESHOLD -- the icon itself unmounts
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  // The bug's narrowest, easiest-to-miss form: a zoom change that never
  // crosses the collapse threshold at all (both 16 and 10 are well above
  // LOW_ZOOM_THRESHOLD=4) still moves every icon's real screen position --
  // WorldCanvas recomputes each map's `rect` from pan/zoom on every frame --
  // so a tooltip whose x/y were captured once, at focus time, would end up
  // pointing at stale coordinates even though `collapsed` never changed and
  // the icon never unmounted. Gating the tooltip's render on
  // `enabled && !collapsed` alone (without also watching `zoom`/`maps`)
  // would NOT catch this case -- both stay true throughout. This is the
  // one manifestation a render-only guard cannot fix; only clearing the
  // STATE on every zoom change does.
  it("zooming without crossing the collapse threshold still clears a stale tooltip, since the icon moved anyway", () => {
    const { rerender } = render(<EncounterGutter maps={oneMap()} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    fireEvent.focus(screen.getByRole("button", { name: /espeon/i }));
    expect(screen.getByRole("tooltip")).toBeTruthy();

    rerender(<EncounterGutter maps={oneMap()} zoom={10} />); // still well above the threshold -- never collapses
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("collapses to a count badge instead of icons below the readable-icon zoom threshold", () => {
    render(<EncounterGutter maps={oneMap()} zoom={1} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));

    // Two distinct species (Espeon, Rattata) on this map -- readable as a
    // count, not as unreadable icon soup at this zoom.
    expect(screen.queryByRole("button", { name: /espeon/i })).toBeNull();
    expect(screen.getByText(/2 species/i)).toBeTruthy();
  });

  it("shows full icon detail again once zoom crosses back above the threshold", () => {
    const { rerender } = render(<EncounterGutter maps={oneMap()} zoom={1} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    expect(screen.queryByRole("button", { name: /espeon/i })).toBeNull();

    rerender(<EncounterGutter maps={oneMap()} zoom={16} />);
    expect(screen.getByRole("button", { name: /espeon/i })).toBeTruthy();
    expect(screen.queryByText(/2 species/i)).toBeNull();
  });

  it("renders nothing extra for a map with no encounter table, rather than an error or a stray badge", () => {
    render(<EncounterGutter maps={oneMap({ methods: [] })} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    expect(screen.queryByRole("button", { name: /espeon/i })).toBeNull();
    expect(screen.queryByText(/species$/i)).toBeNull();
  });

  it("does not crash while a map's data is still loading (methods undefined)", () => {
    render(<EncounterGutter maps={oneMap({ methods: undefined })} zoom={16} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /encounters/i }))).not.toThrow();
  });

  it("gives each of several visible maps its own strip, positioned at its own rect", () => {
    const maps: EncounterGutterMapEntry[] = [
      ...oneMap({ map: "Route101" }),
      {
        map: "Route102",
        rect: { x: 500, y: 40, width: 32, height: 32 },
        methods: [
          {
            method: "water_mons",
            chances: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0] }],
          },
        ],
      },
    ];
    render(<EncounterGutter maps={maps} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    expect(screen.getByRole("button", { name: /espeon/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /marill/i })).toBeTruthy();
  });

  // Review fix: fishing_mons is three independent 100%-summing distributions
  // (Old/Good/Super Rod -- packages/core/src/load/encounters.ts's own
  // FISHING_RODS), not one. The server used to call speciesChances with no
  // `rod` option, silently defaulting to Old Rod under a plain "Fishing"
  // label with no disclosure that Good/Super Rod species were omitted
  // entirely. Each rod is now its own row (EncounterGutterRow.rod), so this
  // pins that the gutter (a) shows all three as distinct rows, (b) labels
  // each one honestly by rod, and (c) never blends two rods' species into
  // one row or one percentage.
  it("shows fishing as three separate, honestly-labelled rod rows -- never a silent Old-Rod-only default", () => {
    const { container } = render(
      <EncounterGutter
        maps={oneMap({
          methods: [
            { method: "fishing_mons", rod: "old", chances: [{ species: "SPECIES_MAGIKARP", percent: 70, minLevel: 5, maxLevel: 10, slots: [0] }] },
            { method: "fishing_mons", rod: "good", chances: [{ species: "SPECIES_GOLDEEN", percent: 60, minLevel: 10, maxLevel: 15, slots: [0] }] },
            { method: "fishing_mons", rod: "super", chances: [{ species: "SPECIES_GYARADOS", percent: 40, minLevel: 20, maxLevel: 25, slots: [0] }] },
          ],
        })}
        zoom={16}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));

    // Each rod's own species is present...
    expect(screen.getByRole("button", { name: /magikarp/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /goldeen/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /gyarados/i })).toBeTruthy();

    // ...as three separate rows...
    const strip = container.querySelector(".encounter-gutter__strip");
    expect(strip).toBeTruthy();
    const rows = within(strip as HTMLElement).getAllByText(/fishing/i, { selector: ".encounter-gutter__method-tag" });
    expect(rows.length).toBe(3);

    // ...each naming its rod explicitly rather than a bare "Fishing" that
    // would silently imply "the whole method". Scoped to the strip's own
    // row tags (not screen-wide) because the legend's explanatory prose
    // above also mentions "Old", "Good" and "Super Rod" in passing.
    const tagText = rows.map((r) => r.textContent);
    expect(tagText).toContain("Fishing (Old Rod)");
    expect(tagText).toContain("Fishing (Good Rod)");
    expect(tagText).toContain("Fishing (Super Rod)");
    expect(tagText).not.toContain("Fishing");
  });
});
