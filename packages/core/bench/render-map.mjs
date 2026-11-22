// Per-tile render cost (pan proxy): ~40 maps spread across the project, rendered cold then warm. Budget: warm p95 under 16.7 ms (60 fps pan).
import { performance } from "node:perf_hooks";
import { parseArgs, rootOf, stats, printResult, machineLine } from "./lib.mjs";
import { openProject } from "../src/project.ts";
import { renderLayout } from "../src/render/layout.ts";
import { openGbcProject } from "../src/gbc/project.ts";
import { buildGbcWorld } from "../src/gbc/world/connections.ts";
import { renderGbcMap } from "../src/gbc/render/map.ts";

const FRAME_BUDGET_MS = 16.7;
const TARGET_SAMPLES = 40;

function sample(list) {
  const step = Math.max(1, Math.floor(list.length / TARGET_SAMPLES));
  return list.filter((_, i) => i % step === 0);
}

function timeEach(names, run) {
  const ms = [];
  let errors = 0;
  for (const name of names) {
    try {
      const t = performance.now();
      run(name);
      ms.push(performance.now() - t);
    } catch (e) {
      errors++;
      console.error(`bench: ${name}: ${e.message}`);
    }
  }
  return { ms, errors };
}

function bench(family, dir) {
  let names;
  let run;
  if (family === "gba") {
    const proj = openProject(dir);
    names = proj.mapNames();
    run = (name) => renderLayout(proj, proj.layoutForMap(name).name);
  } else {
    const proj = openGbcProject(dir);
    names = [...buildGbcWorld(proj).placements.keys()];
    run = (name) => renderGbcMap(proj, name, { time: "day" });
  }
  const chosen = sample(names);
  const cold = timeEach(chosen, run);
  const warm = timeEach(chosen, run);
  const c = stats(cold.ms);
  const w = stats(warm.ms);
  return {
    maps_sampled: chosen.length,
    errors: cold.errors + warm.errors,
    cold_p50_ms: c.p50,
    cold_p95_ms: c.p95,
    cold_max_ms: c.max,
    warm_p50_ms: w.p50,
    warm_p95_ms: w.p95,
    warm_max_ms: w.max,
    frame_budget_ms: FRAME_BUDGET_MS,
    warm_p95_within_budget: w.p95 < FRAME_BUDGET_MS,
  };
}

const { families, root } = parseArgs(process.argv.slice(2));
console.log(machineLine());
for (const family of families) {
  printResult("render-map", family, bench(family, rootOf(family, root)));
}
