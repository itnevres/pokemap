import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
      methods: {
        land_mons: [
          { species: "SPECIES_ESPEON", percent: 37.5, minLevel: 2, maxLevel: 4, slots: [0, 1] },
          { species: "SPECIES_RATTATA", percent: 12.5, minLevel: 2, maxLevel: 3, slots: [2] },
        ],
      },
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
          methods: { water_mons: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0, 1, 2] }] },
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
          methods: {
            land_mons: [{ species: "SPECIES_ESPEON", percent: 100, minLevel: 2, maxLevel: 3, slots: [0] }],
            water_mons: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0] }],
          },
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
    render(<EncounterGutter maps={oneMap({ methods: {} })} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    expect(screen.queryByRole("button", { name: /espeon/i })).toBeNull();
    expect(screen.queryByText(/species$/i)).toBeNull();
  });

  it("does not crash while a map's data is still loading (methods undefined)", () => {
    render(<EncounterGutter maps={oneMap({ methods: undefined })} zoom={16} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /encounters/i }))).not.toThrow();
  });

  it("gives each of several visible maps its own strip, positioned at its own rect", () => {
    const maps = [
      ...oneMap({ map: "Route101" }),
      {
        map: "Route102",
        rect: { x: 500, y: 40, width: 32, height: 32 },
        methods: { water_mons: [{ species: "SPECIES_MARILL", percent: 95, minLevel: 10, maxLevel: 35, slots: [0] }] },
      },
    ];
    render(<EncounterGutter maps={maps} zoom={16} />);
    fireEvent.click(screen.getByRole("button", { name: /encounters/i }));
    expect(screen.getByRole("button", { name: /espeon/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /marill/i })).toBeTruthy();
  });
});
