import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constCounter, gbcEventGap } from "../../../src/gbc/load/constCounter.js";
import { subjectSnapshot } from "../../helpers/subjectSnapshot.js";

it("counter honors const_def, const_skip and const_next", () => {
  expect(constCounter("const_def 5\nconst A\nconst B\nconst_skip 2\nconst C\nconst_next 20\nconst D")
    .map(({ name, value }) => ({ name, value }))).toEqual([
    { name: "A", value: 5 }, { name: "B", value: 6 }, { name: "C", value: 9 }, { name: "D", value: 20 }
  ]);
});
const { gbc } = subjectSnapshot();
it.skipIf(!gbc)("PerfPlus event gap is 48 and every const is below its boundary", () => {
  const text = readFileSync(join(gbc!, "constants/event_flags.asm"), "utf8");
  const gap = gbcEventGap(text)!;
  expect(gap.remaining).toBe(48);
  const target = text.split(/\r?\n/).slice(gap.afterLine + 1).find(l => /^\s*const_next\b/.test(l))!;
  const boundary = Number(target.trim().split(/\s+/)[1]);
  const values = constCounter(text).map(c => c.value);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every(v => v < boundary)).toBe(true);
  expect(Math.max(...values) + 1 + gap.remaining).toBe(boundary);
});
it("gap uses the last event and reports zero-based insertion line", () => {
  expect(gbcEventGap("const_def 5\nconst EVENT_A\nconst_skip 2\nconst_next 10")).toEqual({ afterLine: 1, remaining: 4 });
  expect(gbcEventGap("const_def\nconst EVENT_A")).toBeNull();
});

it("backwards const_next refuses with source filename and one-based line", () => {
  expect(() => constCounter("const_def 5\nconst EVENT_A\nconst_next 5\nconst EVENT_B", "constants/fixture.asm"))
    .toThrow("constants/fixture.asm:3: const_next 5 moves backwards from 6");
  expect(() => gbcEventGap("const_def 5\nconst EVENT_A\nconst_next 5", "constants/fixture.asm"))
    .toThrow("constants/fixture.asm:3: const_next 5 moves backwards from 6");
  expect(constCounter("const_def 5\nconst A\nconst_next 6\nconst B").map(c => c.value)).toEqual([5, 6]);
});
