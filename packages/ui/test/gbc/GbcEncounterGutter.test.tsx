import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GbcEncounterGutter, chipText, type GbcEncounterGutterMapEntry } from "../../src/gbc/GbcEncounterGutter.js";
import type { GbcEncounterChance, GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

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

// Fix round (spec review F2): one fixture covering every method and every
// time/rod combination the plan/spec's own test lines call for, including a
// fish `day` row (F2b's "a morning fish row shown via its day tag").
const RICH_SOURCES: GbcEncounterSource[] = [
  { method: "grass", time: "morn", chances: [chance("LEDYBA", 45, 3, 5)] },
  { method: "grass", time: "day", chances: [chance("PIDGEY", 45, 3, 5)] },
  { method: "grass", time: "nite", chances: [chance("HOOTHOOT", 45, 3, 5)] },
  { method: "water", chances: [chance("POLIWAG", 60, 10, 15)] },
  { method: "fish", rod: "old", chances: [chance("MAGIKARP", 100, 5, 10)] },
  { method: "fish", rod: "good", time: "day", chances: [chance("GOLDEEN", 40, 10, 15)] },
  { method: "fish", rod: "good", time: "nite", chances: [chance("QWILFISH", 40, 15, 20)] },
  { method: "headbutt", list: "common", chances: [chance("AIPOM", 80, 5, 10)] },
  { method: "headbutt", list: "rare", chances: [chance("HERACROSS", 20, 10, 15)] },
  { method: "rock", chances: [chance("GEODUDE", 50, 5, 8)] },
];

/** The gutter's own row order (spec's "grass, water, fish, headbutt, rock"). */
function methodTags(): string[] {
  return [...document.querySelectorAll(".encounter-gutter__method-tag")].map((e) => e.textContent);
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

  // Fix round (spec review F2a): pins the exact ORDERED label list (not just
  // per-label presence/absence) at each of the 3 times, against one rich
  // fixture covering every method and rod/time combination -- kills R1
  // (reversing the method-group sort).
  it("pins the exact ordered label list at Morn (incl. 'Fish · Good Rod · day')", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", RICH_SOURCES)]} zoom={32} time="morn" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(methodTags()).toEqual([
      "Grass · morn",
      "Surf",
      "Fish · Old Rod",
      "Fish · Good Rod · day",
      "Headbutt · common",
      "Headbutt · rare",
      "Rock Smash",
    ]);
  });

  it("pins the exact ordered label list at Day", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", RICH_SOURCES)]} zoom={32} time="day" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(methodTags()).toEqual([
      "Grass · day",
      "Surf",
      "Fish · Old Rod",
      "Fish · Good Rod · day",
      "Headbutt · common",
      "Headbutt · rare",
      "Rock Smash",
    ]);
  });

  it("pins the exact ordered label list at Nite", () => {
    render(<GbcEncounterGutter maps={[entry("Route29", RICH_SOURCES)]} zoom={32} time="nite" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(methodTags()).toEqual([
      "Grass · nite",
      "Surf",
      "Fish · Old Rod",
      "Fish · Good Rod · nite",
      "Headbutt · common",
      "Headbutt · rare",
      "Rock Smash",
    ]);
  });

  // Fix round (spec review F2c): pins the LOD collapse boundary exactly --
  // kills R2 (threshold 8->5) and R3 ("<" changed to "<=").
  it("collapses to a badge at zoom 7 (just below the LOD threshold) and expands to a full strip at zoom 8 (exactly at it)", () => {
    const { rerender } = render(<GbcEncounterGutter maps={[entry("Route29", RICH_SOURCES)]} zoom={7} time="day" />);
    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));
    expect(document.querySelector(".encounter-gutter__badge")).toBeTruthy();
    expect(document.querySelector(".encounter-gutter__strip")).toBeNull();

    rerender(<GbcEncounterGutter maps={[entry("Route29", RICH_SOURCES)]} zoom={8} time="day" />);
    expect(document.querySelector(".encounter-gutter__strip")).toBeTruthy();
    expect(document.querySelector(".encounter-gutter__badge")).toBeNull();
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
