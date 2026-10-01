import { describe, it, expect } from "vitest";
import type { GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";
import {
  displaySpeciesName,
  matchesTime,
  rowLabel,
  summariseGba,
  summariseGbc,
  type GbaEncounterRow,
  type SpeciesRow,
  type SpeciesSummary,
} from "../../src/encounters/summary.js";

// ---------------------------------------------------------------------------
// Moved verbatim (Plan 6c B1) from test/gbc/GbcEncounterGutter.test.tsx:
// matchesTime/rowLabel now live in encounters/summary.ts.
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

describe("displaySpeciesName (pure)", () => {
  it("Title Cases per underscore word and strips an optional SPECIES_ prefix", () => {
    expect(displaySpeciesName("CHIKORITA")).toBe("Chikorita");
    expect(displaySpeciesName("NIDORAN_F")).toBe("Nidoran F");
    expect(displaySpeciesName("MR__MIME")).toBe("Mr Mime");
    expect(displaySpeciesName("HO_OH")).toBe("Ho Oh");
    expect(displaySpeciesName("SPECIES_NIDORAN_F")).toBe("Nidoran F");
  });
});

// ---------------------------------------------------------------------------
// GBC: the real Route30 sources (gbcEncounterSources(openGbcProject(PerfPlus),
// "Route30"), measured 2026-09-30), pasted verbatim -- this test must not read
// the corpus.
// ---------------------------------------------------------------------------

const ROUTE30: GbcEncounterSource[] = [
  { method: "grass", time: "morn", encounterRate: 9.765625, chances: [{ species: "CATERPIE", percent: 45, minLevel: 3, maxLevel: 8 }, { species: "LEDYBA", percent: 25, minLevel: 3, maxLevel: 7 }, { species: "PIDGEY", percent: 10, minLevel: 4, maxLevel: 8 }, { species: "WEEDLE", percent: 10, minLevel: 3, maxLevel: 7 }, { species: "HOPPIP", percent: 10, minLevel: 4, maxLevel: 8 }] },
  { method: "grass", time: "day", encounterRate: 9.765625, chances: [{ species: "CATERPIE", percent: 45, minLevel: 3, maxLevel: 8 }, { species: "PIDGEY", percent: 35, minLevel: 3, maxLevel: 8 }, { species: "WEEDLE", percent: 10, minLevel: 3, maxLevel: 7 }, { species: "HOPPIP", percent: 10, minLevel: 4, maxLevel: 8 }] },
  { method: "grass", time: "nite", encounterRate: 9.765625, chances: [{ species: "HOOTHOOT", percent: 45, minLevel: 3, maxLevel: 8 }, { species: "SPINARAK", percent: 25, minLevel: 3, maxLevel: 7 }, { species: "POLIWAG", percent: 20, minLevel: 4, maxLevel: 8 }, { species: "ZUBAT", percent: 10, minLevel: 3, maxLevel: 7 }] },
  { method: "water", encounterRate: 1.953125, chances: [{ species: "POLIWAG", percent: 75, minLevel: 15, maxLevel: 24 }, { species: "POLIWHIRL", percent: 25, minLevel: 20, maxLevel: 24 }] },
  { method: "fish", rod: "old", biteChance: 50, chances: [{ species: "MAGIKARP", percent: 85.15625, minLevel: 10, maxLevel: 10 }, { species: "POLIWAG", percent: 14.84375, minLevel: 10, maxLevel: 10 }] },
  { method: "fish", rod: "good", time: "day", biteChance: 50, chances: [{ species: "POLIWAG", percent: 64.84375, minLevel: 20, maxLevel: 20 }, { species: "MAGIKARP", percent: 35.15625, minLevel: 20, maxLevel: 20 }] },
  { method: "fish", rod: "good", time: "nite", biteChance: 50, chances: [{ species: "POLIWAG", percent: 64.84375, minLevel: 20, maxLevel: 20 }, { species: "MAGIKARP", percent: 35.15625, minLevel: 20, maxLevel: 20 }] },
  { method: "fish", rod: "super", time: "day", biteChance: 50, chances: [{ species: "POLIWAG", percent: 79.6875, minLevel: 40, maxLevel: 40 }, { species: "MAGIKARP", percent: 20.3125, minLevel: 40, maxLevel: 40 }] },
  { method: "fish", rod: "super", time: "nite", biteChance: 50, chances: [{ species: "POLIWAG", percent: 79.6875, minLevel: 40, maxLevel: 40 }, { species: "MAGIKARP", percent: 20.3125, minLevel: 40, maxLevel: 40 }] },
  { method: "headbutt", list: "common", chances: [{ species: "HOOTHOOT", percent: 50, minLevel: 10, maxLevel: 10 }, { species: "EXEGGCUTE", percent: 20, minLevel: 10, maxLevel: 10 }, { species: "SPINARAK", percent: 15, minLevel: 10, maxLevel: 10 }, { species: "LEDYBA", percent: 15, minLevel: 10, maxLevel: 10 }] },
  { method: "headbutt", list: "rare", chances: [{ species: "HOOTHOOT", percent: 50, minLevel: 10, maxLevel: 10 }, { species: "PINECO", percent: 30, minLevel: 10, maxLevel: 10 }, { species: "EXEGGCUTE", percent: 20, minLevel: 10, maxLevel: 10 }] },
];

const ALL: Array<"morn" | "day" | "nite"> = ["morn", "day", "nite"];
const iconOf = (s: string) => `/api/species/${s}/icon.png`;
const gbc = (species: string, displayName: string, availableAt: SpeciesSummary["availableAt"], rows: SpeciesRow[]): SpeciesSummary =>
  ({ species, displayName, iconUrl: iconOf(species), rows, availableAt });
const GRASS_RATE = 9.765625;
const grass = (time: "morn" | "day" | "nite", percent: number, minLevel: number, maxLevel: number): SpeciesRow =>
  ({ method: "grass", label: `Grass · ${time}`, percent, minLevel, maxLevel, time, rate: GRASS_RATE, levelBuff: true });
const ht = (list: "common" | "rare", percent: number): SpeciesRow =>
  ({ method: "headbutt", label: `Headbutt · ${list}`, percent, minLevel: 10, maxLevel: 10, list });
const fish = (rod: "old" | "good" | "super", time: "day" | "nite" | undefined, percent: number, level: number): SpeciesRow => ({
  method: "fish",
  label: `Fish · ${{ old: "Old", good: "Good", super: "Super" }[rod]} Rod${time ? ` · ${time}` : ""}`,
  percent, minLevel: level, maxLevel: level, rod, ...(time ? { time } : {}), rate: 50,
});
const surf = (percent: number, minLevel: number, maxLevel: number): SpeciesRow =>
  ({ method: "water", label: "Surf", percent, minLevel, maxLevel, rate: 1.953125, levelBuff: true });

describe("summariseGbc: Route30 (real data)", () => {
  const out = summariseGbc(ROUTE30);

  it("orders species by first method, then that method's top percent, then first appearance", () => {
    expect(out.map((s) => s.species)).toEqual([
      "CATERPIE", "HOOTHOOT", "PIDGEY", "LEDYBA", "SPINARAK", "POLIWAG", "WEEDLE", "HOPPIP", "ZUBAT",
      "POLIWHIRL", "MAGIKARP", "PINECO", "EXEGGCUTE",
    ]);
  });

  it("POLIWAG: 7 rows in method order, buff on grass/water only, exact labels and rates", () => {
    expect(out.find((s) => s.species === "POLIWAG")!.rows).toStrictEqual([
      { method: "grass", label: "Grass · nite", percent: 20, minLevel: 4, maxLevel: 8, time: "nite", rate: 9.765625, levelBuff: true },
      { method: "water", label: "Surf", percent: 75, minLevel: 15, maxLevel: 24, rate: 1.953125, levelBuff: true },
      { method: "fish", label: "Fish · Old Rod", percent: 14.84375, minLevel: 10, maxLevel: 10, rod: "old", rate: 50 },
      { method: "fish", label: "Fish · Good Rod · day", percent: 64.84375, minLevel: 20, maxLevel: 20, time: "day", rod: "good", rate: 50 },
      { method: "fish", label: "Fish · Good Rod · nite", percent: 64.84375, minLevel: 20, maxLevel: 20, time: "nite", rod: "good", rate: 50 },
      { method: "fish", label: "Fish · Super Rod · day", percent: 79.6875, minLevel: 40, maxLevel: 40, time: "day", rod: "super", rate: 50 },
      { method: "fish", label: "Fish · Super Rod · nite", percent: 79.6875, minLevel: 40, maxLevel: 40, time: "nite", rod: "super", rate: 50 },
    ]);
  });

  it("the full summary, every species/row/iconUrl/displayName/availableAt", () => {
    expect(out).toStrictEqual([
      gbc("CATERPIE", "Caterpie", ["morn", "day"], [grass("morn", 45, 3, 8), grass("day", 45, 3, 8)]),
      gbc("HOOTHOOT", "Hoothoot", ALL, [grass("nite", 45, 3, 8), ht("common", 50), ht("rare", 50)]),
      gbc("PIDGEY", "Pidgey", ["morn", "day"], [grass("morn", 10, 4, 8), grass("day", 35, 3, 8)]),
      gbc("LEDYBA", "Ledyba", ALL, [grass("morn", 25, 3, 7), ht("common", 15)]),
      gbc("SPINARAK", "Spinarak", ALL, [grass("nite", 25, 3, 7), ht("common", 15)]),
      gbc("POLIWAG", "Poliwag", ALL, [
        grass("nite", 20, 4, 8), surf(75, 15, 24),
        fish("old", undefined, 14.84375, 10), fish("good", "day", 64.84375, 20), fish("good", "nite", 64.84375, 20),
        fish("super", "day", 79.6875, 40), fish("super", "nite", 79.6875, 40),
      ]),
      gbc("WEEDLE", "Weedle", ["morn", "day"], [grass("morn", 10, 3, 7), grass("day", 10, 3, 7)]),
      gbc("HOPPIP", "Hoppip", ["morn", "day"], [grass("morn", 10, 4, 8), grass("day", 10, 4, 8)]),
      gbc("ZUBAT", "Zubat", ["nite"], [grass("nite", 10, 3, 7)]),
      gbc("POLIWHIRL", "Poliwhirl", ALL, [surf(25, 20, 24)]),
      gbc("MAGIKARP", "Magikarp", ALL, [
        fish("old", undefined, 85.15625, 10), fish("good", "day", 35.15625, 20), fish("good", "nite", 35.15625, 20),
        fish("super", "day", 20.3125, 40), fish("super", "nite", 20.3125, 40),
      ]),
      gbc("PINECO", "Pineco", ALL, [ht("rare", 30)]),
      gbc("EXEGGCUTE", "Exeggcute", ALL, [ht("common", 20), ht("rare", 20)]),
    ]);
  });
});

describe("summariseGbc: edge cases", () => {
  const chance = (species: string, percent: number) => ({ species, percent, minLevel: 2, maxLevel: 4 });

  it("a species with only a morn grass row is available at morn only", () => {
    const [s] = summariseGbc([{ method: "grass", time: "morn", encounterRate: 10, chances: [chance("AAA", 100)] }]);
    expect(s!.availableAt).toEqual(["morn"]);
  });

  it("a fish row tagged day counts at morn too (matchesTime, not time equality)", () => {
    const [s] = summariseGbc([{ method: "fish", rod: "good", time: "day", biteChance: 50, chances: [chance("AAA", 100)] }]);
    expect(s!.availableAt).toEqual(["morn", "day"]);
  });

  it("a swarm row keeps its conditional tag and label, and counts toward availableAt", () => {
    const [s] = summariseGbc([{ method: "grass", time: "nite", conditional: "swarm", encounterRate: 10, chances: [chance("AAA", 100)] }]);
    expect(s!.rows).toStrictEqual([{ method: "grass", label: "Grass · nite · swarm", percent: 100, minLevel: 2, maxLevel: 4, time: "nite", conditional: "swarm", rate: 10, levelBuff: true }]);
    expect(s!.availableAt).toEqual(["nite"]);
  });

  it("equal top percent in the same first method keeps input order (not alphabetical)", () => {
    const out = summariseGbc([{ method: "grass", time: "day", encounterRate: 10, chances: [chance("ZZZ", 30), chance("AAA", 30), chance("MMM", 40)] }]);
    expect(out.map((s) => s.species)).toEqual(["MMM", "ZZZ", "AAA"]);
  });

  it("the tie-break percent is the first method's, not the highest across all methods", () => {
    // X: grass 10 / fish 90; Y: grass 20. By first-method percent Y leads; by all-methods max X would.
    const out = summariseGbc([
      { method: "grass", time: "day", encounterRate: 10, chances: [chance("X", 10), chance("Y", 20)] },
      { method: "fish", rod: "old", biteChance: 50, chances: [chance("X", 90)] },
    ]);
    expect(out.map((s) => s.species)).toEqual(["Y", "X"]);
  });

  it("a species ranks by its FIRST method: a fish-only species follows every grass species", () => {
    const out = summariseGbc([
      { method: "fish", rod: "old", biteChance: 50, chances: [chance("F", 100)] },
      { method: "grass", time: "day", encounterRate: 10, chances: [chance("G", 1)] },
    ]);
    expect(out.map((s) => s.species)).toEqual(["G", "F"]);
  });

  it("rows within a species come out in method order even when the input lists fish before grass", () => {
    const [s] = summariseGbc([
      { method: "fish", rod: "old", biteChance: 50, chances: [chance("AAA", 100)] },
      { method: "grass", time: "day", encounterRate: 10, chances: [chance("AAA", 50)] },
    ]);
    expect(s!.rows.map((r) => r.method)).toEqual(["grass", "fish"]);
  });

  it("an empty source list summarises to nothing", () => {
    expect(summariseGbc([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GBA (hand-written wire rows)
// ---------------------------------------------------------------------------

describe("summariseGba", () => {
  // The wire chance also carries the slot indices (irrelevant here).
  const c = (species: string, percent: number, minLevel: number, maxLevel: number) => ({ species, percent, minLevel, maxLevel, slots: [0] });
  const rows: GbaEncounterRow[] = [
    { method: "land_mons", chances: [c("SPECIES_ODDISH", 45, 5, 6), c("SPECIES_NIDORAN_F", 45, 5, 6), c("SPECIES_ZIGZAGOON", 10, 3, 4)] },
    { method: "water_mons", chances: [c("SPECIES_TENTACOOL", 60, 5, 35), c("SPECIES_WINGULL", 40, 5, 35)] },
    { method: "fishing_mons", rod: "old", chances: [c("SPECIES_MAGIKARP", 100, 5, 10)] },
    { method: "fishing_mons", rod: "good", chances: [c("SPECIES_MAGIKARP", 60, 10, 20), c("SPECIES_TENTACOOL", 40, 10, 20)] },
    { method: "fishing_mons", rod: "super", chances: [c("SPECIES_TENTACOOL", 50, 30, 40), c("SPECIES_MAGIKARP", 50, 30, 40)] },
    { method: "rock_smash_mons", chances: [c("SPECIES_GEODUDE", 80, 5, 10), c("SPECIES_KRABBY", 20, 5, 10)] },
  ];
  const row = (method: SpeciesRow["method"], label: string, percent: number, minLevel: number, maxLevel: number, rod?: string): SpeciesRow =>
    ({ method, label, percent, minLevel, maxLevel, ...(rod ? { rod } : {}) });
  const sp = (species: string, displayName: string, r: SpeciesRow[]): SpeciesSummary =>
    ({ species, displayName, iconUrl: iconOf(species), rows: r });

  it("maps wire methods to species rows: labels, rods, order, no levelBuff/rate/availableAt", () => {
    expect(summariseGba(rows)).toStrictEqual([
      sp("SPECIES_ODDISH", "Oddish", [row("grass", "Land", 45, 5, 6)]),
      sp("SPECIES_NIDORAN_F", "Nidoran F", [row("grass", "Land", 45, 5, 6)]),
      sp("SPECIES_ZIGZAGOON", "Zigzagoon", [row("grass", "Land", 10, 3, 4)]),
      sp("SPECIES_TENTACOOL", "Tentacool", [
        row("water", "Water", 60, 5, 35),
        row("fish", "Fishing · Good Rod", 40, 10, 20, "good"),
        row("fish", "Fishing · Super Rod", 50, 30, 40, "super"),
      ]),
      sp("SPECIES_WINGULL", "Wingull", [row("water", "Water", 40, 5, 35)]),
      sp("SPECIES_MAGIKARP", "Magikarp", [
        row("fish", "Fishing · Old Rod", 100, 5, 10, "old"),
        row("fish", "Fishing · Good Rod", 60, 10, 20, "good"),
        row("fish", "Fishing · Super Rod", 50, 30, 40, "super"),
      ]),
      sp("SPECIES_GEODUDE", "Geodude", [row("rock", "Rock Smash", 80, 5, 10)]),
      sp("SPECIES_KRABBY", "Krabby", [row("rock", "Rock Smash", 20, 5, 10)]),
    ]);
  });

  it("an empty method list summarises to nothing", () => {
    expect(summariseGba([])).toEqual([]);
  });
});
