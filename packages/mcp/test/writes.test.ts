import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { GBC_SUBJECT_ROOT, copyGbcSubjectToTemp, itWithGbcCorpus, removeTemp } from "../../core/test/gbc/helpers/corpus.js";
import { createPokemapServer, hubRunning } from "../src/server.js";

// Write tools run only on scratch copies (never a real subject): the GBA copy
// is a fresh cpSync of the test-roots scratch subject, the GBC copy comes from
// copyGbcSubjectToTemp. A fake hub on 5174 proves the refusal; if something
// real already owns the port the write cases skip with a message.

async function connect(project: string, allowWrites: boolean): Promise<Client> {
  const server = createPokemapServer({ project, allowWrites });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(a);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const content = r.content as { type: string; text?: string }[];
  return { isError: !!r.isError, text: content.filter((c) => c.type === "text").map((c) => c.text).join("\n") };
}

const WRITE_TOOLS = ["pokemap_paint", "pokemap_indicator_add", "pokemap_event_move", "pokemap_event_add", "pokemap_event_delete"];
const names = async (c: Client) => (await c.listTools()).tools.map((t) => t.name);

let portBusy = false;
beforeAll(async () => { portBusy = await hubRunning(); if (portBusy) console.warn("pokemap mcp writes test: something answers on 127.0.0.1:5174 (a real PokeMap?); write cases are skipped"); });
const needFreePort = (ctx: { skip: () => unknown }) => { if (portBusy) ctx.skip(); };

async function fakeHub(): Promise<Server | null> {
  const s = createServer((_q, res) => { res.end("{}"); });
  return new Promise((resolve) => {
    s.once("error", () => resolve(null));
    s.listen(5174, "127.0.0.1", () => resolve(s));
  });
}

describe("registration", () => {
  it("lists the write tools only with allowWrites", async () => {
    const off = await names(await connect(SUBJECT_ROOT, false));
    for (const t of WRITE_TOOLS) expect(off).not.toContain(t);
    const on = await names(await connect(SUBJECT_ROOT, true));
    for (const t of WRITE_TOOLS) expect(on).toContain(t);
  });

  it("refuses a dash-leading argument before the CLI runs", async () => {
    const c = await connect(SUBJECT_ROOT, true);
    for (const [name, args] of [
      ["pokemap_paint", { map: "--help", tool: "pencil", x: 0, y: 0, metatile: 1 }],
      ["pokemap_indicator_add", { map: "Route35", species: "-x", text: "t", x: 0, y: 0 }],
      ["pokemap_indicator_add", { map: "Route35", species: "RATTATA", text: "--yes", x: 0, y: 0 }],
      ["pokemap_event_move", { map: "--help", kind: "warp", index: 0, x: 1, y: 1 }],
      ["pokemap_event_add", { map: "NewBarkTown", kind: "bg", args: "--yes" }],
      ["pokemap_event_add", { map: "NewBarkTown", kind: "object", args: "1", const: "-X" }],
      ["pokemap_event_delete", { map: "--help", kind: "warp", index: 0 }],
    ] as const) {
      const r = await call(c, name, args);
      expect(r.isError, name).toBe(true);
      expect(r.text, name).toMatch(/must not start with "-"/);
    }
  });
});

describe("hub running refuses every write tool", () => {
  let hub: Server | null = null;
  let gba = "", gbc = "";
  beforeAll(async () => {
    hub = await fakeHub();
    if (!hub) return;
    gba = mkdtempSync(join(tmpdir(), "pokemap-mcp-w-"));
    cpSync(SUBJECT_ROOT, gba, { recursive: true });
    gbc = copyGbcSubjectToTemp();
  }, 120_000);
  afterAll(async () => {
    await new Promise((r) => (hub ? hub.close(() => r(null)) : r(null)));
    if (gba) rmSync(gba, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    if (gbc) removeTemp(gbc);
  });

  const calls: [string, "gba" | "gbc", Record<string, unknown>, string][] = [
    ["pokemap_paint", "gba", { map: "Route35", tool: "pencil", x: 1, y: 1, metatile: 1 }, "data/layouts/Route35/map.bin"],
    ["pokemap_indicator_add", "gba", { map: "Route35", species: "RATTATA", text: "Skreee!", x: 1, y: 1 }, "data/maps/Route35/map.json"],
    ["pokemap_event_move", "gbc", { map: "NewBarkTown", kind: "warp", index: 0, x: 12, y: 4 }, "maps/NewBarkTown.asm"],
    ["pokemap_event_add", "gbc", { map: "NewBarkTown", kind: "bg", args: "1, 2, BGEVENT_READ, NewBarkTownSign" }, "maps/NewBarkTown.asm"],
    ["pokemap_event_delete", "gbc", { map: "NewBarkTown", kind: "bg", index: 0 }, "maps/NewBarkTown.asm"],
  ];
  for (const [tool, fam, args, file] of calls) {
    it(`${tool} refuses and leaves ${file} unchanged`, async (ctx) => {
      if (!hub) { console.warn("port 5174 is taken; fake hub could not start, case skipped"); ctx.skip(); }
      const root = fam === "gba" ? gba : gbc;
      const before = readFileSync(join(root, file));
      const r = await call(await connect(root, true), tool, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/PokeMap is running.*close PokeMap/i);
      expect(readFileSync(join(root, file)).equals(before)).toBe(true);
    }, 30_000);
  }

  it("a dry run does not need the hub to be closed and writes nothing", async (ctx) => {
    if (!hub) { console.warn("port 5174 is taken; fake hub could not start, case skipped"); ctx.skip(); }
    const file = join(gba, "data/layouts/Route35/map.bin");
    const before = readFileSync(file);
    const r = await call(await connect(gba, true), "pokemap_paint", { map: "Route35", tool: "pencil", x: 1, y: 1, metatile: 1, dry_run: true });
    expect(r.isError).toBe(false);
    expect(readFileSync(file).equals(before)).toBe(true);
  }, 30_000);
});

describe("GBA writes (scratch copy)", () => {
  let root = "";
  let client: Client;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "pokemap-mcp-w-"));
    cpSync(SUBJECT_ROOT, root, { recursive: true });
    client = await connect(root, true);
  }, 120_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

  itWithCorpus("paint writes exactly one block and returns the plan", async (ctx) => {
    needFreePort(ctx);
    const file = join(root, "data/layouts/Route35/map.bin");
    const before = readFileSync(file);
    const off = (1 * 40 + 3) * 2; // x=3, y=1: asymmetric so a swapped x/y mapping fails
    const metatile = ((before.readUInt16LE(off) & 0x3ff) + 1) % 512;
    const r = await call(client, "pokemap_paint", { map: "Route35", tool: "pencil", x: 3, y: 1, metatile });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/committed|saved|wrote/i);
    const after = readFileSync(file);
    expect(after.length).toBe(before.length);
    const diff = [...after.keys()].filter((i) => after[i] !== before[i]);
    expect(diff.every((i) => i === off || i === off + 1)).toBe(true);
    expect(after.readUInt16LE(off) & 0x3ff).toBe(metatile);
  }, 60_000);

  itWithCorpus("paint dry_run returns the plan and writes nothing", async () => {
    const file = join(root, "data/layouts/Route35/map.bin");
    const before = readFileSync(file);
    const r = await call(client, "pokemap_paint", { map: "Route35", tool: "pencil", x: 3, y: 3, metatile: 2, dry_run: true });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/dry.?run|--yes|not written/i);
    expect(readFileSync(file).equals(before)).toBe(true);
  }, 60_000);

  itWithCorpus("indicator_add writes the map's object event and script", async (ctx) => {
    needFreePort(ctx);
    const scripts = join(root, "data/maps/Route35/scripts.inc"), json = join(root, "data/maps/Route35/map.json");
    const [s0, j0] = [readFileSync(scripts, "utf8"), readFileSync(json, "utf8")];
    const r = await call(client, "pokemap_indicator_add", { map: "Route35", species: "RATTATA", text: "RATTATA: Skreee!", x: 1, y: 1, elevation: 3 });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/committed|saved|wrote/i);
    expect(readFileSync(scripts, "utf8")).not.toBe(s0);
    expect(readFileSync(scripts, "utf8")).toMatch(/PokemonIndicator/);
    expect(readFileSync(json, "utf8")).not.toBe(j0);
  }, 60_000);

  itWithCorpus("GBC-only write tools refuse naming the family on a GBA project", async () => {
    const r = await call(client, "pokemap_event_move", { map: "Route35", kind: "warp", index: 0, x: 1, y: 1, dry_run: true });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not supported for gba/);
  });
});

describe("GBC writes (scratch copy)", () => {
  let root = "";
  let client: Client;
  const MAP = "NewBarkTown";
  const asm = () => readFileSync(join(root, `maps/${MAP}.asm`), "utf8");
  beforeAll(async () => {
    root = copyGbcSubjectToTemp();
    client = await connect(root, true);
  }, 120_000);
  afterAll(() => { if (root) removeTemp(root); });

  itWithGbcCorpus("paint changes exactly the one block", async (ctx) => {
    needFreePort(ctx);
    const file = join(root, `maps/${MAP}.blk`);
    const before = readFileSync(file);
    const m = before[2] === 1 ? 2 : 1;
    const r = await call(client, "pokemap_paint", { map: MAP, tool: "pencil", x: 2, y: 0, metatile: m });
    expect(r.isError).toBe(false);
    const expected = Buffer.from(before);
    expected[2] = m; // block (2,0): asymmetric so a swapped x/y mapping fails
    expect(readFileSync(file).equals(expected)).toBe(true);
  }, 60_000);

  itWithGbcCorpus("event_move rewrites exactly the one warp line", async (ctx) => {
    needFreePort(ctx);
    const before = asm();
    const r = await call(client, "pokemap_event_move", { map: MAP, kind: "warp", index: 0, x: 12, y: 4 });
    expect(r.isError).toBe(false);
    const a = before.split("\n"), b = asm().split("\n");
    expect(b).toHaveLength(a.length);
    expect(b.filter((l, i) => l !== a[i])).toEqual(["\twarp_event  12,  4, ELMS_LAB, 1"]);
  }, 60_000);

  itWithGbcCorpus("event_add then event_delete round-trips the asm", async (ctx) => {
    needFreePort(ctx);
    const before = asm();
    const add = await call(client, "pokemap_event_add", { map: MAP, kind: "bg", args: "1, 2, BGEVENT_READ, NewBarkTownSign" });
    expect(add.isError).toBe(false);
    expect(asm()).not.toBe(before);
    expect(asm()).toMatch(/bg_event\s+1,\s+2, BGEVENT_READ, NewBarkTownSign/);
    const del = await call(client, "pokemap_event_delete", { map: MAP, kind: "bg", index: 4 });
    expect(del.isError).toBe(false);
    expect(asm()).toBe(before);
  }, 60_000);

  itWithGbcCorpus("a CLI refusal comes back verbatim and writes nothing", async (ctx) => {
    needFreePort(ctx);
    const before = asm();
    const r = await call(client, "pokemap_event_add", { map: MAP, kind: "warp", args: "1, 1, NOT_A_MAP, 1" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not a known map const/);
    expect(asm()).toBe(before);
  }, 60_000);

  itWithGbcCorpus("the real GBC subject is not the scratch root", () => {
    expect(root).not.toBe(GBC_SUBJECT_ROOT);
  });
});
