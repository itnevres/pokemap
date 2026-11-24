import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
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
  /** Let the write tools run (Plan 4 row 3c). Off by default; the CLI flag is --allow-writes. The tools are always listed; without it each refuses and names the flag. */
  allowWrites?: boolean;
  /** Where to look for a running PokeMap hub. Tests only; default 127.0.0.1:5174. */
  hubAddress?: HubAddress;
}

/** Where a running PokeMap hub listens; any accepted connection there means the app is open. */
export interface HubAddress { host: string; port: number }
export const HUB_ADDRESS: HubAddress = { host: "127.0.0.1", port: 5174 };
/** A refused loopback connect can itself take 1-2 s on Windows, so this must stay well above that. */
export const HUB_TIMEOUT_MS = 3000;

/**
 * Fails closed. False only when the connection is refused (nothing listening).
 * A connection that is accepted, one that does not answer in time (a hub busy
 * in a long synchronous step still accepts at the kernel), or any other error
 * all mean "running".
 */
export function hubRunning(addr: HubAddress = HUB_ADDRESS, timeoutMs = HUB_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ host: addr.host, port: addr.port });
    const done = (running: boolean) => { clearTimeout(timer); sock.destroy(); resolve(running); };
    const timer = setTimeout(() => done(true), timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("error", (e: NodeJS.ErrnoException) => done(e.code !== "ECONNREFUSED"));
  });
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

/** CLI result to tool result: stdout, with stderr appended; a non-zero exit is an error carrying the CLI's own text verbatim. */
function toResult(r: CliResult) {
  const body = [r.stdout, r.stderr].filter((s) => s.trim()).join("\n");
  return text(body || `(exit ${r.status}, no output)`, r.status !== 0);
}

/**
 * Image content for the PNG a render wrote, then the CLI's own text. A failed
 * CLI call is returned unchanged, with no image.
 */
async function imageResult(r: CliResult, file: string) {
  const base = toResult(r);
  if (base.isError) return base;
  const data = (await readFile(file)).toString("base64");
  return { content: [{ type: "image" as const, data, mimeType: "image/png" }, ...base.content] };
}

/**
 * Refuses free-form string arguments that the CLI would read as options
 * (e.g. "--help"). Returns the error result, or null when every value is safe.
 * Call before spawning the CLI.
 */
function dashRefusal(tool: string, args: Record<string, string>) {
  const bad = Object.entries(args).find(([, v]) => v.startsWith("-"));
  return bad ? text(`${tool}: argument "${bad[0]}" must not start with "-"`, true) : null;
}

/**
 * Builds the read tool set (Plan 4 row 3a) and the write tools (row 3c; they refuse unless allowWrites). Every tool shells out to the CLI, so family dispatch and
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
    description: "Render a map or layout to a PNG; returns the PNG as image content, then its file path and size (both families).",
    inputSchema: { target: z.string().describe("map or layout name"), border: z.number().int().min(0).optional().describe("rings of border"), time },
  }, async ({ target, border, time }) => {
    const refused = dashRefusal("pokemap_render", { target });
    if (refused) return refused;
    const out = outFile(`${target.replace(/[^\w.-]/g, "_")}.png`);
    return imageResult(await runCli(opts.project, ["render", target, "-o", out, ...(border !== undefined ? ["--border", String(border)] : []), ...(time ? ["--time", time] : [])]), out);
  });

  server.registerTool("pokemap_render_world", {
    description: "Render a bounded region of the stitched world to a PNG (bbox in tiles for GBA, blocks for GBC); returns the PNG as image content, then its path.",
    inputSchema: {
      x: z.number().int(), y: z.number().int(), w: z.number().int().positive(), h: z.number().int().positive(),
      scale: z.number().int().positive().optional().describe("pixels per tile (GBA default 4) or block (GBC default 8)"),
      dungeons: z.boolean().optional().describe("GBA only; false excludes auto-placed dungeon maps"), time,
    },
  }, async ({ x, y, w, h, scale, dungeons, time }) => {
    const out = outFile(`world-${x}_${y}_${w}x${h}.png`);
    return imageResult(await runCli(opts.project, ["render-world", "--bbox", `${x},${y},${w},${h}`, "-o", out,
      ...(scale ? ["--scale", String(scale)] : []), ...(dungeons === false ? ["--no-dungeons"] : []), ...(time ? ["--time", time] : [])]), out);
  });

  server.registerTool("pokemap_map_info", {
    description: "A map's header, connections, events, resolved split and layout_version, as JSON (both families).",
    inputSchema: { map, section: z.enum(["header", "connections", "events"]).optional().describe("one section only") },
  }, ({ map, section }) => {
    const refused = dashRefusal("pokemap_map_info", { map });
    if (refused) return refused;
    return run(["query", map, ...(section ? [`--${section}`] : [])]);
  });

  server.registerTool("pokemap_validate", {
    description: "Static checks over the project (GBA only): metatile range per layout and palette range. Findings as JSON.",
    inputSchema: { check: z.enum(["metatile-range", "palette-range"]).optional().describe("one check; default all") },
  }, async ({ check }) => {
    const r = await runCli(opts.project, ["validate", "--json", ...(check ? [`--${check}`] : [])]);
    // The CLI exits 1 when there are findings; that is a result, not a failure.
    return r.status === 1 && r.stdout.trim().startsWith("[") ? text(r.stderr.trim() ? `${r.stdout}
${r.stderr}` : r.stdout) : toResult(r);
  });

  server.registerTool("pokemap_encounters", {
    description: "Wild encounters for a map with true percentages, as JSON (both families).",
    inputSchema: { map },
  }, ({ map }) => {
    const refused = dashRefusal("pokemap_encounters", { map });
    if (refused) return refused;
    return run(["encounters", map, "--json"]);
  });

  server.registerTool("pokemap_where", {
    description: "Every map a species can be caught on, as JSON (both families).",
    inputSchema: { species: z.string().describe("e.g. RATTATA or SPECIES_RATTATA") },
  }, ({ species }) => {
    const refused = dashRefusal("pokemap_where", { species });
    if (refused) return refused;
    return run(["where", species, "--json"]);
  });

  server.registerTool("pokemap_coverage", {
    description: "Encounter design gaps across the project, as JSON (both families).",
    inputSchema: {},
  }, () => run(["coverage", "--json"]));

  server.registerTool("pokemap_indicator_suggest", {
    description: "Rank catchable species and suggest a placement for a Pokemon Indicator on a map (GBA only, read-only).",
    inputSchema: { map },
  }, ({ map }) => {
    const refused = dashRefusal("pokemap_indicator_suggest", { map });
    if (refused) return refused;
    return run(["indicator", "suggest", map]);
  });

  server.registerTool("pokemap_indicator_list", {
    description: "List existing Pokemon Indicators (overworld-species object events) on a map (GBA only, read-only).",
    inputSchema: { map },
  }, ({ map }) => {
    const refused = dashRefusal("pokemap_indicator_list", { map });
    if (refused) return refused;
    return run(["indicator", "list", map]);
  });

  server.registerTool("pokemap_diff", {
    description: "Dry-run a paint given in this call and return its save plan. Does NOT see an open editor session's pending changes. Never writes.",
    inputSchema: {
      map, tool: z.enum(["pencil", "rect", "bucket"]).describe("bucket is GBC only"),
      x: z.number().int(), y: z.number().int(), x1: z.number().int().optional(), y1: z.number().int().optional(),
      metatile: z.number().int().min(0),
    },
  }, ({ map, tool, x, y, x1, y1, metatile }) => {
    const refused = dashRefusal("pokemap_diff", { map });
    if (refused) return refused;
    return run(["diff", map, "--tool", tool, "--x", String(x), "--y", String(y),
      ...(x1 !== undefined ? ["--x1", String(x1)] : []), ...(y1 !== undefined ? ["--y1", String(y1)] : []), "--metatile", String(metatile)]);
  });

  registerWriteTools(server, run, !!opts.allowWrites, opts.hubAddress ?? HUB_ADDRESS);
  return server;
}

type Runner = (args: string[]) => Promise<ReturnType<typeof toResult>>;

/**
 * Write tools (Plan 4 row 3c), always listed; without allowWrites each refuses and names --allow-writes. Each spawns
 * the CLI's own write command with --yes, so the save funnel, guards and plan
 * text are the CLI's. A running hub keeps caches and session baselines that a
 * direct write would invalidate (trap 10), so a write is refused while one
 * is listening (fail closed, see hubRunning); dry_run writes nothing and skips that check.
 */
function registerWriteTools(server: McpServer, run: Runner, allowWrites: boolean, hub: HubAddress): void {
  const map = z.string().describe("map name, e.g. Route35");
  const dryRun = z.boolean().optional().describe("true: return the plan and write nothing");
  const kind = z.enum(["warp", "coord", "bg", "object"]);
  const index = z.number().int().min(0).describe("0-based index within that kind");
  let queue: Promise<unknown> = Promise.resolve(); // one CLI writer at a time
  const guarded = (tool: string, strings: Record<string, string>, dry: boolean | undefined, args: string[]) => {
    const job = queue.then(async () => {
      if (!allowWrites) return text(`${tool}: write tools are disabled; restart the MCP server with --allow-writes to enable them`, true);
      const refused = dashRefusal(tool, strings);
      if (refused) return refused;
      if (!dry && await hubRunning(hub)) {
        return text(`${tool}: PokeMap is running (a hub is listening on ${hub.host}:${hub.port}). Close PokeMap first, then call this tool again; writing around a running app would make its next save fail as changed on disk.`, true);
      }
      return run([...args, ...(dry ? [] : ["--yes"])]);
    });
    queue = job.catch(() => undefined);
    return job;
  };

  server.registerTool("pokemap_paint", {
    description: "WRITE (needs the server started with --allow-writes, and PokeMap closed): paint a metatile (pencil), rectangle (rect) or flood fill (bucket, GBC only) and return the save plan (both families). dry_run previews only.",
    inputSchema: {
      map, tool: z.enum(["pencil", "rect", "bucket"]),
      x: z.number().int(), y: z.number().int(), x1: z.number().int().optional(), y1: z.number().int().optional(),
      metatile: z.number().int().min(0), dry_run: dryRun,
    },
  }, ({ map, tool, x, y, x1, y1, metatile, dry_run }) => guarded("pokemap_paint", { map }, dry_run, [
    "paint", map, "--tool", tool, "--x", String(x), "--y", String(y),
    ...(x1 !== undefined ? ["--x1", String(x1)] : []), ...(y1 !== undefined ? ["--y1", String(y1)] : []), "--metatile", String(metatile)]));

  server.registerTool("pokemap_indicator_add", {
    description: "WRITE (needs the server started with --allow-writes, and PokeMap closed): add a Pokemon Indicator object event with its script (GBA only) and return the save plan. dry_run previews only.",
    inputSchema: {
      map, species: z.string().describe("e.g. RATTATA or SPECIES_RATTATA"), text: z.string().describe("text shown on interact"),
      x: z.number().int(), y: z.number().int(), elevation: z.number().int().min(0).optional(), dry_run: dryRun,
    },
  }, ({ map, species, text: msg, x, y, elevation, dry_run }) => guarded("pokemap_indicator_add", { map, species, text: msg }, dry_run, [
    "indicator", "add", map, `--species=${species}`, `--text=${msg}`, "--x", String(x), "--y", String(y),
    ...(elevation !== undefined ? ["--elevation", String(elevation)] : [])]));

  server.registerTool("pokemap_event_move", {
    description: "WRITE (needs the server started with --allow-writes, and PokeMap closed): move one event to (x, y) in 16 px event steps (GBC only) and return the save plan. dry_run previews only.",
    inputSchema: { map, kind, index, x: z.number().int(), y: z.number().int(), dry_run: dryRun },
  }, ({ map, kind, index, x, y, dry_run }) => guarded("pokemap_event_move", { map }, dry_run, [
    "event", "move", map, "--kind", kind, "--index", String(index), "--x", String(x), "--y", String(y)]));

  server.registerTool("pokemap_event_add", {
    description: "WRITE (needs the server started with --allow-writes, and PokeMap closed): append one event (GBC only); args is the macro's full comma-separated argument list in source order (4 for warp/coord/bg, 13 for object). Returns the save plan. dry_run previews only.",
    inputSchema: { map, kind, args: z.string(), const: z.string().optional().describe("object only: new object_const_def const"), dry_run: dryRun },
  }, ({ map, kind, args, const: constName, dry_run }) => guarded("pokemap_event_add", { map, args, ...(constName !== undefined ? { const: constName } : {}) }, dry_run, [
    "event", "add", map, "--kind", kind, `--args=${args}`, ...(constName !== undefined ? [`--const=${constName}`] : [])]));

  server.registerTool("pokemap_event_delete", {
    description: "WRITE (needs the server started with --allow-writes, and PokeMap closed): delete one event (GBC only) and return the save plan, including warnings for warps it re-targets. dry_run previews only.",
    inputSchema: { map, kind, index, dry_run: dryRun },
  }, ({ map, kind, index, dry_run }) => guarded("pokemap_event_delete", { map }, dry_run, [
    "event", "delete", map, "--kind", kind, "--index", String(index)]));
}
