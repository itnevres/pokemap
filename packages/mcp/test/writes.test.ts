import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer, type AddressInfo, type Server as NetServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SUBJECT_ROOT, itWithCorpus } from "../../core/test/helpers/corpus.js";
import { GBC_SUBJECT_ROOT, copyGbcSubjectToTemp, itWithGbcCorpus, removeTemp } from "../../core/test/gbc/helpers/corpus.js";
import { createPokemapServer, hubRunning, type HubAddress } from "../src/server.js";

// Write tools run only on scratch copies (never a real subject): the GBA copy
// is a fresh cpSync of the test-roots scratch subject, the GBC copy comes from
// copyGbcSubjectToTemp. The hub address is injected, so no case depends on the
// real port 5174 or on PokeMap being open: "no hub" is a closed ephemeral port,
// "hub up" is a fake listener on an ephemeral port.

let closed: HubAddress = { host: "127.0.0.1", port: 1 };
beforeAll(async () => {
  const s = createNetServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  closed = { host: "127.0.0.1", port: (s.address() as AddressInfo).port };
  await new Promise((r) => s.close(r));
});

async function connect(project: string, allowWrites: boolean, hub: HubAddress = closed): Promise<Client> {
  const server = createPokemapServer({ project, allowWrites, hubAddress: hub });
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

/** A listener on an ephemeral port: answering HTTP, or accepting and never answering. */
async function listener(kind: "http" | "silent"): Promise<{ addr: HubAddress; close: () => Promise<void>; server: NetServer }> {
  const sockets = new Set<Socket>();
  const server: NetServer = kind === "http" ? (createServer((_q, res) => { res.end("{}"); }) as unknown as NetServer) : createNetServer((sock) => { sockets.add(sock); sock.on("error", () => {}); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { addr: { host: "127.0.0.1", port: (server.address() as AddressInfo).port }, server, close: () => new Promise((r) => { for (const x of sockets) x.destroy(); (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); server.close(() => r(undefined)); }) };
}

describe("registration", () => {
  it("always lists the write tools; without allowWrites each refuses naming --allow-writes and writes nothing", async () => {
    const off = await connect(SUBJECT_ROOT, false);
    const listed = await names(off);
    for (const t of WRITE_TOOLS) expect(listed).toContain(t);
    expect(await names(await connect(SUBJECT_ROOT, true))).toEqual(listed);
    const calls: [string, Record<string, unknown>][] = [
      ["pokemap_paint", { map: "Route35", tool: "pencil", x: 1, y: 1, metatile: 1 }],
      ["pokemap_indicator_add", { map: "Route35", species: "RATTATA", text: "t", x: 1, y: 1 }],
      ["pokemap_event_move", { map: "NewBarkTown", kind: "warp", index: 0, x: 1, y: 1 }],
      ["pokemap_event_add", { map: "NewBarkTown", kind: "bg", args: "1, 2, BGEVENT_READ, X" }],
      ["pokemap_event_delete", { map: "NewBarkTown", kind: "bg", index: 0 }],
    ];
    for (const [name, args] of calls) {
      for (const dry of [false, true]) {
        const r = await call(off, name, { ...args, dry_run: dry });
        expect(r.isError, name).toBe(true);
        expect(r.text, name).toMatch(/--allow-writes/);
      }
    }
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
      const r = await call(c, name, { ...args, dry_run: true }); // dry: a regression must not commit into the shared scratch root
      expect(r.isError, name).toBe(true);
      expect(r.text, name).toMatch(/must not start with "-"/);
    }
  });
});

describe("hubRunning (fails closed)", () => {
  it("is false only when the connection is refused", async () => {
    expect(await hubRunning(closed, 5000)).toBe(false);
  });
  it("is true for a listener that answers HTTP", async () => {
    const h = await listener("http");
    try { expect(await hubRunning(h.addr, 5000)).toBe(true); } finally { await h.close(); }
  });
  it("is true for a listener that accepts but never answers", async () => {
    const h = await listener("silent");
    try { expect(await hubRunning(h.addr, 5000)).toBe(true); } finally { await h.close(); }
  });
});

describe.each([["answers HTTP", "http"], ["accepts and never answers", "silent"]] as const)("a hub that %s refuses every write tool", (_n, kind) => {
  let hub: Awaited<ReturnType<typeof listener>>;
  let gba = "", gbc = "";
  beforeAll(async () => {
    hub = await listener(kind);
    gba = mkdtempSync(join(tmpdir(), "pokemap-mcp-w-"));
    cpSync(SUBJECT_ROOT, gba, { recursive: true });
    gbc = copyGbcSubjectToTemp();
  }, 120_000);
  afterAll(async () => {
    await hub.close();
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
    it(`${tool} refuses and leaves ${file} unchanged`, async () => {
      const root = fam === "gba" ? gba : gbc;
      const before = readFileSync(join(root, file));
      const r = await call(await connect(root, true, hub.addr), tool, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/PokeMap is running.*close PokeMap/i);
      expect(readFileSync(join(root, file)).equals(before)).toBe(true);
    }, 30_000);
  }

  it("a dry run does not need the hub to be closed and writes nothing", async () => {
    const file = join(gba, "data/layouts/Route35/map.bin");
    const before = readFileSync(file);
    const r = await call(await connect(gba, true, hub.addr), "pokemap_paint", { map: "Route35", tool: "pencil", x: 1, y: 1, metatile: 1, dry_run: true });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/dry run -- not written/i);
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

  itWithCorpus("paint writes exactly one block and returns the plan", async () => {
    const file = join(root, "data/layouts/Route35/map.bin");
    const before = readFileSync(file);
    const off = (1 * 40 + 3) * 2; // x=3, y=1: asymmetric so a swapped x/y mapping fails
    const metatile = ((before.readUInt16LE(off) & 0x3ff) + 1) % 512;
    const r = await call(client, "pokemap_paint", { map: "Route35", tool: "pencil", x: 3, y: 1, metatile });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/committed|saved|wrote/i);
    expect(r.text).toMatch(/map\.bin/);
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
    expect(r.text).toMatch(/dry run -- not written/i);
    expect(readFileSync(file).equals(before)).toBe(true);
  }, 60_000);

  itWithCorpus("indicator_add writes the object event (x, y, elevation, species) and script", async () => {
    const scripts = join(root, "data/maps/Route35/scripts.inc"), json = join(root, "data/maps/Route35/map.json");
    const j0 = JSON.parse(readFileSync(json, "utf8")) as { object_events: unknown[] };
    const r = await call(client, "pokemap_indicator_add", { map: "Route35", species: "RATTATA", text: "RATTATA: Skreee!", x: 7, y: 2, elevation: 3 });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/Route35/);
    const j1 = JSON.parse(readFileSync(json, "utf8")) as { object_events: Record<string, unknown>[] };
    expect(j1.object_events).toHaveLength(j0.object_events.length + 1);
    const added = j1.object_events[j1.object_events.length - 1]!;
    expect([added.x, added.y, added.elevation]).toEqual([7, 2, 3]);
    expect(JSON.stringify(added)).toMatch(/RATTATA/);
    expect(readFileSync(scripts, "utf8")).toMatch(/PokemonIndicator[\s\S]*Skreee/);
  }, 60_000);

  itWithCorpus("paint rect maps x1/y1 (fills the whole rectangle, nothing outside)", async () => {
    const file = join(root, "data/layouts/Route35/map.bin");
    const before = readFileSync(file);
    const metatile = ((before.readUInt16LE((5 * 40 + 6) * 2) & 0x3ff) + 1) % 512;
    const r = await call(client, "pokemap_paint", { map: "Route35", tool: "rect", x: 6, y: 5, x1: 8, y1: 6, metatile });
    expect(r.isError).toBe(false);
    const after = readFileSync(file);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 40; x++) {
      const o = (y * 40 + x) * 2, inside = x >= 6 && x <= 8 && y >= 5 && y <= 6;
      if (inside) expect(after.readUInt16LE(o) & 0x3ff, `${x},${y}`).toBe(metatile);
      else expect(after.readUInt16LE(o), `${x},${y}`).toBe(before.readUInt16LE(o));
    }
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

  itWithGbcCorpus("paint changes exactly the one block", async () => {
    const file = join(root, `maps/${MAP}.blk`);
    const before = readFileSync(file);
    const m = before[2] === 1 ? 2 : 1;
    const r = await call(client, "pokemap_paint", { map: MAP, tool: "pencil", x: 2, y: 0, metatile: m });
    expect(r.isError).toBe(false);
    const expected = Buffer.from(before);
    expected[2] = m; // block (2,0): asymmetric so a swapped x/y mapping fails
    expect(readFileSync(file).equals(expected)).toBe(true);
  }, 60_000);

  itWithGbcCorpus("event_move rewrites exactly the one warp line", async () => {
    const before = asm();
    const r = await call(client, "pokemap_event_move", { map: MAP, kind: "warp", index: 0, x: 12, y: 4 });
    expect(r.isError).toBe(false);
    const a = before.split("\n"), b = asm().split("\n");
    expect(b).toHaveLength(a.length);
    expect(b.filter((l, i) => l !== a[i])).toEqual(["\twarp_event  12,  4, ELMS_LAB, 1"]);
  }, 60_000);

  itWithGbcCorpus("event_add then event_delete round-trips the asm", async () => {
    const before = asm();
    const add = await call(client, "pokemap_event_add", { map: MAP, kind: "bg", args: "1, 2, BGEVENT_READ, NewBarkTownSign" });
    expect(add.isError).toBe(false);
    expect(asm()).not.toBe(before);
    expect(asm()).toMatch(/bg_event\s+1,\s+2, BGEVENT_READ, NewBarkTownSign/);
    const del = await call(client, "pokemap_event_delete", { map: MAP, kind: "bg", index: 4 });
    expect(del.isError).toBe(false);
    expect(asm()).toBe(before);
  }, 60_000);

  itWithGbcCorpus("a CLI refusal comes back verbatim and writes nothing", async () => {
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
