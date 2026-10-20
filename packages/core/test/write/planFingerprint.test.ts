import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planFingerprint, type AtomicEntry } from "../../src/write/atomic.js";

const entry = (path: string, before: Buffer | null, after: string): AtomicEntry => ({ path, before, after: Buffer.from(after, "utf8") });

describe("planFingerprint framing", () => {
  it("uses eight-byte big-endian lengths and an explicit existence marker", () => {
    // path 'p', present before 'b', after 'a': independent literal wire bytes.
    const frame = Buffer.from("00000000000000017001000000000000000162000000000000000161", "hex");
    expect(planFingerprint([entry("p", Buffer.from("b"), "a")])).toBe(createHash("sha256").update(frame).digest("hex"));
    const absent = Buffer.from("00000000000000017000000000000000000161", "hex");
    expect(planFingerprint([entry("p", null, "a")])).toBe(createHash("sha256").update(absent).digest("hex"));
    expect(planFingerprint([entry("p", null, "a")])).not.toBe(planFingerprint([entry("p", Buffer.alloc(0), "a")]));
  });

  it("separates fields, paths, entry order, and preserves the fixed empty digest", () => {
    expect(planFingerprint([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(planFingerprint([entry("ab", null, "c")])).not.toBe(planFingerprint([entry("a", null, "bc")]));
    const a = entry("first", Buffer.from("before"), "after");
    const b = entry("second", null, "next");
    expect(planFingerprint([a, b])).not.toBe(planFingerprint([b, a]));
    expect(planFingerprint([a])).not.toBe(planFingerprint([{ ...a, path: "other" }]));
    expect(planFingerprint([a])).not.toBe(planFingerprint([{ ...a, after: Buffer.from("changed") }]));
  });
});
