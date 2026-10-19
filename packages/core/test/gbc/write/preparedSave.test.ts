import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { commitGbcSave, openGbcEditSession, planGbcSave, prepareGbcSave } from "../../../src/gbc/write/save.js";
import { parseMapEvents } from "../../../src/gbc/load/events.js";
import { planFingerprint, type AtomicIo } from "../../../src/write/atomic.js";
import { cleanupFixtures, makeFixture } from "../helpers/saveFixture.js";

afterEach(cleanupFixtures);

function changedFixture() {
  const f = makeFixture();
  const session = openGbcEditSession(f.proj, "Testmap");
  session.blocks[0]!.metatileId = 0;
  session.eventsText += "\n; staged edit\n";
  session.events = parseMapEvents(session.eventsText, session.mapName);
  return { ...f, session };
}

describe("GBC prepared saves", () => {
  it("prepares without writing and restores .blk when the final .asm rename fails", () => {
    const { proj, session, blk, asm, tmp } = changedFixture();
    const plan = planGbcSave(proj, session);
    expect(plan.refusals).toEqual([]);
    const beforeBlk = readFileSync(blk);
    const beforeAsm = readFileSync(asm);
    const entries = prepareGbcSave(proj, session);
    expect(entries.map((e) => e.path)).toEqual([blk, asm]);
    expect(entries[0]!.after).toEqual(Buffer.from([0, 2, 3, 4]));
    expect(entries[1]!.after).toEqual(Buffer.from(session.eventsText, "utf8"));
    expect(readFileSync(blk)).toEqual(beforeBlk);
    expect(readFileSync(asm)).toEqual(beforeAsm);
    let swaps = 0;
    const io: AtomicIo = {
      existsSync, readFileSync, writeFileSync, unlinkSync,
      renameSync(from, to) {
        if (to === asm) {
          expect(swaps).toBe(1);
          expect(readFileSync(blk)).toEqual(Buffer.from([0, 2, 3, 4]));
          throw new Error("injected final rename failure");
        }
        renameSync(from, to);
        swaps++;
      },
    };
    expect(() => commitGbcSave(proj, plan, entries, io)).toThrow("injected final rename failure");
    expect(swaps).toBe(1);
    expect(readFileSync(blk)).toEqual(beforeBlk);
    expect(readFileSync(asm)).toEqual(beforeAsm);
    expect(readdirSync(`${tmp}/maps`).filter((name) => name.includes(".pokemap-tmp-"))).toEqual([]);
  });

  it("fingerprints non-empty prepares deterministically and includes current .asm bytes", () => {
    const { proj, session, asm } = changedFixture();
    const snapshot = structuredClone(session);
    const first = prepareGbcSave(proj, session);
    expect(first).toHaveLength(2);
    const fingerprint = planFingerprint(first);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(planFingerprint(prepareGbcSave(proj, session))).toBe(fingerprint);
    expect(session).toEqual(snapshot);
    const disk = readFileSync(asm);
    // One comment byte changes on disk; the pending output remains session-owned.
    disk[disk.indexOf(Buffer.from("filler"))] = "F".charCodeAt(0);
    writeFileSync(asm, disk);
    const second = prepareGbcSave(proj, session);
    expect(second[1]!.after).toEqual(first[1]!.after);
    expect(planFingerprint(second)).not.toBe(fingerprint);
  });

  it("writes exactly the prepared buffers on success", () => {
    const { proj, session } = changedFixture();
    const entries = prepareGbcSave(proj, session);
    const plan = planGbcSave(proj, session);
    expect(plan.refusals).toEqual([]);
    session.eventsText += "; later edit\n";
    session.events = parseMapEvents(session.eventsText, session.mapName);
    commitGbcSave(proj, plan, entries);
    for (const entry of entries) expect(readFileSync(entry.path)).toEqual(entry.after);
  });

  it("runs the fresh refusal check before preparation or supplied entries", () => {
    const { proj, session, blk, asm } = changedFixture();
    const plan = planGbcSave(proj, session);
    const entries = prepareGbcSave(proj, session);
    session.blocks[0]!.metatileId = 99;
    unlinkSync(asm);
    expect(() => commitGbcSave(proj, plan)).toThrow("save refused");
    expect(() => commitGbcSave(proj, plan, entries)).toThrow("save refused");
    expect(readFileSync(blk)).toEqual(entries[0]!.before);
    expect(existsSync(asm)).toBe(false);
  });
});
