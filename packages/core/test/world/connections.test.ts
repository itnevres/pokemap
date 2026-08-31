import { describe, it, expect } from "vitest";
import { buildWorld } from "../../src/world/connections.js";
import { openProject } from "../../src/project.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

/**
 * Measured, not guessed: **19**. A change here means a connection in the decomp
 * started disagreeing with itself -- a real finding to investigate, not a
 * number to bump.
 *
 * These are genuine inconsistencies in the subject tree's connection data, not
 * artefacts of this algorithm. Worked one through by hand to be sure:
 * `SafariZone_Top_Right` says `down offset 0 -> Low_Right`, and `Low_Right`
 * says `up offset 0 -> Top_Right`. That reciprocal pair is self-consistent --
 * substitute one into the other and you get back where you started. The
 * disagreement comes from the *third* path, round through `Low_Mid`, which
 * places `Low_Right` 8 tiles off from where `Top_Right` puts it. The Safari
 * Zone quadrants do not tile as a clean rectangle.
 *
 * Two more of the same shape: `RuinsOfAlph_Outside` vs `Route36` (20 x, 3 y
 * apart) and `EcruteakCity` vs `Route42` (27 x, 4 y apart).
 *
 * Reporting these is a feature. It is a class of defect Porymap does not
 * surface at all, because Porymap never builds a global coordinate space.
 */
const CONFLICT_BASELINE = 19;

describe("buildWorld", () => {
  itWithCorpus("places NewBarkTown's left neighbour to its left, at the stated offset", () => {
    const w = buildWorld(proj);
    const town = w.placements.get("NewBarkTown")!;
    const route = w.placements.get("Route29")!;
    expect(route.x).toBe(town.x - proj.layoutForMap("Route29").width);
    expect(route.y).toBe(town.y + -5);
    // NewBarkTown's layout is NewBarkTown_Layout; layoutByName("NewBarkTown")
    // returns undefined, which is why placements are keyed by MAP name.
    expect(proj.layoutForMap("NewBarkTown").name).toBe("NewBarkTown_Layout");
  });

  itWithCorpus("excludes dive and emerge from planar placement but records them as links", () => {
    const w = buildWorld(proj);
    expect(w.verticalLinks.length).toBe(14); // 7 dive + 7 emerge
    for (const l of w.verticalLinks) expect(["dive", "emerge"]).toContain(l.direction);
  });

  itWithCorpus("groups maps into the three landmasses plus the loose rooms", () => {
    const w = buildWorld(proj);
    expect(w.placements.size).toBe(1209);
    expect(w.components.length).toBe(1045);

    const sizes = w.components.map((c) => c.maps.length).sort((a, b) => b - a);
    // Hoenn, Johto, Kanto. Only 182 maps have any planar connection; the rest
    // are interiors and dungeon floors reached solely by warps.
    expect(sizes.slice(0, 3)).toEqual([51, 40, 37]);
    expect(sizes.filter((n) => n === 1).length).toBe(1028);
    expect(sizes.filter((n) => n > 1).length).toBe(17);

    expect(w.components.reduce((n, c) => n + c.maps.length, 0)).toBe(w.placements.size);
  });

  itWithCorpus("puts the right maps in the right landmass", () => {
    const w = buildWorld(proj);
    const componentOf = (m: string) => w.components[w.placements.get(m)!.component]!;
    // Same region -> same component; different regions -> different ones.
    expect(componentOf("NewBarkTown")).toBe(componentOf("CherrygroveCity"));
    expect(componentOf("NewBarkTown")).not.toBe(componentOf("CeladonCity"));
    expect(componentOf("NewBarkTown")).not.toBe(componentOf("PetalburgCity"));
    expect(componentOf("PetalburgCity").maps.length).toBe(51);
  });

  itWithCorpus("reports contradictions instead of silently picking one", () => {
    const w = buildWorld(proj);
    for (const c of w.conflicts) {
      expect(c.map).toBeTypeOf("string");
      expect(c.viaA.from).toBeTypeOf("string");
      expect(c.viaB.from).toBeTypeOf("string");
      // A conflict means two paths disagree; identical coordinates are not one.
      expect([c.viaA.x, c.viaA.y]).not.toEqual([c.viaB.x, c.viaB.y]);
    }
    // Pin the count. `toBeLessThanOrEqual(placements.size)` was near-vacuous --
    // it holds for almost any implementation, including one reporting none.
    // Record whatever the first correct run produces and treat a change as a
    // finding about the decomp's connection data, not noise to re-baseline.
    expect(w.conflicts.length).toBe(CONFLICT_BASELINE);
  });

  itWithCorpus("packs components into rows rather than one endless strip", () => {
    const w = buildWorld(proj);
    const maxX = Math.max(...w.components.map((c) => c.bounds.x + c.bounds.width));
    const maxY = Math.max(...w.components.map((c) => c.bounds.y + c.bounds.height));

    // 1,045 components in a single row is tens of thousands of tiles wide and
    // one component tall, which is what an unwrapped cursor produces and what
    // Task 25 would then have to render. Assert the world has real extent in
    // both axes rather than merely that nothing overlaps.
    expect(maxY).toBeGreaterThan(0);
    expect(maxX / maxY).toBeLessThan(10);

    // The three landmasses are packed first, so the largest component starts
    // in the first row.
    const biggest = [...w.components].sort((a, b) => b.maps.length - a.maps.length)[0]!;
    expect(biggest.bounds.y).toBe(0);
  });

  itWithCorpus("gives every component a non-overlapping bounding box", () => {
    const w = buildWorld(proj);
    for (let i = 0; i < w.components.length; i++) {
      for (let j = i + 1; j < w.components.length; j++) {
        const a = w.components[i]!.bounds, b = w.components[j]!.bounds;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });
});
