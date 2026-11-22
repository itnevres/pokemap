// Cold open: open the project and stitch the world in a fresh process. Target: total_ms under 3000 ms. open_ms is the interactive map-list time.
import { performance } from "node:perf_hooks";
import { parseArgs, rootOf, printResult, machineLine } from "./lib.mjs";
import { openProject } from "../src/project.ts";
import { buildWorld } from "../src/world/connections.ts";
import { openGbcProject } from "../src/gbc/project.ts";
import { buildGbcWorld } from "../src/gbc/world/connections.ts";

const { families, root } = parseArgs(process.argv.slice(2));
console.log(machineLine());

for (const family of families) {
  const dir = rootOf(family, root);
  const t0 = performance.now();
  if (family === "gba") {
    const proj = openProject(dir);
    const t1 = performance.now();
    buildWorld(proj);
    const t2 = performance.now();
    printResult("cold-open", family, {
      open_ms: t1 - t0,
      world_ms: t2 - t1,
      total_ms: t2 - t0,
      maps: proj.mapNames().length,
      layouts: proj.layouts.length,
    });
  } else {
    const proj = openGbcProject(dir);
    const t1 = performance.now();
    buildGbcWorld(proj);
    const t2 = performance.now();
    printResult("cold-open", family, {
      open_ms: t1 - t0,
      world_ms: t2 - t1,
      total_ms: t2 - t0,
      maps: proj.maps.length,
    });
  }
}
