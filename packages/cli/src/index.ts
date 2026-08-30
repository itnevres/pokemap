#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync, readFileSync } from "node:fs";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { encodePng } from "./png.js";

export function resolveProject(explicit?: string): Project {
  if (explicit) return openProject(explicit);
  const cfg = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as { projectPath: string };
  return openProject(cfg.projectPath);
}

/** Accept either a layout name or a map name. */
export function layoutNameFor(proj: Project, target: string): string {
  if (proj.layoutByName(target)) return target;
  const name = proj.layoutById(proj.map(target).layout)?.name;
  if (!name) throw new Error(`no layout or map named ${target}`);
  return name;
}

const program = new Command();
program.name("pokemap").option("-p, --project <path>", "decomp root");

program
  .command("render <target>")
  .description("render a map or layout to a PNG")
  .option("-o, --out <file>", "output path", "out.png")
  .option("--border <rings>", "rings of border to draw", "0")
  .action((target: string, opts: { out: string; border: string }) => {
    const proj = resolveProject(program.opts().project);
    const r = renderLayout(proj, layoutNameFor(proj, target), { border: Number(opts.border) });
    writeFileSync(opts.out, encodePng(r));
    process.stdout.write(`${opts.out} ${r.width}x${r.height} outOfRange=${r.outOfRangeCount}\n`);
  });

program
  .command("query <map>")
  .description("print a map's header, connections, events and resolved split")
  .option("--header", "header fields only")
  .option("--connections", "connections only")
  .option("--events", "events only")
  .option("--json", "machine-readable output", true)
  .action((map: string, opts: { header?: boolean; connections?: boolean; events?: boolean; json?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const m = proj.map(map);
    const layout = proj.layoutById(m.layout);
    if (!layout) throw new Error(`map ${map} references unknown layout ${m.layout}`);

    const all = !opts.header && !opts.connections && !opts.events;
    const out: Record<string, unknown> = {};
    if (all || opts.header) {
      const { connections, objectEvents, warpEvents, coordEvents, bgEvents, ...header } = m;
      out.header = header;
      // The split is the thing this tool exists to get right; always report it.
      out.layout = { name: layout.name, width: layout.width, height: layout.height,
                     borderWidth: layout.borderWidth, borderHeight: layout.borderHeight,
                     layoutVersion: layout.layoutVersion ?? null,
                     primaryTileset: layout.primaryTileset, secondaryTileset: layout.secondaryTileset };
      out.split = proj.splitFor(layout);
    }
    if (all || opts.connections) out.connections = m.connections;
    if (all || opts.events) {
      out.events = { object: m.objectEvents, warp: m.warpEvents, coord: m.coordEvents, bg: m.bgEvents };
    }
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  });

// Importing this module (e.g. from query.test.ts, to reach layoutNameFor)
// must not trigger commander's argv parsing against the test runner's own
// argv. Only parse when this file is the actual entry point.
if (process.argv[1]?.endsWith("index.ts")) program.parse();
