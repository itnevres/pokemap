// World view at minimum zoom: build the world, render every placed map cold then warm. Target: under 2000 ms to first paint. A warm pass is the in-process analogue of "cached buffers".
import { performance } from "node:perf_hooks";
import { parseArgs, rootOf, stats, statFields, printResult, machineLine } from "./lib.mjs";
import { openProject } from "../src/project.ts";
import { buildWorld } from "../src/world/connections.ts";
import { resolveWorldPlacements } from "../src/world/resolve.ts";
import { readSidecar } from "../src/world/sidecar.ts";
import { renderLayout } from "../src/render/layout.ts";
import { openGbcProject } from "../src/gbc/project.ts";
import { buildGbcWorld } from "../src/gbc/world/connections.ts";
import { renderGbcMap } from "../src/gbc/render/map.ts";
import { renderGbcWorld } from "../src/gbc/render/world.ts";

const timed = (fn) => {
  const t = performance.now();
  const v = fn();
  return [performance.now() - t, v];
};

// Cold pass over every job (per-job timings), then a warm pass over the ones that succeeded.
function passes(jobs) {
  const cold = [];
  const ok = [];
  let errors = 0;
  for (const job of jobs) {
    try {
      cold.push(timed(job.run)[0]);
      ok.push(job);
    } catch (e) {
      errors++;
      console.error(`bench: ${job.key}: ${e.message}`);
    }
  }
  let warmTotal = 0;
  for (const job of ok) warmTotal += timed(job.run)[0];
  return { cold, warmTotal, errors, rendered: ok.length };
}

function gba(dir) {
  const proj = openProject(dir);
  const [buildMs, placements] = timed(() =>
    resolveWorldPlacements(proj, buildWorld(proj), readSidecar(proj.paths.root), { dungeons: true }),
  );
  const list = [...placements.values()];
  const jobs = list.map((p) => ({ key: p.map, run: () => renderLayout(proj, proj.layoutForMap(p.map).name) }));
  const r = passes(jobs);

  const uniq = new Set();
  for (const p of list) {
    try {
      uniq.add(proj.layoutForMap(p.map).name);
    } catch {
      // already counted as a render error in the cold pass
    }
  }
  let uniqueMs = 0;
  for (const ln of uniq) uniqueMs += timed(() => renderLayout(proj, ln))[0];

  return {
    world_build_ms: buildMs,
    render_cold_total_ms: r.cold.reduce((a, b) => a + b, 0),
    render_warm_total_ms: r.warmTotal,
    ...statFields("map_cold", stats(r.cold)),
    maps_rendered: r.rendered,
    errors: r.errors,
    unique_layouts: uniq.size,
    unique_layouts_warm_ms: uniqueMs,
  };
}

function gbc(dir) {
  const proj = openGbcProject(dir);
  const [buildMs, world] = timed(() => buildGbcWorld(proj));
  const jobs = [...world.placements.keys()].map((name) => ({
    key: name,
    run: () => renderGbcMap(proj, name, { time: "day" }),
  }));
  const r = passes(jobs);

  const pts = [...world.placements.values()];
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const bbox = {
    x: minX,
    y: minY,
    w: Math.max(...pts.map((p) => p.x + p.width)) - minX,
    h: Math.max(...pts.map((p) => p.y + p.height)) - minY,
  };
  const [worldMs] = timed(() => renderGbcWorld(proj, world, { bbox, scale: 8, time: "day" }));

  return {
    world_build_ms: buildMs,
    render_cold_total_ms: r.cold.reduce((a, b) => a + b, 0),
    render_warm_total_ms: r.warmTotal,
    ...statFields("map_cold", stats(r.cold)),
    maps_rendered: r.rendered,
    errors: r.errors,
    world_render_ms: worldMs,
  };
}

const { families, root } = parseArgs(process.argv.slice(2));
console.log(machineLine());
console.log("NOTE warm pass = in-process analogue of cached buffers");
for (const family of families) {
  const dir = rootOf(family, root);
  printResult("world", family, family === "gba" ? gba(dir) : gbc(dir));
}
