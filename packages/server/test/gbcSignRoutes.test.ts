import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { createGbcEditSessionStore } from "../src/gbcEditSessions.js";

import { findGbcSign } from "@pokemap/core/src/gbc/signs.js";
import { signHash } from "@pokemap/core/src/signs/marker.js";
import { parseMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { copyGbcSubjectToTemp, removeTemp } from "@pokemap/core/test/gbc/helpers/corpus.js";

interface WireBody {
  fingerprint: string | null;
  changes: { path: string }[];
  refusals: { code: string }[];
  signNotices: { scriptLabel: string; message: string }[];
  blocks: { metatileId: number }[];
  text: string;
}

// Every write is confined to a fresh copy of the real subject, never its source checkout.
describe("GBC sign routes", () => {
  let root: string, server: Server, base: string, original: string;
  const path = () => `${root}/maps/Route29.asm`;
  const disk = () => readFileSync(path(), "utf8");
  const get = async (route: string) => (await fetch(`${base}/api/edit/Route29/${route}`)).json() as Promise<WireBody>;
  const post = async (route: string, body = {}) => {
    const response = await fetch(`${base}/api/edit/Route29/${route}`, { method: "POST", body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as WireBody };
  };
  const commitPreview = async () => post("commit", { fingerprint: (await get("plan")).fingerprint ?? "refused-plan" });
  const put = (mode = "free", text = "HELLO") => post("sign/put", { x: 0, y: 0, mode, text });
  const label = "Route29PokemapSign1";
  beforeEach(async () => {
    root = copyGbcSubjectToTemp();
    original = disk();
    server = createServer(createGbcProjectHandler(root).handle);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (root) removeTemp(root);
  });
  it.each(["\n", "\r\n"])("places exact free-sign bytes and commits the planned session (%j)", async (eol) => {
    const before = original.replace(/\r?\n/g, eol).replace(/\r?\n$/, "");
    writeFileSync(path(), before);
    expect((await put()).status).toBe(200);
    expect(disk()).toBe(before);
    const plan = await get("plan");
    expect(plan.refusals).toEqual([]);
    expect(plan.changes).toHaveLength(1);
    const hash = signHash('\ttext "HELLO"\n\tdone\n');
    const block = [label + ":", `\tjumptext ${label}Text`, "", `; pokemap:sign free ${hash}`, label + "Text:", '\ttext "HELLO"', "\tdone", ""].join(eol) + eol;
    const expected = before.replace("Route29_MapEvents:", block + "Route29_MapEvents:")
      .replace(/(\tdef_bg_events[^\r\n]*(?:\r?\n\tbg_event[^\r\n]*)*)/, '$1' + eol + `\tbg_event  0,  0, BGEVENT_READ, ${label}`);
    expect((await commitPreview()).status).toBe(200);
    expect(disk()).toBe(expected);
    expect(parseMapEvents(disk(), "Route29").bgs.at(-1)?.script).toBe(label);
  });
  it("reads and adopts the original sign without rewriting its body; update is undoable", async () => {
    const event = parseMapEvents(original, "Route29").bgs.find((e) => e.script === "Route29Sign1")!;
    const at = await get(`sign/at?x=${event.x}&y=${event.y}`);
    expect(at).toMatchObject({ kind: "sign", editable: true, mode: null, handEdited: false, text: "ROUTE 29\n\nCHERRYGROVE CITY -\nNEW BARK TOWN" });
    expect((await post("sign/put", { x: event.x, y: event.y, scriptLabel: event.script, mode: "free", text: at.text })).status).toBe(200);
    await post("undo");
    expect((await get("plan")).changes).toEqual([]);
    await post("redo");
    await commitPreview();
    expect(findGbcSign(disk(), event.script).body).toBe(findGbcSign(original, event.script).body);
    expect(disk().replace(/^; pokemap:sign free [a-f0-9]{8}\r?\n/m, "")).toBe(original);
  });
  it("undo frees N=1; redo restores placement; discard never writes", async () => {
    expect((await put()).status).toBe(200);
    await post("undo");
    expect((await get("plan")).changes).toEqual([]);
    await put();
    expect(await get("sign/at?x=0&y=0")).toMatchObject({ scriptLabel: label });
    await post("undo"); await post("redo");
    expect(await get("sign/at?x=0&y=0")).toMatchObject({ scriptLabel: label });
    await post("discard");
    expect(disk()).toBe(original);
    expect((await get("plan")).changes).toEqual([]);
  });
  it("refresh is pure and deterministic, plan and commit use the same bytes", async () => {
    expect((await put("name")).status).toBe(200);
    await commitPreview();
    expect((await get("plan")).changes).toEqual([]);
    await post("discard");
    const names = `${root}/data/maps/landmarks.asm`;
    writeFileSync(names, readFileSync(names, "utf8").replace('db "ROUTE 29@"', 'db "NEW ROUTE@"'));
    const proj = openGbcProject(root), entry = createGbcEditSessionStore(proj).open("Route29");
    const before = entry.session.eventsText;
    const { refreshGbcLinkedSigns } = await import("../src/signRefresh.js");
    const refreshed = refreshGbcLinkedSigns(proj, entry);
    expect(entry.session.eventsText).toBe(before);
    expect(refreshed.session.eventsText).toContain('text "NEW ROUTE"');
    const plan = await get("plan");
    expect(plan.changes).toHaveLength(1);
    expect(plan.signNotices).toEqual([]);
    await commitPreview();
    expect(disk()).toBe(refreshed.session.eventsText);
  });
  it.each(["refresh", "unlink", "leave"])("protects hand edits and supports %s", async (action) => {
    await put("name"); await commitPreview();
    const source = disk();
    const offset = source.indexOf(`${label}Text:`);
    expect(offset).toBeGreaterThan(0);
    writeFileSync(path(), source.slice(0, offset) + source.slice(offset).replace('text "ROUTE 29"', 'text "HAND EDIT"'));
    const edited = disk();
    const plan = await get("plan");
    expect(plan.signNotices).toEqual([{ scriptLabel: label, message: `${label} was edited outside PokeMap and was not refreshed.` }]);
    expect(await get("sign/at?x=0&y=0")).toMatchObject({ handEdited: true });
    expect((await post("sign/put", { x: 0, y: 0, scriptLabel: label, mode: "name", text: "" })).body.refusals).toBeDefined();
    if (action !== "leave") {
      expect((await post("sign/resolve", { scriptLabel: label, action })).status).toBe(200);
      expect((await get("plan")).changes).toHaveLength(1);
      await post("undo"); expect((await get("plan")).signNotices).toHaveLength(1);
      await post("redo");
    }
    expect((await commitPreview()).status).toBe(200);
    if (action === "leave") expect(disk()).toBe(edited);
    else {
      const block = findGbcSign(disk(), label);
      expect(block.marker?.mode).toBe(action === "unlink" ? "free" : "name");
      expect(block.paragraphs).toEqual([[action === "unlink" ? "HAND EDIT" : "ROUTE 29"]]);
      expect(block.marker?.hash).toBe(signHash(block.body));
    }
  });
  it("refresh source refusals prevent every write, including pending paint", async () => {
    expect((await put("name")).status).toBe(200);
    expect((await commitPreview()).status).toBe(200);
    const before = disk();
    const blkPath = `${root}/maps/Route29.blk`, blocks = readFileSync(blkPath);
    writeFileSync(`${root}/data/maps/landmarks.asm`, "; missing source names\n");
    await post("paint/begin");
    await post("paint/apply", { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: (blocks[0]! + 1) % 16 }] }, origin: { x: 0, y: 0 } });
    await post("paint/end");
    const planRes = await fetch(`${base}/api/edit/Route29/plan`);
    expect(planRes.status).toBe(200); // SaveDialog needs r.ok to show the located refusal
    const plan = await planRes.json() as WireBody;
    expect(plan).toMatchObject({ changes: [], signNotices: [] });
    expect(plan.refusals).toHaveLength(1);
    const commit = await commitPreview();
    expect(commit.status).toBe(400);
    expect(commit.body).toMatchObject({ changes: [], signNotices: [] });
    expect(commit.body.refusals).toHaveLength(1);
    expect(disk()).toBe(before);
    expect(readFileSync(blkPath)).toEqual(blocks);
  });
  it("reserves orphan text labels when selecting the lowest unused number", async () => {
    writeFileSync(path(), original.replace("Route29_MapEvents:", 'Route29PokemapSign1Text:\n\ttext "ORPHAN"\n\tdone\n\nRoute29_MapEvents:'));
    expect((await put()).status).toBe(200);
    expect(await get("sign/at?x=0&y=0")).toMatchObject({ scriptLabel: "Route29PokemapSign2" });
    await post("discard");
  });
  it("painting alone leaves every sign byte untouched", async () => {
    const start = await post("paint/begin");
    const id = (start.body.blocks[0]!.metatileId + 1) % 16;
    await post("paint/apply", { tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: id }] }, origin: { x: 0, y: 0 } });
    await post("paint/end");
    expect((await commitPreview()).status).toBe(200);
    expect(disk()).toBe(original);
  });
  it("refuses invalid text, labels, occupancy, and missing source data without staging", async () => {
    for (const text of ['BAD@', 'BAD"', 'ABCDEFGHIJKLMNOPQRS']) {
      expect((await put("free", text)).body.refusals).toBeDefined();
      expect((await get("plan")).changes).toEqual([]);
    }
    expect((await post("sign/put", { x: 0, y: 0, scriptLabel: "missing", mode: "free", text: "OK" })).body.refusals).toBeDefined();
    const event = parseMapEvents(original, "Route29").bgs[0]!;
    expect((await post("sign/put", { x: event.x, y: event.y, mode: "free", text: "OK" })).body.refusals).toBeDefined();
    writeFileSync(`${root}/data/maps/landmarks.asm`, "; no names\n");
    expect((await put("name")).body.refusals).toBeDefined();
    expect((await get("plan")).changes).toEqual([]);
    expect(disk()).toBe(original);
  });
});

