import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../../core/test/gbc/helpers/corpus.js";
import { createPokemapServer } from "../src/server.js";

// Read-only tools only: the subjects are never written (test roots are scratch
// copies via globalSetup; render tools write into a private temp dir).
const outDir = mkdtempSync(join(tmpdir(), "pokemap-mcp-test-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

async function connect(project: string): Promise<Client> {
  const server = createPokemapServer({ project, outDir });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(a);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const content = r.content as { type: string; text: string }[];
  return { isError: !!r.isError, text: content.map((c) => c.text).join("\n") };
}

const READ_TOOLS = [
  "pokemap_render", "pokemap_render_world", "pokemap_map_info", "pokemap_validate", "pokemap_encounters",
  "pokemap_where", "pokemap_coverage", "pokemap_indicator_suggest", "pokemap_indicator_list", "pokemap_diff",
];

describe("tool list", () => {
  let client: Client;
  beforeAll(async () => { client = await connect(SUBJECT_ROOT); });

  it("exposes exactly the read tools and no write tool", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...READ_TOOLS].sort());
  });
});

describe("GBA", () => {
  let client: Client;
  beforeAll(async () => { client = await connect(SUBJECT_ROOT); });

  itWithCorpus("map_info returns the header, split and layout", async () => {
    const r = await call(client, "pokemap_map_info", { map: "PetalburgCity" });
    expect(r.isError).toBe(false);
    const j = JSON.parse(r.text);
    expect(j.split).toEqual({ version: "emerald", tiles: 512, metatiles: 512, pals: 6 });
    expect(j.layout.name).toBe("PetalburgCity_Layout");
    expect(Object.keys(j.events)).toEqual(["object", "warp", "coord", "bg"]);
  });

  itWithCorpus("map_info section narrows the output", async () => {
    const j = JSON.parse((await call(client, "pokemap_map_info", { map: "PetalburgCity", section: "connections" })).text);
    expect(Object.keys(j)).toEqual(["connections"]);
  });

  itWithCorpus("render writes a PNG and reports its size", async () => {
    const r = await call(client, "pokemap_render", { target: "PetalburgCity" });
    expect(r.isError).toBe(false);
    const m = /^(.+\.png) (\d+)x(\d+) outOfRange=\d+/.exec(r.text.trim());
    expect(m).not.toBeNull();
    expect(readFileSync(m![1]!).subarray(1, 4).toString()).toBe("PNG");
  });

  itWithCorpus("render_world writes a PNG for a bbox", async () => {
    const r = await call(client, "pokemap_render_world", { x: 0, y: 0, w: 40, h: 30, scale: 2 });
    expect(r.isError).toBe(false);
    const m = /^(.+\.png) 80x60 maps=\d+/.exec(r.text.trim());
    expect(m).not.toBeNull();
    expect(existsSync(m![1]!)).toBe(true);
  });

  itWithCorpus("encounters, where and coverage return JSON", async () => {
    const enc = JSON.parse((await call(client, "pokemap_encounters", { map: "Route101" })).text);
    expect(Object.keys(enc).length).toBeGreaterThan(0);
    const total = (enc.land_mons as { percent: number }[]).reduce((s, c) => s + c.percent, 0);
    expect(total).toBeCloseTo(100, 5);
    const where = JSON.parse((await call(client, "pokemap_where", { species: "ZIGZAGOON" })).text);
    expect(where.some((h: { mapName?: string }) => h.mapName === "Route101")).toBe(true);
    const cov = JSON.parse((await call(client, "pokemap_coverage")).text);
    expect(cov.mapsWithEncounters).toBeGreaterThan(0);
  });

  itWithCorpus("validate returns the findings array even when it exits non-zero", async () => {
    const r = await call(client, "pokemap_validate", { check: "palette-range" });
    expect(r.isError).toBe(false);
    expect(Array.isArray(JSON.parse(r.text))).toBe(true);
  }, 120_000); // scans every layout

  itWithCorpus("indicator_suggest and indicator_list answer for a GBA map", async () => {
    const s = await call(client, "pokemap_indicator_suggest", { map: "Route101" });
    expect(s.isError).toBe(false);
    expect(s.text).toMatch(/suggested placement|no tall grass/);
    const l = await call(client, "pokemap_indicator_list", { map: "Route101" });
    expect(l.isError).toBe(false);
    expect(l.text.length).toBeGreaterThan(0);
  });

  itWithCorpus("diff returns a dry-run plan and never writes", async () => {
    const before = readFileSync(join(SUBJECT_ROOT, "data/maps/PetalburgCity/map.json"), "utf8");
    const r = await call(client, "pokemap_diff", { map: "PetalburgCity", tool: "pencil", x: 1, y: 1, metatile: 1 });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/dry run|diff|map.bin|blockdata/i);
    expect(readFileSync(join(SUBJECT_ROOT, "data/maps/PetalburgCity/map.json"), "utf8")).toBe(before);
  });

  itWithCorpus("a bad map name is an error carrying the CLI's own message", async () => {
    const r = await call(client, "pokemap_map_info", { map: "NoSuchPlace" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/NoSuchPlace/);
  });
});

describe("GBC", () => {
  let client: Client;
  beforeAll(async () => { client = await connect(GBC_SUBJECT_ROOT); });

  itWithGbcCorpus("map_info and render work", async () => {
    const j = JSON.parse((await call(client, "pokemap_map_info", { map: "NewBarkTown" })).text);
    expect(j).toBeTypeOf("object");
    const r = await call(client, "pokemap_render", { target: "NewBarkTown", time: "nite" });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/\.png/);
  });

  itWithGbcCorpus("render_world, encounters and coverage work", async () => {
    expect((await call(client, "pokemap_render_world", { x: 0, y: 0, w: 10, h: 10 })).isError).toBe(false);
    expect((await call(client, "pokemap_encounters", { map: "Route29" })).isError).toBe(false);
    expect((await call(client, "pokemap_coverage")).isError).toBe(false);
  });

  itWithGbcCorpus("GBA-only tools refuse naming the family", async () => {
    for (const [name, args] of [["pokemap_validate", {}], ["pokemap_indicator_list", { map: "NewBarkTown" }], ["pokemap_indicator_suggest", { map: "NewBarkTown" }]] as const) {
      const r = await call(client, name, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/not supported for gbc/);
    }
  });
});
