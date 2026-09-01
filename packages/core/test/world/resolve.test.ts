import { describe, expect } from "vitest";
import { resolveWorldPlacements } from "../../src/world/resolve.js";
import { buildWorld } from "../../src/world/connections.js";
import { openProject } from "../../src/project.js";
import type { Sidecar } from "../../src/world/sidecar.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const proj = openProject(SUBJECT_ROOT);

const sidecar = (dungeonAutoLayout: boolean, manualPlacements: Sidecar["manualPlacements"] = {}): Sidecar => ({
  version: 1,
  dungeonAutoLayout,
  manualPlacements,
  view: { x: 0, y: 0, zoom: 1 },
});

describe("resolveWorldPlacements", () => {
  // The one regression this function exists to prevent, at the shared
  // source rather than only at its two call sites (packages/server's
  // /api/world route and the CLI's render-world command). buildWorld
  // places every one of the 1,209 maps unconditionally -- even an
  // isolated map becomes its own 1-map component -- so a naive
  // `new Map([...world.placements, ...auto])` merge has identical key
  // counts whether `auto` was computed with dungeons on or off, and this
  // could not have told the two apart. "Off" has to remove the ~1,028
  // unplaced names from the base set, not just skip repositioning them.
  itWithCorpus("respects the dungeons option: off actually removes unplaced maps, not just repositions them", () => {
    const world = buildWorld(proj);
    const on = resolveWorldPlacements(proj, world, sidecar(true), { dungeons: true });
    const off = resolveWorldPlacements(proj, world, sidecar(true), { dungeons: false });
    expect(on.size).toBe(1209);
    expect(off.size).toBeGreaterThan(0);
    expect(off.size).toBeLessThan(on.size);
    // Pinned exactly, not just "fewer" -- 1,209 minus the 1,028 singleton
    // maps connections.test.ts and warpGraph.test.ts both independently
    // measure against the same live corpus.
    expect(off.size).toBe(181);
  });

  // The `dungeons` option can only turn auto-layout OFF for one call, never
  // force it ON over a sidecar that has it stored off -- mirrors the
  // server's own `?dungeons=` query semantics (`dungeons && sidecar.
  // dungeonAutoLayout`, an AND, not an override).
  itWithCorpus("dungeons: true cannot override a sidecar that has dungeonAutoLayout stored false", () => {
    const world = buildWorld(proj);
    const result = resolveWorldPlacements(proj, world, sidecar(false), { dungeons: true });
    expect(result.size).toBe(181);
  });

  // A manual placement always wins, regardless of the toggle -- this is
  // the mechanism the "drag an unplaced map onto the canvas while dungeons
  // is off" flow (WorldCanvas's side rail) depends on.
  itWithCorpus("a manual placement for an otherwise-unplaced map survives dungeons being off", () => {
    const world = buildWorld(proj);
    const result = resolveWorldPlacements(proj, world, sidecar(true, { NewBarkTown_Lab: { x: 42, y: 7 } }), { dungeons: false });
    expect(result.get("NewBarkTown_Lab")).toMatchObject({ x: 42, y: 7 });
  });
});
