import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { guardGbcSave } from "../../../src/gbc/write/guards.js";
import { commitGbcSave, openGbcEditSession, planGbcSave, type GbcEditSession } from "../../../src/gbc/write/save.js";
import { parseMapEvents } from "../../../src/gbc/load/events.js";
import { cleanupFixtures, makeFixture, TESTMAP_ASM, TESTMAP_ASM_NO_CONSTS } from "../helpers/saveFixture.js";

afterEach(cleanupFixtures);

const codes = (rs: { code: string }[]) => rs.map((r) => r.code);

/** What an event op does (minus the splice itself): swap in new text, re-parse. */
function setText(s: GbcEditSession, text: string): void {
  s.eventsText = text;
  s.events = parseMapEvents(text, s.mapName);
}

const OBJ_B = "\tobject_event  2,  2, SPRITE_B, SPRITEMOVEDATA_STILL, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, ScriptB, -1\n";

describe("guardGbcSave", () => {
  it("11. metatile-out-of-range lists the sorted unique bad ids in one refusal; the cap is exclusive", () => {
    const f = makeFixture(); // cap 5: valid ids 0-4
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks = [{ metatileId: 5 }, { metatileId: -1 }, { metatileId: 1.5 }, { metatileId: 5 }];
    const rs = guardGbcSave(f.proj, s);
    expect(codes(rs)).toEqual(["metatile-out-of-range"]);
    expect(rs[0]!.message).toContain("-1, 1.5, 5");
    expect(rs[0]!.fix).toMatch(/TILESET_TEST has 5 metatiles/);
    expect(rs[0]!.subject).toBe("maps/Testmap.blk");

    s.blocks = [{ metatileId: 4 }, { metatileId: 0 }, { metatileId: 0 }, { metatileId: 0 }];
    expect(guardGbcSave(f.proj, s)).toEqual([]);
  });

  it("12. layout-not-writable: refused only when something would be written to it", () => {
    const f = makeFixture({ blk: [1, 2, 3, 4, 0] }); // 5 bytes for 2x2 -> real loadLayout says writable:false
    const s = openGbcEditSession(f.proj, "Testmap");
    expect(s.layout.writable).toBe(false);
    const plan0 = planGbcSave(f.proj, s);
    expect(plan0.refusals).toEqual([]);
    expect(plan0.changes).toEqual([]);

    const before = readFileSync(f.blk);
    s.blocks[0]!.metatileId = 0;
    const plan = planGbcSave(f.proj, s);
    expect(codes(plan.refusals)).toEqual(["layout-not-writable"]);
    expect(plan.refusals[0]!.subject).toBe("maps/Testmap.blk");
    expect(() => commitGbcSave(f.proj, plan)).toThrow(/save refused: layout-not-writable/);
    expect(readFileSync(f.blk).equals(before)).toBe(true);
    expect(before).toHaveLength(5);
  });

  it("13. blocks-length-changed", () => {
    const f = makeFixture();
    const s = openGbcEditSession(f.proj, "Testmap");
    s.blocks.push({ metatileId: 0 });
    const rs = guardGbcSave(f.proj, s);
    expect(codes(rs)).toEqual(["blocks-length-changed"]);
    expect(rs[0]!.subject).toBe("maps/Testmap.blk");
  });

  describe("14. object-const-desync", () => {
    it("removing an object but not its const is refused", () => {
      const f = makeFixture();
      const s = openGbcEditSession(f.proj, "Testmap");
      setText(s, s.eventsText.replace(OBJ_B, ""));
      expect(s.events.objects).toHaveLength(1);
      const rs = guardGbcSave(f.proj, s);
      expect(codes(rs)).toEqual(["object-const-desync"]);
      expect(rs[0]!.subject).toBe("maps/Testmap.asm");
      expect(rs[0]!.message).toMatch(/changed by -1/);
      expect(rs[0]!.message).toMatch(/object_const_def changed by 0/);
    });

    it("removing the object AND its const keeps them in step: no refusal", () => {
      const f = makeFixture();
      const s = openGbcEditSession(f.proj, "Testmap");
      setText(s, s.eventsText.replace(OBJ_B, "").replace("\tconst TESTMAP_B\n", ""));
      expect(s.events.objectConsts).toHaveLength(1);
      expect(guardGbcSave(f.proj, s)).toEqual([]);
    });

    it("a map with no object_const_def may lose objects freely", () => {
      const f = makeFixture({ asm: TESTMAP_ASM_NO_CONSTS });
      const s = openGbcEditSession(f.proj, "Testmap");
      expect(s.originalEvents.objectConsts).toEqual([]);
      setText(s, s.eventsText.replace(OBJ_B, ""));
      expect(guardGbcSave(f.proj, s)).toEqual([]);
    });

    it("...but may not grow a const block out of nowhere", () => {
      const f = makeFixture({ asm: TESTMAP_ASM_NO_CONSTS });
      const s = openGbcEditSession(f.proj, "Testmap");
      setText(s, "\tobject_const_def\n\tconst TESTMAP_A\n" + s.eventsText);
      expect(s.events.objectConsts).toHaveLength(1);
      expect(codes(guardGbcSave(f.proj, s))).toEqual(["object-const-desync"]);
    });
  });

  describe("15. file-changed-on-disk", () => {
    it("blk changed externally after open: refused, and commit leaves the external bytes alone", () => {
      const f = makeFixture();
      const s = openGbcEditSession(f.proj, "Testmap");
      s.blocks[0]!.metatileId = 0;
      writeFileSync(f.blk, Buffer.from([4, 4, 4, 4]));
      const plan = planGbcSave(f.proj, s);
      expect(codes(plan.refusals)).toEqual(["file-changed-on-disk"]);
      expect(plan.refusals[0]!.subject).toBe("maps/Testmap.blk");
      expect(() => commitGbcSave(f.proj, plan)).toThrow(/save refused: file-changed-on-disk/);
      expect([...readFileSync(f.blk)]).toEqual([4, 4, 4, 4]);
    });

    it("asm changed externally after open: refused, and commit leaves the external text alone", () => {
      const f = makeFixture();
      const s = openGbcEditSession(f.proj, "Testmap");
      setText(s, s.eventsText.replace("SPRITE_A", "SPRITE_C"));
      writeFileSync(f.asm, TESTMAP_ASM + "; someone else was here\n");
      const plan = planGbcSave(f.proj, s);
      expect(codes(plan.refusals)).toEqual(["file-changed-on-disk"]);
      expect(plan.refusals[0]!.subject).toBe("maps/Testmap.asm");
      expect(() => commitGbcSave(f.proj, plan)).toThrow(/save refused: file-changed-on-disk/);
      expect(readFileSync(f.asm, "utf8")).toBe(TESTMAP_ASM + "; someone else was here\n");
    });

    it("an external change to a file this save would not write is not a refusal", () => {
      const f = makeFixture();
      const s = openGbcEditSession(f.proj, "Testmap");
      s.blocks[0]!.metatileId = 0; // only the blk is written
      writeFileSync(f.asm, TESTMAP_ASM + "; someone else was here\n");
      expect(guardGbcSave(f.proj, s)).toEqual([]);
      commitGbcSave(f.proj, planGbcSave(f.proj, s));
      expect([...readFileSync(f.blk)]).toEqual([0, 2, 3, 4]);
    });
  });
});
