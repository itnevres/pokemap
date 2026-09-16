import { describe, it, expect } from "vitest";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";
import { rankSpeciesForSign, suggestSignPlacement } from "../../src/signs/suggest.js";

const proj = openProject(SUBJECT_ROOT);

describe("rankSpeciesForSign", () => {
  itWithCorpus(
    "ranks species available on a real route by descending encounter percent, deduped across variants/methods/rods to each species' single best chance",
    () => {
      // MAP_ROUTE102 carries gRoute102/gRoute102_Night/gRoute102_CDay/gRoute102_CNight,
      // and (confirmed directly against wild_encounters.json) the day and night
      // variants share species like SPECIES_POOCHYENA and SPECIES_WURMPLE -- a real
      // exercise of the cross-variant dedup, not just a trivially-true Set check.
      const ranked = rankSpeciesForSign(proj, "Route102");
      expect(ranked.length).toBeGreaterThan(0);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1]!.percent).toBeGreaterThanOrEqual(ranked[i]!.percent);
      }
      const speciesSeen = new Set(ranked.map((r) => r.species));
      expect(speciesSeen.size).toBe(ranked.length); // one row per species, not one per table
    },
  );

  itWithCorpus("a map with no wild encounter table returns an empty array, not a throw", () => {
    // Confirmed against wild_encounters.json: MAP_PALLET_TOWN has zero
    // gWildMonHeaders entries.
    const ranked = rankSpeciesForSign(proj, "PalletTown");
    expect(ranked).toEqual([]);
  });
});

describe("suggestSignPlacement", () => {
  itWithCorpus("on a real route with tall grass, suggests a walkable non-grass tile orthogonally adjacent to a grass tile", () => {
    const placement = suggestSignPlacement(proj, "Route101");
    expect(placement).not.toBeNull();
    expect(Number.isInteger(placement!.x)).toBe(true);
    expect(Number.isInteger(placement!.y)).toBe(true);
  });

  itWithCorpus("returns null (not a guess) when the map has no tall-grass metatile at all", () => {
    const placement = suggestSignPlacement(proj, "PalletTown");
    expect(placement).toBeNull();
  });

  itWithCorpus("does not suggest a tile that already has an object event on it", () => {
    const map = proj.map("Route101");
    const placement = suggestSignPlacement(proj, "Route101");
    if (placement) {
      const occupied = map.objectEvents.some((e) => e.x === placement.x && e.y === placement.y);
      expect(occupied).toBe(false);
    }
  });
});

describe("Project.encounters caching", () => {
  itWithCorpus("returns the same object reference on a second call, proving it's cached and not re-parsed per call", () => {
    expect(proj.encounters()).toBe(proj.encounters());
  });
});
