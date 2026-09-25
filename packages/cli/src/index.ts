#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { renderLayout } from "@pokemap/core/src/render/layout.js";
import { validateMetatileRange, validatePaletteRange } from "@pokemap/core/src/validate/metatileRange.js";
import { buildWorld, resolveWorldPlacements } from "@pokemap/core/src/world/resolve.js";
import { readSidecar } from "@pokemap/core/src/world/sidecar.js";
import { createRaster, blitScaled } from "@pokemap/core/src/render/raster.js";
import { parseEncounters, speciesChances, type SpeciesChance } from "@pokemap/core/src/load/encounters.js";
import { whereSpecies, coverage } from "@pokemap/core/src/analyse/coverage.js";
import { detectEngineFamily, type EngineFamily } from "@pokemap/core/src/family.js";
import { encodePng } from "./png.js";
import { resolveProject, resolveRoot, layoutNameFor } from "./context.js";
import { parseBorder, parseBbox, parseScale, parseTime } from "./args.js";
import { resolvePlacementRect } from "./renderWorld.js";
import { runSignSuggest, runSignAdd, runSignList, runPaint, runDiff } from "./writeCommands.js";
import { runGbcRender, runGbcQuery, runGbcRenderWorld, runGbcEncounters, runGbcWhere, runGbcCoverage } from "./gbcCommands.js";

const program = new Command();
program.name("pokemap").option("-p, --project <path>", "decomp root");

/**
 * The one root-resolution step every command shares (Task 10): resolve the
 * decomp root once, then probe its engine family once, so the family branch
 * below is never hand-copied per command.
 */
function resolveRootAndFamily(explicit?: string): { root: string; family: EngineFamily } {
  const root = resolveRoot(explicit);
  return { root, family: detectEngineFamily(root) };
}

/**
 * Refuses with one consistent message naming `command` when the resolved
 * root is a GBC (pokecrystal-family) project. Called as a plain guard-clause
 * statement at the top of a GBA-only action, BEFORE that action's body (and
 * therefore any GBA loader) ever runs -- `render`/`query` (Task 10) and
 * `encounters`/`where`/`coverage` (Task 12) are the commands with a real GBC
 * implementation; every other command (sign/paint/diff -- G7, no write path
 * for GBC yet) calls this instead.
 */
function refuseIfGbc(family: EngineFamily, command: string): void {
  if (family === "gbc") {
    throw new Error(`${command} is not supported for gbc (pokecrystal-family) projects yet`);
  }
}

program
  .command("render <target>")
  .description("render a map or layout to a PNG")
  .option("-o, --out <file>", "output path", "out.png")
  .option("--border <rings>", "rings of border to draw", parseBorder, 0)
  .option("--time <time>", "time of day (gbc only): morn, day, or nite", parseTime, "day")
  .action((target: string, opts: { out: string; border: number; time: "morn" | "day" | "nite" }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    if (family === "gbc") {
      const { stdout, stderr } = runGbcRender(root, target, { out: opts.out, border: opts.border, time: opts.time });
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      return;
    }
    const proj = resolveProject(root);
    const r = renderLayout(proj, layoutNameFor(proj, target), { border: opts.border });
    writeFileSync(opts.out, encodePng(r));
    process.stdout.write(`${opts.out} ${r.width}x${r.height} outOfRange=${r.outOfRangeCount}\n`);
  });

program
  .command("render-world")
  .description("render a region of the stitched world to a PNG")
  .requiredOption("--bbox <x,y,w,h>", "region in tiles (gba) or blocks (gbc)", parseBbox)
  .option("-o, --out <file>", "output path", "world.png")
  // No commander-level default (Task 11): GBA's own quarter-scale default is
  // 4 px/tile (16px tile / 4) and GBC's is 8 px/block (32px block / 4) -- the
  // same "quarter overview" ratio, but a different raw number, so the default
  // is resolved per family below rather than baked into this one option
  // definition. `parseScale` itself stays family-agnostic (a positive
  // integer, full stop): GBA's unit is a 16px tile and GBC's is a 32px
  // block, so a single "must divide N" check here would be wrong for one
  // family or the other. `renderGbcWorld` (core) does its own divisor-of-32
  // refusal for the GBC path; GBA's `blitScaled(..., scale / 16)` below has
  // always accepted any positive integer, unchanged here.
  .option("--scale <n>", "pixels per tile/block (gba default 4, gbc default 8)", parseScale)
  .option("--no-dungeons", "exclude auto-placed dungeon maps (gba only; ignored for gbc)")
  .option("--time <time>", "time of day (gbc only): morn, day, or nite", parseTime, "day")
  .action((opts: { bbox: ReturnType<typeof parseBbox>; out: string; scale?: number; dungeons: boolean; time: "morn" | "day" | "nite" }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    if (family === "gbc") {
      // --no-dungeons is a GBA-only concept (dungeon auto-layout has no GBC
      // UI in Plan 6, task spec "Out of scope"); silently ignored here rather
      // than refused, since a user who scripts both families' render-world
      // calls the same way should not have to special-case GBC just to drop
      // a flag that means nothing for it.
      //
      // Fix round 1 (quality review Important #2): plain `opts.scale ?? 8`,
      // not `cmd.getOptionValueSource("scale") === "default" || ...` -- this
      // option has no commander-level default any more (see the comment
      // above), so `getOptionValueSource` can only ever return `undefined`
      // here, never the string `"default"`; that half of the old condition
      // was dead code, confirmed against the installed commander directly.
      // The simpler form is exactly the same shape GBA already uses two
      // lines down (`opts.scale ?? 4`), and needs no `Command` parameter.
      const scale = opts.scale ?? 8;
      const { stdout, stderr } = runGbcRenderWorld(root, { bbox: opts.bbox, out: opts.out, scale, time: opts.time });
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      return;
    }
    const proj = resolveProject(root);
    const { x: bx, y: by, w: bw, h: bh } = opts.bbox;
    const scale = opts.scale ?? 4;

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
      // Review fix: this used to skip every component:-1 placement (a
      // stale or not-yet-clustered manual entry -- see
      // packages/core/test/world/sidecar.test.ts) outright, reasoning
      // there was no cheap way to size it. resolvePlacementRect recovers
      // the real size via proj.layoutForMap instead (see its own doc
      // comment for why that reasoning was wrong) -- null only for the
      // genuinely unrecoverable case, a manual placement naming a map no
      // longer in the project at all.
      const rect = resolvePlacementRect(proj, p);
      if (!rect) continue;
      if (p.x + rect.width <= bx || p.x >= bx + bw || p.y + rect.height <= by || p.y >= by + bh) continue;
      blitScaled(dst, renderLayout(proj, rect.layoutName), (p.x - bx) * scale, (p.y - by) * scale, scale / 16);
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
    const { root, family } = resolveRootAndFamily(program.opts().project);
    if (family === "gbc") {
      const { stdout, stderr } = runGbcQuery(root, map, opts);
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      return;
    }
    const proj = resolveProject(root);
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
    const { root, family } = resolveRootAndFamily(program.opts().project);
    refuseIfGbc(family, "validate");
    const proj = resolveProject(root);

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

program
  .command("encounters <map>")
  .description("wild encounters for a map, with true percentages")
  .option("--json", "machine-readable output")
  .action((map: string, opts: { json?: boolean }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    if (family === "gbc") {
      const { stdout, stderr } = runGbcEncounters(root, map, opts);
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      return;
    }
    const proj = resolveProject(root);
    const enc = parseEncounters(readFileSync(proj.paths.wildEncountersJson, "utf8"));
    const mapId = proj.map(map).id;
    const result = Object.fromEntries(
      (["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"] as const)
        .map((m) => [m, speciesChances(enc, mapId, m)])
        .filter(([, v]) => v),
    );
    if (opts.json) return void process.stdout.write(JSON.stringify(result, null, 2));
    for (const [method, chances] of Object.entries(result)) {
      process.stdout.write(`${method}\n`);
      for (const c of chances as SpeciesChance[]) {
        process.stdout.write(`  ${c.percent.toFixed(1).padStart(5)}%  Lv ${c.minLevel}-${c.maxLevel}  ${c.species}\n`);
      }
    }
  });

program
  .command("where <species>")
  .description("every map a species can be caught on")
  .option("--json", "machine-readable output")
  .action((species: string, opts: { json?: boolean }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    if (family === "gbc") {
      // Raw, unmodified input -- runGbcWhere's own normalizeSpecies does the
      // uppercasing and "SPECIES_" stripping (fix round 1, spec review M7).
      const { stdout, stderr } = runGbcWhere(root, species, opts);
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      return;
    }
    const proj = resolveProject(root);
    const hits = whereSpecies(proj, species.startsWith("SPECIES_") ? species : `SPECIES_${species.toUpperCase()}`);
    if (opts.json) return void process.stdout.write(JSON.stringify(hits, null, 2));
    if (hits.length === 0) return void process.stdout.write(`${species} appears in no encounter table\n`);
    for (const h of hits) {
      process.stdout.write(`${(h.mapName ?? h.mapId).padEnd(32)} ${h.percent.toFixed(1).padStart(5)}%  Lv ${h.minLevel}-${h.maxLevel}  ${h.method}\n`);
    }
  });

program
  .command("coverage")
  .description("encounter design gaps across the project")
  .option("--empty", "list maps with no encounter table")
  .option("--unused", "list species in no encounter table")
  .option("--json", "machine-readable output")
  .action((opts: { empty?: boolean; unused?: boolean; json?: boolean }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    if (family === "gbc") {
      const { stdout, stderr } = runGbcCoverage(root, opts);
      if (stderr) process.stderr.write(stderr);
      process.stdout.write(stdout);
      return;
    }
    const proj = resolveProject(root);
    const c = coverage(proj);
    if (opts.json) return void process.stdout.write(JSON.stringify(c, null, 2));
    process.stdout.write(`${c.mapsWithEncounters} maps with encounters, ${c.mapsWithoutEncounters.length} without\n`);
    if (opts.empty) for (const m of c.mapsWithoutEncounters) process.stdout.write(`  ${m}\n`);
    if (opts.unused) for (const s of c.unusedSpecies) process.stdout.write(`  ${s}\n`);
  });

// A `program.command("sign suggest <map>")` one-liner does NOT nest a
// "suggest" subcommand under "sign" the way it reads -- commander 12's own
// `.command(nameAndArgs)` splits nameAndArgs on the FIRST space only
// (`nameAndArgs.match(/([^ ]+) *(.*)/)`), so that string registers a
// TOP-LEVEL command literally named "sign" whose remaining text
// ("suggest <map>") is handed to `.arguments()`, which splits it on
// whitespace AGAIN and defines two positional arguments -- one literally
// named "suggest", one named "map" -- not a nested "sign suggest"
// subcommand at all. Real nesting needs an attached parent command
// (`program.command("sign")`) with subcommands created off of THAT
// object, exactly as below.
const sign = program.command("sign").description("wild sign commands");

sign
  .command("suggest <map>")
  .description("rank catchable species and suggest a placement for a wild sign on this map")
  .action((map: string) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    refuseIfGbc(family, "sign suggest");
    const proj = resolveProject(root);
    process.stdout.write(`${runSignSuggest(proj, map)}\n`);
  });

sign
  .command("add <map>")
  .description("add a wild sign -- prints the plan by default, writes only with --yes")
  .requiredOption("--species <name>", "e.g. RATTATA or SPECIES_RATTATA")
  .requiredOption("--dialogue <text>", "the one line shown on interact")
  .requiredOption("--x <n>", "tile x", Number)
  .requiredOption("--y <n>", "tile y", Number)
  .option("--elevation <n>", "tile elevation", Number, 0)
  .option("--yes", "actually write")
  .action((map: string, opts: { species: string; dialogue: string; x: number; y: number; elevation: number; yes?: boolean }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    refuseIfGbc(family, "sign add");
    const proj = resolveProject(root);
    process.stdout.write(`${runSignAdd(proj, { map, x: opts.x, y: opts.y, elevation: opts.elevation, species: opts.species, dialogue: opts.dialogue, yes: !!opts.yes })}\n`);
  });

sign
  .command("list <map>")
  .description("list existing wild signs (overworld-species object events) on a map")
  .action((map: string) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    refuseIfGbc(family, "sign list");
    const proj = resolveProject(root);
    process.stdout.write(`${runSignList(proj, map)}\n`);
  });

program
  .command("paint <map>")
  .description("paint one metatile (pencil) or a rectangle (rect) -- prints the plan by default, writes only with --yes")
  .requiredOption("--tool <tool>", "pencil or rect")
  .requiredOption("--x <n>", "tile x (or rect's first corner)", Number)
  .requiredOption("--y <n>", "tile y (or rect's first corner)", Number)
  .option("--x1 <n>", "rect's second corner x", Number)
  .option("--y1 <n>", "rect's second corner y", Number)
  .requiredOption("--metatile <id>", "metatile id to stamp", Number)
  .option("--yes", "actually write")
  .action((map: string, opts: { tool: "pencil" | "rect"; x: number; y: number; x1?: number; y1?: number; metatile: number; yes?: boolean }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    refuseIfGbc(family, "paint");
    const proj = resolveProject(root);
    process.stdout.write(`${runPaint(proj, { map, tool: opts.tool, x: opts.x, y: opts.y, x1: opts.x1, y1: opts.y1, metatileId: opts.metatile, yes: !!opts.yes })}\n`);
  });

program
  .command("diff <map>")
  .description("preview a paint edit's plan without writing (always a dry run)")
  .requiredOption("--tool <tool>", "pencil or rect")
  .requiredOption("--x <n>", "tile x (or rect's first corner)", Number)
  .requiredOption("--y <n>", "tile y (or rect's first corner)", Number)
  .option("--x1 <n>", "rect's second corner x", Number)
  .option("--y1 <n>", "rect's second corner y", Number)
  .requiredOption("--metatile <id>", "metatile id to stamp", Number)
  .action((map: string, opts: { tool: "pencil" | "rect"; x: number; y: number; x1?: number; y1?: number; metatile: number }) => {
    const { root, family } = resolveRootAndFamily(program.opts().project);
    refuseIfGbc(family, "diff");
    const proj = resolveProject(root);
    process.stdout.write(`${runDiff(proj, { map, tool: opts.tool, x: opts.x, y: opts.y, x1: opts.x1, y1: opts.y1, metatileId: opts.metatile })}\n`);
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
