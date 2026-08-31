#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { validateMetatileRange, validatePaletteRange } from "@pokemap/core/src/validate/metatileRange.js";
import { encodePng } from "./png.js";
import { resolveProject, layoutNameFor } from "./context.js";
import { parseBorder } from "./args.js";

const program = new Command();
program.name("pokemap").option("-p, --project <path>", "decomp root");

program
  .command("render <target>")
  .description("render a map or layout to a PNG")
  .option("-o, --out <file>", "output path", "out.png")
  .option("--border <rings>", "rings of border to draw", parseBorder, 0)
  .action((target: string, opts: { out: string; border: number }) => {
    const proj = resolveProject(program.opts().project);
    const r = renderLayout(proj, layoutNameFor(proj, target), { border: opts.border });
    writeFileSync(opts.out, encodePng(r));
    process.stdout.write(`${opts.out} ${r.width}x${r.height} outOfRange=${r.outOfRangeCount}\n`);
  });

program
  .command("query <map>")
  .description("print a map's header, connections, events and resolved split, as JSON")
  .option("--header", "header fields only")
  .option("--connections", "connections only")
  .option("--events", "events only")
  .action((map: string, opts: { header?: boolean; connections?: boolean; events?: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const m = proj.map(map);
    // layoutForMap, not layoutById(m.layout): it throws naming both map.json
    // and layouts.json when the layout id is dangling, instead of a
    // hand-rolled message naming neither.
    const layout = proj.layoutForMap(map);

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

program
  .command("validate")
  .description("run static checks over the project")
  .option("--metatile-range", "check every metatile id against its layout's split")
  .option("--palette-range", "check every tile entry's palette index resolves")
  .option("--json", "machine-readable output")
  .action((opts: { metatileRange?: boolean; paletteRange?: boolean; json?: boolean }) => {
    const proj = resolveProject(program.opts().project);

    // Selecting no check runs every check. `opts.metatileRange === false` is
    // never true -- commander sets a bare flag to `true` or leaves it
    // `undefined`, so that comparison made the flag decorative and ran the
    // check unconditionally. This is the same inert-flag defect as Task 15's
    // `--json`, and `query` already uses the pattern below.
    const all = !opts.metatileRange && !opts.paletteRange;
    const findings = [
      ...(all || opts.metatileRange ? validateMetatileRange(proj) : []),
      ...(all || opts.paletteRange ? validatePaletteRange(proj) : []),
    ];
    if (opts.json) { process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`); }
    else {
      for (const f of findings) {
        process.stdout.write(f.kind === "metatile-range"
          ? `${f.layout} (${f.split.version}, ${f.source}): ${f.ids.length} bad id(s), worst 0x${f.ids[0]!.id.toString(16)} x${f.ids[0]!.count}\n`
          : `${f.tileset}: ${f.entries} tile entr(ies) name palette ${f.indices.join(", ")}, which it has no .pal for\n`);
      }
      process.stdout.write(`${findings.length} finding(s)\n`);
    }
    process.exitCode = findings.length ? 1 : 0;
  });

// parseAsync, not a sync parse()+try/catch: every action handler today is
// synchronous so a sync catch would work today, but Plan 2's write commands
// will be async, and a sync try/catch silently does not observe a rejected
// promise thrown from inside an async action. Set the shape once. This also
// matches what Node already does on an uncaught throw (exit 1) and what
// commander does for its own errors (e.g. an unknown option), so the only
// change in behaviour is that our own thrown Errors get a one-line message
// instead of a raw stack dump.
//
// exitOverride() was considered and is the wrong tool here: it intercepts
// commander's own process.exit calls (--help, an unknown option), not
// exceptions thrown from inside an action handler -- those propagate as a
// normal rejected promise from parseAsync regardless.
async function main(): Promise<void> {
  await program.parseAsync();
}

main().catch((e: unknown) => {
  process.stderr.write(`pokemap: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
