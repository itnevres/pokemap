import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { unfilterScanlines } from "@pokemap/core/src/load/png.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap } from "@pokemap/core/src/gbc/render/map.js";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { renderGbcWorld } from "@pokemap/core/src/gbc/render/world.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../../core/test/gbc/helpers/corpus.js";
import { runGbcRender, runGbcQuery, runGbcRenderWorld, runGbcEncounters, runGbcWhere, runGbcCoverage } from "../src/gbcCommands.js";
import { gbcEncounterSources } from "@pokemap/core/src/gbc/analyse/atlas.js";
import { beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hasGbcProject, copyGbcSubjectToTemp, removeTemp } from "../../core/test/gbc/helpers/corpus.js";
import { runGbcPaint, runGbcDiff, runGbcEventMove, runGbcEventAdd, runGbcEventDelete } from "../src/gbcCommands.js";
import { paintCells as paintGbcCells, floodFill as gbcFloodFill } from "@pokemap/core/src/gbc/edit/paint.js";
import { moveGbcEvent, addGbcEvent } from "@pokemap/core/src/gbc/edit/events.js";
import { parseMapEvents } from "@pokemap/core/src/gbc/load/events.js";

/**
 * Decodes exactly the shape `encodePng` (`../src/png.ts`) writes -- 8-bit
 * RGBA, non-interlaced, filter type 0 on every row -- back into a raster.
 * Reuses core's own `unfilterScanlines` (shared with `readIndexedPng` and
 * the GBC tileset PNG reader) rather than a third hand-rolled unfilter, and
 * walks chunks the same way `png.test.ts` already does for its CRC check.
 */
function decodeRgbaPng(buf: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  expect(buf.readUInt32BE(0)).toBe(0x89504e47);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(buf[24]).toBe(8); // bit depth
  expect(buf[25]).toBe(6); // colour type RGBA

  const idat: Buffer[] = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const bytesPerRow = width * 4;
  const raw = inflateSync(Buffer.concat(idat));
  const unfiltered = unfilterScanlines(raw, bytesPerRow, height, 4);
  return { width, height, data: new Uint8ClampedArray(unfiltered.buffer, unfiltered.byteOffset, unfiltered.length) };
}

// Quality review fix round 1, Important #2: every dir this file creates is
// tracked here and removed in `afterAll`, mirroring
// `packages/core/test/family.test.ts`/`packages/cli/test/context.test.ts`'s
// own cleanup convention -- this file has no per-test isolation need (each
// test uses its own fresh dir/filename), so one end-of-suite sweep is enough.
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gbc-cli-"));
  tmpDirs.push(dir);
  return join(dir, name);
}

const CLI_ENTRY = "packages/cli/src/index.ts";
const REPO_ROOT = process.cwd();

/** Spawns the real CLI (`npx tsx packages/cli/src/index.ts ...`), from the
 *  repo root, exactly the invocation the task's own live-verify uses.
 *  `spawnSync`, not `execFileSync`: `execFileSync` only returns the child's
 *  `stdout` as its normal return value and discards `stderr` entirely on a
 *  zero exit (it's only attached to the thrown error object on a NON-zero
 *  exit) -- an earlier version of this helper returned a hardcoded `stderr:
 *  ""` on the success path, which happened to be correct for every existing
 *  exit-0 test (their real stderr genuinely was empty) but silently could
 *  not have caught a real stderr/stdout swap on a SUCCESSFUL run, exactly
 *  the gap the "render CeruleanCave2F" test below exists to close.
 *  `spawnSync` reports both streams and the exit code unconditionally. */
function spawnCli(args: string[]): { status: number; stdout: string; stderr: string } {
  // `node --import tsx`, not `npx tsx`: Windows can't spawn `npx` (a .cmd shim) without a shell.
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], { cwd: REPO_ROOT, encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

describe("runGbcRender", () => {
  itWithGbcCorpus("NewBarkTown: PNG decodes back to exactly renderGbcMap's data; two runs are byte-identical; exact stdout; empty stderr", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const expected = renderGbcMap(proj, "NewBarkTown", { time: "day" });

    const out = tmpFile("nbt.png");
    const r1 = runGbcRender(GBC_SUBJECT_ROOT, "NewBarkTown", { out, time: "day" });
    expect(r1.stdout).toBe(`${out} ${expected.width}x${expected.height} outOfRange=${expected.outOfRangeCount} unmapped=${expected.unmappedTileCount}\n`);
    expect(r1.stderr).toBe("");

    const decoded1 = decodeRgbaPng(readFileSync(out));
    expect(decoded1.width).toBe(expected.width);
    expect(decoded1.height).toBe(expected.height);
    // Fix round 1 (spec review Minor m7): `.equals()`, not `toEqual` on two
    // `Buffer`s -- see `render/world.test.ts`'s own comment on this same fix
    // for why a FAILING raster-buffer `toEqual` can hang vitest's diff
    // renderer for minutes instead of failing fast.
    expect(Buffer.from(decoded1.data).equals(Buffer.from(expected.data))).toBe(true);

    // Two runs, same output path: byte-identical PNG bytes (success
    // criterion 1 -- also kills the "render writes a non-deterministic
    // field" mutation, e.g. a timestamp in a PNG chunk).
    const bytes1 = readFileSync(out);
    runGbcRender(GBC_SUBJECT_ROOT, "NewBarkTown", { out, time: "day" });
    const bytes2 = readFileSync(out);
    expect(bytes2).toEqual(bytes1);
  });

  itWithGbcCorpus("omitting --time defaults to day, not nite", () => {
    // Kills the "default time nite" mutation: NewBarkTown's (0,0) day/nite
    // pixels are pinned as DIFFERENT values in render/map.test.ts's own
    // corpus block ([99,206,8,255] vs [66,107,156,255]), so a flipped
    // default produces a PNG that decodes to the WRONG one of those two.
    const withoutTime = tmpFile("default.png");
    runGbcRender(GBC_SUBJECT_ROOT, "NewBarkTown", { out: withoutTime });
    const withDay = tmpFile("day.png");
    runGbcRender(GBC_SUBJECT_ROOT, "NewBarkTown", { out: withDay, time: "day" });
    const withNite = tmpFile("nite.png");
    runGbcRender(GBC_SUBJECT_ROOT, "NewBarkTown", { out: withNite, time: "nite" });

    expect(readFileSync(withoutTime)).toEqual(readFileSync(withDay));
    expect(readFileSync(withoutTime)).not.toEqual(readFileSync(withNite));
  });

  itWithGbcCorpus("CeruleanCave2F: stderr carries exactly one warning: line naming its .blk", () => {
    const out = tmpFile("cc2f.png");
    const { stderr } = runGbcRender(GBC_SUBJECT_ROOT, "CeruleanCave2F", { out });
    const lines = stderr.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warning: maps\/CeruleanCave2F\.blk:/);
  });

  itWithGbcCorpus("--border 3 gives exact dimensions (w+6)x(h+6) blocks, in pixels", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const map = proj.map("NewBarkTown");
    const out = tmpFile("border.png");
    runGbcRender(GBC_SUBJECT_ROOT, "NewBarkTown", { out, border: 3 });
    const decoded = decodeRgbaPng(readFileSync(out));
    expect(decoded.width).toBe((map.width + 6) * 32);
    expect(decoded.height).toBe((map.height + 6) * 32);
  });

  itWithGbcCorpus("dropping the defect-to-stderr loop would surface no warning at all -- pinned against the real defect text", () => {
    // Not itself a mutation test (that's covered above); pins the exact,
    // full defect message this file's "one warning: line" test only checks
    // the prefix of, so a change to loadLayout's own wording is visible here
    // too.
    const out = tmpFile("cc2f-message.png");
    const { stderr } = runGbcRender(GBC_SUBJECT_ROOT, "CeruleanCave2F", { out });
    expect(stderr).toBe(
      "warning: maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable\n",
    );
  });
});

describe("runGbcQuery", () => {
  itWithGbcCorpus("NewBarkTown: exact header/connections/events with no flags (all)", () => {
    const { stdout, stderr } = runGbcQuery(GBC_SUBJECT_ROOT, "NewBarkTown", {});
    expect(stderr).toBe(""); // NewBarkTown carries no defect on either loader
    const parsed = JSON.parse(stdout) as {
      header: { tileset: string; environment: string; palette: string; fishGroup: string; border: number; group: number; layout: { blkPath: string; width: number; height: number; writable: boolean } };
      connections: { direction: string; targetName: string }[];
      events: { warps: unknown[]; coords: unknown[]; bgs: unknown[]; objects: unknown[] };
    };

    expect(parsed.header.tileset).toBe("TILESET_JOHTO");
    expect(parsed.header.environment).toBe("TOWN");
    expect(parsed.header.palette).toBe("PALETTE_AUTO");
    expect(parsed.header.fishGroup).toBe("FISHGROUP_OCEAN");
    expect(parsed.header.border).toBe(5);
    expect(parsed.header.group).toBe(24);
    expect(parsed.header.layout).toEqual({ blkPath: "maps/NewBarkTown.blk", width: 10, height: 9, writable: true });

    expect(parsed.connections).toHaveLength(2);
    expect(parsed.connections.map((c) => c.direction).sort()).toEqual(["east", "west"]);

    expect(parsed.events.warps).toHaveLength(4);
    expect(parsed.events.coords).toHaveLength(2);
    expect(parsed.events.bgs).toHaveLength(4);
    expect(parsed.events.objects).toHaveLength(3);
  });

  itWithGbcCorpus("--header includes no connections or events key (also kills the '--header including events' mutation)", () => {
    const { stdout } = runGbcQuery(GBC_SUBJECT_ROOT, "NewBarkTown", { header: true });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["header"]);
    expect(parsed).not.toHaveProperty("events");
    expect(parsed).not.toHaveProperty("connections");
  });

  itWithGbcCorpus("--connections only includes connections", () => {
    const { stdout } = runGbcQuery(GBC_SUBJECT_ROOT, "NewBarkTown", { connections: true });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["connections"]);
  });

  itWithGbcCorpus("--events only includes events, with the exact per-kind counts", () => {
    const { stdout } = runGbcQuery(GBC_SUBJECT_ROOT, "NewBarkTown", { events: true });
    const parsed = JSON.parse(stdout) as { events: { warps: unknown[]; coords: unknown[]; bgs: unknown[]; objects: unknown[] } };
    expect(Object.keys(parsed)).toEqual(["events"]);
    expect(parsed.events.warps).toHaveLength(4);
    expect(parsed.events.coords).toHaveLength(2);
    expect(parsed.events.bgs).toHaveLength(4);
    expect(parsed.events.objects).toHaveLength(3);
  });

  itWithGbcCorpus("--header on CeruleanCave2F surfaces the layout defect as a warning", () => {
    const { stderr } = runGbcQuery(GBC_SUBJECT_ROOT, "CeruleanCave2F", { header: true });
    expect(stderr).toMatch(/^warning: maps\/CeruleanCave2F\.blk:/);
  });
});

describe("runGbcRenderWorld", () => {
  itWithGbcCorpus("writes a PNG that decodes to exactly renderGbcWorld's raster; exact stdout; empty stderr for a defect-free bbox", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const nbt = world.placements.get("NewBarkTown")!;
    const route29 = world.placements.get("Route29")!;
    const bbox = { x: route29.x, y: nbt.y, w: (nbt.x + nbt.width) - route29.x, h: nbt.height };
    const expected = renderGbcWorld(proj, world, { bbox, scale: 32, time: "day" });

    const out = tmpFile("world.png");
    const { stdout, stderr } = runGbcRenderWorld(GBC_SUBJECT_ROOT, { bbox, out, scale: 32, time: "day" });
    expect(stdout).toBe(`${out} ${expected.width}x${expected.height} maps=${expected.drawn}\n`);
    expect(stderr).toBe("");

    const decoded = decodeRgbaPng(readFileSync(out));
    expect(decoded.width).toBe(expected.width);
    expect(decoded.height).toBe(expected.height);
    // Fix round 1 (spec review Minor m7): see the identical fix above.
    expect(Buffer.from(decoded.data).equals(Buffer.from(expected.data))).toBe(true);
  });

  itWithGbcCorpus("a bbox including CeruleanCave2F surfaces its layout defect as a warning line", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const p = world.placements.get("CeruleanCave2F")!;
    const out = tmpFile("world-defect.png");
    const { stderr } = runGbcRenderWorld(GBC_SUBJECT_ROOT, {
      bbox: { x: p.x, y: p.y, w: p.width, h: p.height }, out, scale: 32,
    });
    expect(stderr).toBe("warning: maps/CeruleanCave2F.blk: actual size 400 bytes, declared 9x15=135 -- loaded first 135 bytes, not writable\n");
  });

  /**
   * Fix round 1 (spec review Minor m1): a bbox covering exactly Route17 and
   * Route18 draws exactly the two maps each named as the `.map` of one of
   * the corpus's 2 real `Conflict`s (`world/connections.test.ts`), so both
   * notes must appear, in `world.conflicts`' own order, worded exactly as
   * `noteLines` builds them. Exit code is unaffected -- this is purely
   * informational stderr alongside (here, on top of) any `warning:` lines.
   */
  itWithGbcCorpus("a bbox covering Route17/Route18 prints one note: line per drawn conflict", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const world = buildGbcWorld(proj);
    const route17 = world.placements.get("Route17")!;
    const route18 = world.placements.get("Route18")!;
    const bbox = {
      x: Math.min(route17.x, route18.x),
      y: Math.min(route17.y, route18.y),
      w: Math.max(route17.x + route17.width, route18.x + route18.width) - Math.min(route17.x, route18.x),
      h: Math.max(route17.y + route17.height, route18.y + route18.height) - Math.min(route17.y, route18.y),
    };
    const out = tmpFile("route17-18.png");
    const { stdout, stderr } = runGbcRenderWorld(GBC_SUBJECT_ROOT, { bbox, out, scale: 32 });
    expect(stdout).toMatch(/maps=2\n$/);
    expect(stderr).toBe(
      "note: Route18 placed via FuchsiaCity; Route17 disagrees by (0,-1)\n" +
      "note: Route17 placed via Route16; Route18 disagrees by (0,1)\n",
    );
  });

});

describe("CLI end-to-end (spawned, generous timeout)", () => {
  itWithGbcCorpus("render NewBarkTown against the real subject exits 0 and prints the stdout line", () => {
    const out = tmpFile("e2e.png");
    const { status, stdout, stderr } = spawnCli(["--project", GBC_SUBJECT_ROOT, "render", "NewBarkTown", "-o", out]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const expected = renderGbcMap(proj, "NewBarkTown", { time: "day" });
    expect(stdout).toBe(`${out} ${expected.width}x${expected.height} outOfRange=${expected.outOfRangeCount} unmapped=${expected.unmappedTileCount}\n`);
  }, 30_000);

  itWithGbcCorpus("render CeruleanCave2F against the real subject: the warning lands on stderr, never stdout", () => {
    // Spec review fix round 1, Issue 2: `runGbcRender`'s own `{ stdout,
    // stderr }` split is unit-tested above, but `index.ts`'s own
    // `if (stderr) process.stderr.write(stderr); process.stdout.write(stdout);`
    // wiring line was never exercised end-to-end against a map that actually
    // produces a non-empty `stderr` -- this spawns the real CLI process and
    // reads its two OS streams separately, so a mutation that swaps which
    // stream the warning goes to (or that writes both to the same stream)
    // shows up here even though it's invisible to the unit-level tests.
    const out = tmpFile("cc2f-e2e.png");
    const { status, stdout, stderr } = spawnCli(["--project", GBC_SUBJECT_ROOT, "render", "CeruleanCave2F", "-o", out]);
    expect(status).toBe(0);
    const stderrLines = stderr.split("\n").filter((l) => l.length > 0);
    expect(stderrLines).toHaveLength(1);
    expect(stderrLines[0]).toMatch(/^warning: maps\/CeruleanCave2F\.blk:/);
    expect(stdout).not.toMatch(/warning:/);
    expect(stdout).toMatch(new RegExp(`^${out.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+x\\d+ outOfRange=\\d+ unmapped=\\d+\\n$`));
  }, 30_000);

  itWithGbcCorpus("query NoSuchMap against the real subject exits 1 with the loader's unknown-map message", () => {
    const { status, stdout, stderr } = spawnCli(["--project", GBC_SUBJECT_ROOT, "query", "NoSuchMap"]);
    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^pokemap: unknown map NoSuchMap; not listed in/);
  }, 30_000);

  // Fix round 1 (quality review Important #4 / spec Minor m2): `--scale` is
  // deliberately OMITTED here (an earlier version passed `--scale 32`
  // explicitly), so this is the one test that actually exercises `index.ts`'s
  // own GBC default-scale-8 resolution end to end through the real CLI --
  // `320x72`, not `1280x288`, is `40*8 x 9*8`; mutating the default to 4
  // would produce `160x36` instead and fail this.
  itWithGbcCorpus("render-world against the real subject, with no --scale, exits 0 using the GBC default of 8", () => {
    const out = tmpFile("e2e-world.png");
    const { status, stdout, stderr } = spawnCli([
      "--project", GBC_SUBJECT_ROOT, "render-world", "--bbox", "145,251,40,9", "-o", out,
    ]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(stdout).toMatch(/^.*e2e-world\.png 320x72 maps=2\n$/);
  }, 30_000);

  // Covers the deliverables list's required "sign list" case AND, in the
  // same test, every other GBA-only command (Task 10's mutation-check item
  // "remove one GBA-only refusal, e.g. paint, so it falls into the GBA
  // path") -- proving each one refuses BEFORE any GBA loader runs against
  // this GBC root, not just the one the deliverables list happens to name.
  // Kept as one `it` (the task's "3 tests only" budget for spawned e2e
  // tests), looping several spawns rather than adding more test cases.
  // render-world (Task 11) and encounters/where/coverage (Task 12) are
  // absent from this list: they are real GBC commands now, covered by their
  // own tests in this file plus packages/core/test/gbc/{world,render,analyse}/.
  itWithGbcCorpus("every GBA-only command refuses on the real gbc root with its own named message, never touching a GBA loader", () => {
    const cases: { name: string; args: string[] }[] = [
      // render-world is NOT in this list: Task 11 gives it a real GBC
      // implementation, tested separately below.
      { name: "validate", args: ["validate"] },
      { name: "sign suggest", args: ["sign", "suggest", "NewBarkTown"] },
      { name: "sign add", args: ["sign", "add", "NewBarkTown", "--species", "RATTATA", "--dialogue", "hi", "--x", "0", "--y", "0"] },
      { name: "sign list", args: ["sign", "list", "NewBarkTown"] },
      // paint/diff removed: Plan 7 Task 6 made them GBC commands.
    ];
    for (const { name, args } of cases) {
      const { status, stdout, stderr } = spawnCli(["--project", GBC_SUBJECT_ROOT, ...args]);
      expect(status, `${name}: expected exit 1`).toBe(1);
      expect(stdout, `${name}: expected no stdout`).toBe("");
      expect(stderr, `${name}: expected the named refusal`).toBe(
        `pokemap: ${name} is not supported for gbc (pokecrystal-family) projects yet\n`,
      );
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Plan 6 Task 12: the GBC encounter atlas CLI -- `encounters`/`where`/
// `coverage`. Kept in its own block (below every Task 10 test) so a merge
// with the parallel Task 11 worktree's own appends to this file stays
// mechanical.
// ---------------------------------------------------------------------------

describe("runGbcEncounters", () => {
  itWithGbcCorpus("Route29: human output groups by source header, rows sorted by percent, stderr carries the one real defect warning", () => {
    const { stdout, stderr } = runGbcEncounters(GBC_SUBJECT_ROOT, "Route29", {});
    expect(stderr).toMatch(/^warning: data\/wild\/kanto_grass\.asm:/);
    expect(stdout).toMatch(/^grass \(morn, rate 9\.8%\)\n/);
    expect(stdout).toMatch(/ {3}45\.0%  Lv 2-7  PIDGEY\n/);
    // headbutt section present, with its own header (no rate/bite tag).
    expect(stdout).toMatch(/^headbutt \(common\)$/m);
  });

  itWithGbcCorpus("--json prints exactly gbcEncounterSources's own output", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const expected = gbcEncounterSources(proj, "Route32");
    const { stdout } = runGbcEncounters(GBC_SUBJECT_ROOT, "Route32", { json: true });
    expect(JSON.parse(stdout)).toEqual(expected);
  });

  itWithGbcCorpus("a map with no encounter sources at all prints empty stdout, not an error", () => {
    // Finds a real "no encounter source" map at test time (266 exist per
    // gbcCoverage's mapsWithoutEncounters) rather than hand-naming one, so
    // this stays correct if the corpus's wild-data assignments ever change.
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const empty = proj.maps.find((m) => gbcEncounterSources(proj, m.name).length === 0);
    expect(empty).toBeDefined();
    const { stdout, stderr } = runGbcEncounters(GBC_SUBJECT_ROOT, empty!.name, {});
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^warning: data\/wild\/kanto_grass\.asm:/);
  });
});

describe("runGbcWhere", () => {
  itWithGbcCorpus("DUNSPARCE: one row per hit, mapName padded, sorted by percent descending", () => {
    const { stdout } = runGbcWhere(GBC_SUBJECT_ROOT, "DUNSPARCE", {});
    const lines = stdout.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^DarkCaveVioletEntrance\s+45\.0%  Lv 2-8  grass\/(morn|day|nite) swarm$/);
    const percents = lines.map((l) => Number(l.match(/(\d+\.\d)%/)![1]));
    expect(percents).toEqual([...percents].sort((a, b) => b - a));
  });

  itWithGbcCorpus("a species in no source prints the GBA-matching empty message", () => {
    const { stdout } = runGbcWhere(GBC_SUBJECT_ROOT, "MISSINGNO_DOES_NOT_EXIST", {});
    expect(stdout).toBe("MISSINGNO_DOES_NOT_EXIST appears in no encounter table\n");
  });

  // Fix round 1, spec review Minor #2/mutation M7: lower-case input must
  // resolve identically to upper-case -- an earlier version had no test
  // exercising this at all, so a dropped `.toUpperCase()` (or, after this
  // fix round, a dropped `normalizeGbcSpecies` call -- moved to
  // core/gbc/analyse/atlas.ts in Plan 6b Task 2) would have shipped silently.
  itWithGbcCorpus("accepts lower-case input, resolving identically to upper-case (M7)", () => {
    const lower = runGbcWhere(GBC_SUBJECT_ROOT, "dunsparce", {});
    const upper = runGbcWhere(GBC_SUBJECT_ROOT, "DUNSPARCE", {});
    expect(lower.stdout).toBe(upper.stdout);
    expect(lower.stdout.length).toBeGreaterThan(0);
  });

  // Fix round 1, spec review Minor #2: a "SPECIES_"-prefixed name (GBA's own
  // convention) also resolves, even though GBC wild data never carries that
  // prefix itself -- normalizeGbcSpecies (core/gbc/analyse/atlas.ts) strips
  // it before the lookup.
  itWithGbcCorpus("accepts a SPECIES_-prefixed name, resolving identically to the bare name", () => {
    const prefixed = runGbcWhere(GBC_SUBJECT_ROOT, "SPECIES_DUNSPARCE", {});
    const bare = runGbcWhere(GBC_SUBJECT_ROOT, "DUNSPARCE", {});
    expect(prefixed.stdout).toBe(bare.stdout);
    expect(prefixed.stdout.length).toBeGreaterThan(0);
  });

  itWithGbcCorpus("the empty-result message echoes the raw input as typed, not the normalized lookup key", () => {
    const { stdout } = runGbcWhere(GBC_SUBJECT_ROOT, "species_missingno", {});
    expect(stdout).toBe("species_missingno appears in no encounter table\n");
  });

  itWithGbcCorpus("--json prints exactly gbcWhereSpecies's own output", async () => {
    const { gbcWhereSpecies } = await import("@pokemap/core/src/gbc/analyse/atlas.js");
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const expected = gbcWhereSpecies(proj, "CHIKORITA");
    const { stdout } = runGbcWhere(GBC_SUBJECT_ROOT, "CHIKORITA", { json: true });
    expect(JSON.parse(stdout)).toEqual(expected);
  });
});

describe("runGbcCoverage", () => {
  itWithGbcCorpus("summary line, --empty and --unused each add one line per entry", () => {
    const bare = runGbcCoverage(GBC_SUBJECT_ROOT, {});
    expect(bare.stdout).toBe("125 maps with encounters, 266 without\n");

    const withEmpty = runGbcCoverage(GBC_SUBJECT_ROOT, { empty: true });
    expect(withEmpty.stdout.split("\n").filter((l) => l.length > 0)).toHaveLength(1 + 266);

    const withUnused = runGbcCoverage(GBC_SUBJECT_ROOT, { unused: true });
    // Fix round 1, spec review Issue 1: 69 -> 70 (unusedSpecies is now built
    // from generated sources, not raw table presence -- see atlas.test.ts).
    expect(withUnused.stdout.split("\n").filter((l) => l.length > 0)).toHaveLength(1 + 70);
  });

  itWithGbcCorpus("--json includes fishGroupWithoutWater and defects, which text mode never prints", () => {
    const { stdout } = runGbcCoverage(GBC_SUBJECT_ROOT, { json: true });
    const parsed = JSON.parse(stdout) as { fishGroupWithoutWater: string[]; defects: unknown[]; sourcesByMethod: Record<string, number> };
    expect(parsed.fishGroupWithoutWater).toHaveLength(319);
    expect(parsed.defects).toHaveLength(1);
    expect(parsed.sourcesByMethod.grass).toBeGreaterThan(0);
  });
});

describe("CLI end-to-end (spawned, generous timeout): Task 12", () => {
  itWithGbcCorpus("where DUNSPARCE against the real subject exits 0 and matches runGbcWhere's own output", () => {
    const { status, stdout, stderr } = spawnCli(["--project", GBC_SUBJECT_ROOT, "where", "DUNSPARCE"]);
    expect(status).toBe(0);
    expect(stderr).toMatch(/^warning: data\/wild\/kanto_grass\.asm:/);
    expect(stdout).toBe(runGbcWhere(GBC_SUBJECT_ROOT, "DUNSPARCE", {}).stdout);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Plan 7 Task 6: GBC write commands. Every test (dry run or not) runs on one
// shared temp copy of the subject, so a mutated dry run can never touch the
// real PerfPlus; `afterAll` asserts it stayed clean.
// ---------------------------------------------------------------------------
describe("GBC write commands (Plan 7 Task 6)", () => {
  // NOTE: tests share ONE mutable temp copy and run in file order (e.g. 9 relies on 6/7 having edited the asm; each re-reads its own `before`).
  const MAP = "NewBarkTown";
  let copy = "";
  const asm = (root = copy): string => readFileSync(`${root}/maps/${MAP}.asm`, "utf8");
  const blk = (root = copy): Buffer => readFileSync(`${root}/maps/${MAP}.blk`);
  // "" on any error (no config / wrong cwd) so collection never throws; test 10 then skips.
  const gbaRoot = ((): string => {
    try {
      return (JSON.parse(readFileSync("pokemap.config.json", "utf8")) as { projectPath: string }).projectPath ?? "";
    } catch {
      return "";
    }
  })();

  beforeAll(() => {
    if (hasGbcProject(GBC_SUBJECT_ROOT)) copy = copyGbcSubjectToTemp();
  }, 60_000);
  afterAll(() => {
    if (copy) removeTemp(copy);
    if (hasGbcProject(GBC_SUBJECT_ROOT)) {
      expect(execFileSync("git", ["-C", GBC_SUBJECT_ROOT, "status", "--porcelain"], { encoding: "utf8" })).toBe("");
    }
  });

  /** A metatile id that differs from `cur`, valid for NewBarkTown's tileset. */
  const other = (cur: number): number => (cur === 1 ? 2 : 1);
  const tilesetCap = (): number => {
    const proj = openGbcProject(copy);
    return proj.tileset(proj.map(MAP).tileset).metatiles.length;
  };
  /** Blocks of NewBarkTown (as laid out on disk in the copy). */
  const blocks = (): { metatileId: number }[] => {
    const proj = openGbcProject(copy);
    return proj.layout(proj.map(MAP)).layout.blocks.map((b) => ({ metatileId: b.metatileId }));
  };
  const differing = (a: { metatileId: number }[], b: { metatileId: number }[]): number => a.filter((v, i) => v.metatileId !== b[i]!.metatileId).length;
  const plural = (n: number): string => `${n} block${n === 1 ? "" : "s"} changed`;

  itWithGbcCorpus("1. paint pencil dry run: summary + dry-run line, .blk bytes unchanged", () => {
    const before = blk();
    const m = other(before[0]!);
    const { stdout } = runGbcPaint(copy, MAP, { tool: "pencil", x: 0, y: 0, metatile: m });
    expect(stdout).toContain("maps/NewBarkTown.blk -- 1 block changed");
    expect(stdout).toContain("(dry run -- not written; pass --yes to commit)");
    expect(blk().equals(before)).toBe(true);
  });

  itWithGbcCorpus("2. paint pencil --yes commits: stdout ends committed, exactly 1 byte differs at index 0", () => {
    const before = blk();
    const m = other(before[0]!);
    const { stdout } = runGbcPaint(copy, MAP, { tool: "pencil", x: 0, y: 0, metatile: m, yes: true });
    expect(stdout.trimEnd().endsWith("committed")).toBe(true);
    const after = blk();
    const diffs = [...after].map((v, i) => (v !== before[i] ? i : -1)).filter((i) => i >= 0);
    expect(diffs).toEqual([0]);
    expect(after[0]).toBe(m);
  });

  itWithGbcCorpus("3. rect and bucket: block counts AND changed byte indices match the Task 2 functions (off-diagonal, non-square, x != y seed)", () => {
    const { width: w, height: h } = openGbcProject(copy).map(MAP);
    const idx = (a: { metatileId: number }[], b: { metatileId: number }[]): number[] => a.flatMap((v, i) => (v.metatileId !== b[i]!.metatileId ? [i] : []));
    const changedBytes = (before: Buffer, after: Buffer): number[] => [...after].flatMap((v, i) => (v !== before[i] ? [i] : []));

    // rect: corners (1,0)-(3,1) given in reverse order -> 3x2, off the diagonal; commit it and compare byte indices.
    let cur = blocks();
    const rectTargets = [1, 2, 3].flatMap((x) => [0, 1].map((y) => ({ x, y })));
    const used = new Set(rectTargets.map((t) => cur[t.y * w + t.x]!.metatileId));
    let m = 1;
    while (used.has(m)) m++;
    const stamp = { width: 1, height: 1, cells: [{ metatileId: m }] };
    const rectIdx = idx(cur, paintGbcCells(cur, w, h, rectTargets, stamp, 1, 0));
    expect(rectIdx).toHaveLength(6);
    const rectDry = runGbcPaint(copy, MAP, { tool: "rect", x: 3, y: 1, x1: 1, y1: 0, metatile: m });
    expect(rectDry.stdout).toContain(`maps/NewBarkTown.blk -- ${plural(rectIdx.length)}`);
    let before = blk();
    runGbcPaint(copy, MAP, { tool: "rect", x: 3, y: 1, x1: 1, y1: 0, metatile: m, yes: true });
    expect(changedBytes(before, blk())).toEqual(rectIdx);

    // bucket: a seed with x != y and a real region; commit and compare byte indices.
    cur = blocks();
    let sx = 0, sy = 0, bm = 1, best = 0;
    for (let i = 0; i < cur.length; i++) {
      if (i % w === Math.floor(i / w)) continue;
      const id = other(cur[i]!.metatileId);
      const n = idx(cur, gbcFloodFill(cur, w, h, i % w, Math.floor(i / w), id)).length;
      if (n > best) { best = n; sx = i % w; sy = Math.floor(i / w); bm = id; }
    }
    expect(best).toBeGreaterThan(1);
    const bucketIdx = idx(cur, gbcFloodFill(cur, w, h, sx, sy, bm));
    expect(runGbcPaint(copy, MAP, { tool: "bucket", x: sx, y: sy, metatile: bm }).stdout).toContain(`maps/NewBarkTown.blk -- ${plural(bucketIdx.length)}`);
    before = blk();
    runGbcPaint(copy, MAP, { tool: "bucket", x: sx, y: sy, metatile: bm, yes: true });
    expect(changedBytes(before, blk())).toEqual(bucketIdx);
  });

  itWithGbcCorpus("4. refusals: out-of-range metatile throws and writes nothing; non-writable layout throws and warns", () => {
    const before = blk();
    const cap = tilesetCap();
    expect(() => runGbcPaint(copy, MAP, { tool: "pencil", x: 0, y: 0, metatile: cap, yes: true })).toThrow(/metatile-out-of-range \(maps\/NewBarkTown\.blk\): /);
    expect(blk().equals(before)).toBe(true);
    expect(runGbcPaint(copy, MAP, { tool: "pencil", x: 0, y: 0, metatile: cap }).stdout).toContain("REFUSED [metatile-out-of-range]");

    const cc = "CeruleanCave2F";
    const ccBlk = readFileSync(`${copy}/maps/${cc}.blk`);
    const dry = runGbcPaint(copy, cc, { tool: "pencil", x: 0, y: 0, metatile: other(ccBlk[0]!) });
    expect(dry.stderr).toMatch(/^warning: /);
    expect(() => runGbcPaint(copy, cc, { tool: "pencil", x: 0, y: 0, metatile: other(ccBlk[0]!), yes: true })).toThrow(/layout-not-writable \(maps\/CeruleanCave2F\.blk\): /);
    expect(readFileSync(`${copy}/maps/${cc}.blk`).equals(ccBlk)).toBe(true);
  });

  itWithGbcCorpus("5. diff never writes, even when handed yes: true", () => {
    const before = blk();
    const m = other(before[0]!);
    const { stdout } = runGbcDiff(copy, MAP, { tool: "pencil", x: 0, y: 0, metatile: m, yes: true } as never);
    expect(stdout).toContain("maps/NewBarkTown.blk -- 1 block changed");
    expect(stdout).not.toContain("committed");
    expect(blk().equals(before)).toBe(true);
  });

  itWithGbcCorpus("6. event move warp 0 --yes rewrites exactly that line, same as moveGbcEvent", () => {
    const before = asm();
    const { stdout } = runGbcEventMove(copy, MAP, { kind: "warp", index: 0, x: 12, y: 4, yes: true });
    expect(stdout.trimEnd().endsWith("committed")).toBe(true);
    const after = asm();
    expect(after).toContain("\twarp_event  12,  4, ELMS_LAB, 1");
    expect(after).toBe(moveGbcEvent(before, MAP, "warp", 0, 12, 4).text);
    const a = before.split("\n"), b = after.split("\n");
    expect(b).toHaveLength(a.length);
    expect(b.filter((l, i) => l !== a[i])).toHaveLength(1);
  });

  itWithGbcCorpus("7. event add bg: dry run names the asm, --yes writes addGbcEvent's output", () => {
    const before = asm();
    const args = "1, 2, BGEVENT_READ, NewBarkTownSign";
    const dry = runGbcEventAdd(copy, MAP, { kind: "bg", args });
    expect(dry.stdout).toContain("maps/NewBarkTown.asm -- event block edited");
    expect(asm()).toBe(before);
    runGbcEventAdd(copy, MAP, { kind: "bg", args, yes: true });
    expect(asm()).toBe(addGbcEvent(before, MAP, "bg", args.split(", ")).text);
  });

  itWithGbcCorpus("8. bad input refuses with a named error and writes nothing", () => {
    const before = asm();
    const objArgs = "5, 5, SPRITE_FISHER, SPRITEMOVEDATA_STANDING_DOWN, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, NewBarkTownFisherScript, -1";
    const cases: [() => unknown, RegExp][] = [
      [() => runGbcEventAdd(copy, MAP, { kind: "object", args: objArgs, const: "lower_case", yes: true }), /objectConst "lower_case" must match/],
      [() => runGbcEventAdd(copy, MAP, { kind: "warp", args: "1, 1, NOT_A_MAP, 1", yes: true }), /not a known map const/],
      [() => runGbcEventDelete(copy, MAP, { kind: "object", index: 0, yes: true }), /const NEWBARKTOWN_TEACHER is still referenced/],
      [() => runGbcEventMove(copy, MAP, { kind: "warp", index: 1.5, x: 1, y: 1, yes: true }), /--index must be an integer, got 1\.5/],
      [() => runGbcEventMove(copy, MAP, { kind: "warp", index: Number("abc"), x: 1, y: 1, yes: true }), /--index must be an integer, got NaN/],
      [() => runGbcEventMove(copy, MAP, { kind: "foo", index: 0, x: 1, y: 1, yes: true }), /--kind must be one of warp, coord, bg, object, got foo/],
      [() => runGbcEventAdd(copy, MAP, { kind: "bg", args: "1, 2, BGEVENT_READ, X", const: "FOO", yes: true }), /--const only applies to --kind object/],
      [() => runGbcPaint(copy, MAP, { tool: "pencil", x: Number("abc"), y: 0, metatile: 1, yes: true }), /--x must be an integer, got NaN/],
      [() => runGbcPaint(copy, MAP, { tool: "spray", x: 0, y: 0, metatile: 1, yes: true }), /--tool must be one of pencil, rect, bucket, got spray/],
    ];
    for (const [fn, re] of cases) expect(fn).toThrow(re);
    expect(asm()).toBe(before);
  });

  itWithGbcCorpus("9. event delete warp: one stderr warning per retarget hit, equals an independent scan (incl. a self-map hit)", () => {
    // A warp on NewBarkTown pointing back at itself, so the deleting map's own pre-delete warps matter.
    runGbcEventAdd(copy, MAP, { kind: "warp", args: "2, 2, NEW_BARK_TOWN, 2", yes: true });
    const proj = openGbcProject(copy);
    const me = proj.map(MAP);
    const expected: string[] = [];
    for (const m of proj.maps) {
      parseMapEvents(readFileSync(`${copy}/maps/${m.name}.asm`, "utf8"), m.name).warps.forEach((w, i) => {
        if (m.name === MAP && i === 0) return;
        if (w.mapConst === me.constName && w.destWarp >= 1) expected.push(`warning: ${m.name} warp[${i}] -> ${me.constName} ${w.destWarp} will be retargeted`);
      });
    }
    const before = asm();
    const dry = runGbcEventDelete(copy, MAP, { kind: "warp", index: 0 });
    const lines = dry.stderr.split("\n").filter((l) => l.startsWith("warning: "));
    expect(lines).toEqual(expected);
    expect(lines).toContain("warning: ElmsLab warp[0] -> NEW_BARK_TOWN 1 will be retargeted");
    expect(lines.some((l) => l.startsWith("warning: NewBarkTown warp["))).toBe(true);
    expect(asm()).toBe(before);
    // and on commit too
    const committed = runGbcEventDelete(copy, MAP, { kind: "warp", index: 0, yes: true });
    expect(committed.stderr.split("\n").filter((l) => l.startsWith("warning: "))).toEqual(expected);
  }, 60_000);

  itWithGbcCorpus("11. real process: --yes paint changes the copy; --metatile abc exits 1 with 'pokemap: '", () => {
    const before = blk();
    const m = other(before[1]!);
    const ok = spawnCli(["--project", copy, "paint", MAP, "--tool", "pencil", "--x", "1", "--y", "0", "--metatile", String(m), "--yes"]);
    expect(ok.status).toBe(0);
    expect(blk()[1]).toBe(m);
    const bad = spawnCli(["--project", copy, "paint", MAP, "--tool", "pencil", "--x", "1", "--y", "0", "--metatile", "abc", "--yes"]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/^pokemap: --metatile must be an integer/);
  }, 60_000);

  itWithGbcCorpus("12. real process, dry-run defaults: paint/diff/event add without --yes never write; --yes event add does", () => {
    const m = other(blk()[2]!);
    const paintArgs = ["paint", MAP, "--tool", "pencil", "--x", "2", "--y", "0", "--metatile", String(m)];
    const b0 = blk();
    const dryPaint = spawnCli(["--project", copy, ...paintArgs]);
    expect(dryPaint.status).toBe(0);
    expect(dryPaint.stdout).toContain("(dry run -- not written; pass --yes to commit)");
    expect(blk().equals(b0)).toBe(true);

    const diff = spawnCli(["--project", copy, "diff", MAP, "--tool", "pencil", "--x", "2", "--y", "0", "--metatile", String(m)]);
    expect(diff.status).toBe(0);
    expect(diff.stdout).toContain("maps/NewBarkTown.blk -- 1 block changed");
    expect(diff.stdout).not.toContain("committed");
    expect(blk().equals(b0)).toBe(true);

    const a0 = asm();
    const addArgs = ["event", "add", MAP, "--kind", "bg", "--args", "4, 4, BGEVENT_READ, NewBarkTownSign"];
    const dryAdd = spawnCli(["--project", copy, ...addArgs]);
    expect(dryAdd.status).toBe(0);
    expect(dryAdd.stdout).toContain("(dry run -- not written; pass --yes to commit)");
    expect(asm()).toBe(a0);
    expect(spawnCli(["--project", copy, ...addArgs, "--yes"]).status).toBe(0);
    expect(asm()).not.toBe(a0);
  }, 90_000);

  itWithGbcCorpus("13. real process, CeruleanCave2F: dry run warns on stderr; --yes refusal keeps the size warning in stderr", () => {
    const cc = "CeruleanCave2F";
    const ccBlk = readFileSync(`${copy}/maps/${cc}.blk`);
    const args = ["--project", copy, "paint", cc, "--tool", "pencil", "--x", "0", "--y", "0", "--metatile", String(other(ccBlk[0]!))];
    const dry = spawnCli(args);
    expect(dry.status).toBe(0);
    expect(dry.stderr).toMatch(/^warning: /m);
    const yes = spawnCli([...args, "--yes"]);
    expect(yes.status).toBe(1);
    expect(yes.stderr).toContain("layout-not-writable");
    expect(yes.stderr).toMatch(/^warning: /m);
    expect(readFileSync(`${copy}/maps/${cc}.blk`).equals(ccBlk)).toBe(true);
  }, 60_000);

  it.skipIf(!existsSync(gbaRoot))("10. event on a GBA root refuses (GBC-only)", () => {
    const r = spawnCli(["--project", gbaRoot, "event", "move", "Route101", "--kind", "warp", "--index", "0", "--x", "1", "--y", "1"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toBe("pokemap: event move is not supported for gba projects (GBC-only today)\n");
  }, 30_000);
});
