import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GbcEncounterGutter, matchesTime, rowLabel, chipText, type GbcEncounterGutterMapEntry } from "../../src/gbc/GbcEncounterGutter.js";
import type { GbcEncounterChance, GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("matchesTime (pure)", () => {
  it("grass matches only its own exact time tag", () => {
    expect(matchesTime({ method: "grass", time: "morn" }, "morn")).toBe(true);
    expect(matchesTime({ method: "grass", time: "morn" }, "day")).toBe(false);
    expect(matchesTime({ method: "grass", time: "morn" }, "nite")).toBe(false);
    expect(matchesTime({ method: "grass", time: "day" }, "day")).toBe(true);
    expect(matchesTime({ method: "grass", time: "nite" }, "nite")).toBe(true);
  });

  // Mutation check #1: matchesTime must not treat morn as never matching
  // fish -- a fish source tagged "day" matches at BOTH morn and day
  // (fish.asm's own .TimeEncounter: anything short of NITE takes the day
  // entry).
  it("fish tagged 'day' matches at BOTH morn and day (mutation check #1)", () => {
    expect(matchesTime({ method: "fish", time: "day" }, "morn")).toBe(true);
    expect(matchesTime({ method: "fish", time: "day" }, "day")).toBe(true);
    expect(matchesTime({ method: "fish", time: "day" }, "nite")).toBe(false);
  });

  it("fish tagged 'nite' matches only nite", () => {
    expect(matchesTime({ method: "fish", time: "nite" }, "morn")).toBe(false);
    expect(matchesTime({ method: "fish", time: "nite" }, "day")).toBe(false);
    expect(matchesTime({ method: "fish", time: "nite" }, "nite")).toBe(true);
  });

  // Mutation check #2: an untagged (old-rod) fish source always matches,
  // regardless of the app's current time.
  it("an untagged (old-rod) fish source always matches, at every time (mutation check #2)", () => {
    expect(matchesTime({ method: "fish" }, "morn")).toBe(true);
    expect(matchesTime({ method: "fish" }, "day")).toBe(true);
    expect(matchesTime({ method: "fish" }, "nite")).toBe(true);
  });

  it("water/headbutt/rock (always untagged) always match, at every time", () => {
    for (const method of ["water", "headbutt", "rock"] as const) {
      for (const t of ["morn", "day", "nite"] as const) {
        expect(matchesTime({ method }, t)).toBe(true);
      }
    }
  });
});

describe("rowLabel (pure)", () => {
  it("matches the spec's own exact examples", () => {
    expect(rowLabel({ method: "grass", time: "morn", chances: [] })).toBe("Grass · morn");
    expect(rowLabel({ method: "water", chances: [] })).toBe("Surf");
    expect(rowLabel({ method: "fish", rod: "good", time: "day", chances: [] })).toBe("Fish · Good Rod · day");
    expect(rowLabel({ method: "fish", rod: "old", chances: [] })).toBe("Fish · Old Rod");
    expect(rowLabel({ method: "headbutt", list: "rare", chances: [] })).toBe("Headbutt · rare");
    expect(rowLabel({ method: "rock", chances: [] })).toBe("Rock Smash");
  });

  it("appends ' · swarm' for a conditional swarm source", () => {
    expect(rowLabel({ method: "grass", time: "morn", conditional: "swarm", chances: [] })).toBe("Grass · morn · swarm");
  });
});

describe("chipText (pure)", () => {
  const CHANCE: GbcEncounterChance = { species: "CHIKORITA", percent: 30, minLevel: 3, maxLevel: 5 };

  it("matches the spec's own example shape ('Name 30% Lv 3-5')", () => {
    expect(chipText(CHANCE, "rock")).toBe("Chikorita 30% Lv 3-5");
  });

  // Mutation check #7: grass and water levels get a trailing + (the runtime
  // GRASS_WATER_LEVEL_BUFF_MAX buff); other methods never do.
  it("appends a trailing + to the level for grass and water only (mutation check #7)", () => {
    expect(chipText(CHANCE, "grass")).toBe("Chikorita 30% Lv 3-5+");
    expect(chipText(CHANCE, "water")).toBe("Chikorita 30% Lv 3-5+");
    expect(chipText(CHANCE, "fish")).toBe("Chikorita 30% Lv 3-5");
    expect(chipText(CHANCE, "headbutt")).toBe("Chikorita 30% Lv 3-5");
    expect(chipText(CHANCE, "rock")).toBe("Chikorita 30% Lv 3-5");
  });

  it("rounds the percent (a chip is a short label, not full precision)", () => {
    expect(chipText({ ...CHANCE, percent: 45.6 }, "rock")).toBe("Chikorita 46% Lv 3-5");
  });
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function chance(species: string, percent: number, minLevel: number, maxLevel: number): GbcEncounterChance {
  return { species, percent, minLevel, maxLevel };
}

const ROUTE29_SOURCES: GbcEncounterSource[] = [
  { method: "grass", time: "morn", chances: [chance("LEDYBA", 45, 3, 5), chance("PIDGEY", 25, 3, 5)] },
  { method: "grass", time: "day", chances: [chance("PIDGEY", 45, 3, 5)] },
  { method: "headbutt", list: "common", chances: [chance("AIPOM", 80, 5, 10)] },
  { method: "headbutt", list: "rare", chances: [chance("HERACROSS", 20, 10, 15)] },
];

function entry(map: string, sources: GbcEncounterSource[] | undefined, rect = { x: 0, y: 0, width: 100, height: 100 }): GbcEncounterGutterMapEntry {
  return { map, rect, sources };
}

describe("GbcEncounterGutter", () => {
  it("is off by default -- no legend, no rows, until the toggle is clicked", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", ROUTE29_SOURCES)]} zoom={32} time="morn" />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(/Grass · morn/)).toBeNull();
    expect(screen.getByRole("button", { name: "Encounters" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a legend the moment the toggle is turned on", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", ROUTE29_SOURCES)]} zoom={32} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.getByRole("note")).toBeTruthy();
  });

  // Pins the exact row set at Morn: grass-morn matches (its own tag), fish
  // has no entries here, headbutt (untagged) always shows both rows --
  // ordered grass, then headbutt (water/fish absent from this fixture).
  it("shows only the time-matching rows, in method order, and pins the exact label list (Morn)", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", ROUTE29_SOURCES)]} zoom={32} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));

    expect(screen.getByText("Grass · morn")).toBeTruthy();
    expect(screen.queryByText("Grass · day")).toBeNull();
    expect(screen.getByText("Headbutt · common")).toBeTruthy();
    expect(screen.getByText("Headbutt · rare")).toBeTruthy();
  });

  // Switching time changes which rows show -- Day shows the grass-day row
  // instead of grass-morn; headbutt (untagged) is unaffected either way.
  it("switching time changes the rows (Day)", () => {
    const { rerender } = render(<GbcEncounterGutter maps={[entry("Route29", ROUTE29_SOURCES)]} zoom={32} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.getByText("Grass · morn")).toBeTruthy();

    rerender(<GbcEncounterGutter maps={[entry("Route29", ROUTE29_SOURCES)]} zoom={32} time="day" />);
    expect(screen.queryByText("Grass · morn")).toBeNull();
    expect(screen.getByText("Grass · day")).toBeTruthy();
    expect(screen.getByText("Headbutt · common")).toBeTruthy();
  });

  // Fix round (spec review F1, blocking): a swarm and non-swarm source that
  // share every other tag (real on the live corpus -- DarkCaveVioletEntrance,
  // Route32, Route35) used to collide on `rowKey`, which omitted
  // `conditional`. That produced duplicate React keys AND, on a time switch,
  // a stale row from the PREVIOUS time stuck around because React reused the
  // wrong keyed DOM node instead of unmounting it.
  it("a swarm row next to a non-swarm row with identical other tags gets a distinct key -- no stale row after a time switch, no duplicate-key warning", () => {
    const sources: GbcEncounterSource[] = [
      { method: "grass", time: "day", chances: [chance("A", 50, 3, 5)] },
      { method: "grass", time: "day", conditional: "swarm", chances: [chance("B", 50, 3, 5)] },
      { method: "grass", time: "nite", chances: [chance("C", 50, 3, 5)] },
      { method: "grass", time: "nite", conditional: "swarm", chances: [chance("D", 50, 3, 5)] },
    ];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(<GbcEncounterGutter maps={[entry("DarkCaveVioletEntrance", sources)]} zoom={32} time="day" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.getByText("Grass · day")).toBeTruthy();
    expect(screen.getByText("Grass · day · swarm")).toBeTruthy();

    rerender(<GbcEncounterGutter maps={[entry("DarkCaveVioletEntrance", sources)]} zoom={32} time="nite" />);
    expect(screen.queryByText("Grass · day")).toBeNull();
    expect(screen.queryByText("Grass · day · swarm")).toBeNull();
    expect(screen.getByText("Grass · nite")).toBeTruthy();
    expect(screen.getByText("Grass · nite · swarm")).toBeTruthy();

    const dupKeyWarnings = consoleError.mock.calls.filter((c) => String(c[0]).includes("same key"));
    expect(dupKeyWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("shows species chips with their level and percent, capped at 6, with a '+N more' overflow", () => {
    const many: GbcEncounterSource[] = [
      { method: "rock", chances: Array.from({ length: 8 }, (_, i) => chance(`SPECIES_${i}`, 10, 5, 8)) },
    ];
    render(<GbcEncounterGutter maps={[entry("Route29", many)]} zoom={32} time="day" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.getAllByRole("button", { name: /Species 0|Species 1/ })).toBeTruthy();
    // Fix round (spec review F9): the spec's own overflow text is "+N more",
    // not GBA's bare "+N" -- pinned here, not just "+2".
    expect(screen.getByText("+2 more")).toBeTruthy();
  });

  // Fix round (spec review F9): exactly CHIP_CAP (6) chances must show no
  // overflow element at all -- R5's own target (">" changed to ">=").
  it("a row with exactly 6 chances has no overflow element", () => {
    const exact: GbcEncounterSource[] = [
      { method: "rock", chances: Array.from({ length: 6 }, (_, i) => chance(`SPECIES_${i}`, 10, 5, 8)) },
    ];
    render(<GbcEncounterGutter maps={[entry("Route29", exact)]} zoom={32} time="day" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.queryByText(/more/)).toBeNull();
    expect(document.querySelector(".encounter-gutter__more")).toBeNull();
  });

  // Morn's matching rows are grass-morn (LEDYBA, PIDGEY) + headbutt-common
  // (AIPOM) + headbutt-rare (HERACROSS) -- 4 distinct species.
  it("collapses to a species-count badge below the LOD threshold (8 px/block)", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", ROUTE29_SOURCES)]} zoom={4} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.getByText(/Route29 · 4 species/)).toBeTruthy();
  });

  it("renders nothing for a map that is still loading (sources undefined)", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", undefined)]} zoom={32} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.queryByText(/Route29/)).toBeNull();
  });

  it("renders nothing for a map with no encounters at all (empty sources array)", () => {
    render(<GbcEncounterGutter maps={[entry("PlayersHouse1F", [])]} zoom={32} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(screen.queryByText(/PlayersHouse1F/)).toBeNull();
  });

  it("shows a chip tooltip on hover, with full-precision percent", () => {
    const one: GbcEncounterSource[] = [{ method: "rock", chances: [chance("GEODUDE", 45.6, 5, 8)] }];
    render(<GbcEncounterGutter maps={[entry("Route29", one)]} zoom={32} time="day" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Geodude/ }));
    expect(screen.getByRole("tooltip").textContent).toBe("Geodude · Lv 5-8 · 45.6%");
  });
});
