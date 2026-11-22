import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCli, type CliResult } from "./runCli.js";

export interface ServerOptions {
  /** Decomp root; omitted means the CLI falls back to pokemap.config.json. */
  project?: string;
  /** Directory render tools write PNGs into; default a fresh temp dir. */
  outDir?: string;
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

/** CLI result to tool result: stdout, with stderr appended; a non-zero exit is an error carrying the CLI's own text verbatim. */
function toResult(r: CliResult) {
  const body = [r.stdout, r.stderr].filter((s) => s.trim()).join("\n");
  return text(body || `(exit ${r.status}, no output)`, r.status !== 0);
}

/**
 * Builds the read-only tool set (Plan 4 row 3a). Write tools (row 3c) are not
 * registered here. Every tool shells out to the CLI, so family dispatch and
 * refusal messages ("... is not supported for gbc ...") stay the CLI's own.
 */
export function createPokemapServer(opts: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "pokemap", version: "0.0.0" });
  let outDir = opts.outDir;
  const outFile = (name: string) => join((outDir ??= mkdtempSync(join(tmpdir(), "pokemap-mcp-"))), name);
  const run = async (args: string[]) => toResult(await runCli(opts.project, args));
  const map = z.string().describe("map name, e.g. PetalburgCity");
  const time = z.enum(["morn", "day", "nite"]).optional().describe("time of day (GBC only)");

  server.registerTool("pokemap_render", {
    description: "Render a map or layout to a PNG file; returns the file path and size (both families). Image content comes in a later release.",
    inputSchema: { target: z.string().describe("map or layout name"), border: z.number().int().min(0).optional().describe("rings of border"), time },
  }, ({ target, border, time }) => {
    const out = outFile(`${target.replace(/[^\w.-]/g, "_")}.png`);
    return run(["render", target, "-o", out, ...(border !== undefined ? ["--border", String(border)] : []), ...(time ? ["--time", time] : [])]);
  });

  server.registerTool("pokemap_render_world", {
    description: "Render a bounded region of the stitched world to a PNG file (bbox in tiles for GBA, blocks for GBC); returns the path.",
    inputSchema: {
      x: z.number().int(), y: z.number().int(), w: z.number().int().positive(), h: z.number().int().positive(),
      scale: z.number().int().positive().optional().describe("pixels per tile (GBA default 4) or block (GBC default 8)"),
      dungeons: z.boolean().optional().describe("GBA only; false excludes auto-placed dungeon maps"), time,
    },
  }, ({ x, y, w, h, scale, dungeons, time }) =>
    run(["render-world", "--bbox", `${x},${y},${w},${h}`, "-o", outFile(`world-${x}_${y}_${w}x${h}.png`),
      ...(scale ? ["--scale", String(scale)] : []), ...(dungeons === false ? ["--no-dungeons"] : []), ...(time ? ["--time", time] : [])]));

  server.registerTool("pokemap_map_info", {
    description: "A map's header, connections, events, resolved split and layout_version, as JSON (both families).",
    inputSchema: { map, section: z.enum(["header", "connections", "events"]).optional().describe("one section only") },
  }, ({ map, section }) => run(["query", map, ...(section ? [`--${section}`] : [])]));

  server.registerTool("pokemap_validate", {
    description: "Static checks over the project (GBA only): metatile range per layout and palette range. Findings as JSON.",
    inputSchema: { check: z.enum(["metatile-range", "palette-range"]).optional().describe("one check; default all") },
  }, async ({ check }) => {
    const r = await runCli(opts.project, ["validate", "--json", ...(check ? [`--${check}`] : [])]);
    // The CLI exits 1 when there are findings; that is a result, not a failure.
    return r.status === 1 && r.stdout.trim().startsWith("[") ? text(r.stdout) : toResult(r);
  });

  server.registerTool("pokemap_encounters", {
    description: "Wild encounters for a map with true percentages, as JSON (both families).",
    inputSchema: { map },
  }, ({ map }) => run(["encounters", map, "--json"]));

  server.registerTool("pokemap_where", {
    description: "Every map a species can be caught on, as JSON (both families).",
    inputSchema: { species: z.string().describe("e.g. RATTATA or SPECIES_RATTATA") },
  }, ({ species }) => run(["where", species, "--json"]));

  server.registerTool("pokemap_coverage", {
    description: "Encounter design gaps across the project, as JSON (both families).",
    inputSchema: {},
  }, () => run(["coverage", "--json"]));

  server.registerTool("pokemap_indicator_suggest", {
    description: "Rank catchable species and suggest a placement for a Pokemon Indicator on a map (GBA only, read-only).",
    inputSchema: { map },
  }, ({ map }) => run(["indicator", "suggest", map]));

  server.registerTool("pokemap_indicator_list", {
    description: "List existing Pokemon Indicators (overworld-species object events) on a map (GBA only, read-only).",
    inputSchema: { map },
  }, ({ map }) => run(["indicator", "list", map]));

  server.registerTool("pokemap_diff", {
    description: "Dry-run a paint given in this call and return its save plan. Does NOT see an open editor session's pending changes. Never writes.",
    inputSchema: {
      map, tool: z.enum(["pencil", "rect", "bucket"]).describe("bucket is GBC only"),
      x: z.number().int(), y: z.number().int(), x1: z.number().int().optional(), y1: z.number().int().optional(),
      metatile: z.number().int().min(0),
    },
  }, ({ map, tool, x, y, x1, y1, metatile }) =>
    run(["diff", map, "--tool", tool, "--x", String(x), "--y", String(y),
      ...(x1 !== undefined ? ["--x1", String(x1)] : []), ...(y1 !== undefined ? ["--y1", String(y1)] : []), "--metatile", String(metatile)]));

  return server;
}
