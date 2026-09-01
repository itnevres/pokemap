#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { validateMetatileRange, validatePaletteRange } from "@pokemap/core/src/validate/metatileRange.js";
import { buildWorld, resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";
import { createRaster, blitScaled } from "@pokemap/core/src/render/raster.js";
import { encodePng } from "./png.js";
import { resolveProject, layoutNameFor } from "./context.js";
import { parseBorder, parseBbox } from "./args.js";

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
  .command("render-world")
  .description("render a region of the stitched world to a PNG")
  .requiredOption("--bbox <x,y,w,h>", "region in tiles", parseBbox)
  .option("-o, --out <file>", "output path", "world.png")
  .option("--scale <n>", "pixels per tile (16 = full size, 4 = overview)", "4")
  .option("--no-dungeons", "exclude auto-placed dungeon maps")
  .action((opts: { bbox: ReturnType<typeof parseBbox>; out: string; scale: string; dungeons: boolean }) => {
    const proj = resolveProject(program.opts().project);
    const { x: bx, y: by, w: bw, h: bh } = opts.bbox;
    const scale = Number(opts.scale);

    const world = buildWorld(proj);
    const sidecar = readSidecar(proj.paths.root);
    // Same shared helper the server's /api/world route uses
    // (packages/core/src/world/resolve.ts) -- see its own doc comment for
    // why the dungeons-off case has to positively delete unplaced maps
    // from the base set, not just skip repositioning them.
    const placements = resolveWorldPlacements(proj, world, sidecar, { dungeons: opts.dungeons });

    const dst = createRaster(bw * scale, bh * scale);
    let drawn = 0;
    for (const p of placements.values()) {
      // A placement from applySidecar's fallback branch (component: -1, a
      // stale or not-yet-placed manual entry -- see
      // packages/core/test/world/sidecar.test.ts) carries width:0,
      // height:0. sizeOfPlacement in WorldCanvas.tsx recovers this client-
      // side from the map's own singleton component; this batch tool has
      // no equivalent per-request cheap lookup, so it skips it instead --
      // an honest "not rendered" rather than a NaN destination offset that
      // silently paints nothing while still counting toward `drawn`.
      if (p.width <= 0 || p.height <= 0) continue;
      if (p.x + p.width <= bx || p.x >= bx + bw || p.y + p.height <= by || p.y >= by + bh) continue;
      const layoutName = proj.layoutForMap(p.map).name;
      blitScaled(dst, renderLayout(proj, layoutName), (p.x - bx) * scale, (p.y - by) * scale, scale / 16);
      drawn++;
    }

    writeFileSync(opts.out, encodePng(dst));
    process.stdout.write(`${opts.out} ${dst.width}x${dst.height} maps=${drawn}\n`);
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
