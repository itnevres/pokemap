import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { unfilterScanlines } from "@pokemap/core/src/load/png.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap } from "@pokemap/core/src/gbc/render/map.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../../core/test/gbc/helpers/corpus.js";
import { runGbcRender, runGbcQuery } from "../src/gbcCommands.js";

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

function tmpFile(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "pokemap-gbc-cli-")), name);
}

const CLI_ENTRY = "packages/cli/src/index.ts";
const REPO_ROOT = process.cwd();

/** Spawns the real CLI (`npx tsx packages/cli/src/index.ts ...`), from the
 *  repo root, exactly the invocation the task's own live-verify uses. Never
 *  throws on a non-zero exit -- callers assert `status`/`stdout`/`stderr`
 *  themselves, the same way a shell script would. */
function spawnCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI_ENTRY, ...args], { cwd: REPO_ROOT, encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status: number | null; stdout: string; stderr: string };
    return { status: err.status ?? 1, stdout: err.stdout, stderr: err.stderr };
  }
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
    expect(Buffer.from(decoded1.data)).toEqual(Buffer.from(expected.data));

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

  itWithGbcCorpus("query NoSuchMap against the real subject exits 1 with the loader's unknown-map message", () => {
    const { status, stdout, stderr } = spawnCli(["--project", GBC_SUBJECT_ROOT, "query", "NoSuchMap"]);
    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^pokemap: unknown map NoSuchMap; not listed in/);
  }, 30_000);

  // Covers the deliverables list's required "sign list" case AND, in the
  // same test, every other GBA-only command (Task 10's mutation-check item
  // "remove one GBA-only refusal, e.g. paint, so it falls into the GBA
  // path") -- proving each one refuses BEFORE any GBA loader runs against
  // this GBC root, not just the one the deliverables list happens to name.
  // Kept as one `it` (the task's "3 tests only" budget for spawned e2e
  // tests), looping several spawns rather than adding more test cases.
  itWithGbcCorpus("every GBA-only command refuses on the real gbc root with its own named message, never touching a GBA loader", () => {
    const cases: { name: string; args: string[] }[] = [
      { name: "render-world", args: ["render-world", "--bbox", "0,0,1,1"] },
      { name: "validate", args: ["validate"] },
      { name: "encounters", args: ["encounters", "NewBarkTown"] },
      { name: "where", args: ["where", "RATTATA"] },
      { name: "coverage", args: ["coverage"] },
      { name: "sign suggest", args: ["sign", "suggest", "NewBarkTown"] },
      { name: "sign add", args: ["sign", "add", "NewBarkTown", "--species", "RATTATA", "--dialogue", "hi", "--x", "0", "--y", "0"] },
      { name: "sign list", args: ["sign", "list", "NewBarkTown"] },
      { name: "paint", args: ["paint", "NewBarkTown", "--tool", "pencil", "--x", "0", "--y", "0", "--metatile", "1"] },
      { name: "diff", args: ["diff", "NewBarkTown", "--tool", "pencil", "--x", "0", "--y", "0", "--metatile", "1"] },
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
