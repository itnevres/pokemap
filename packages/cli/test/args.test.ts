import { describe, it, expect } from "vitest";
import { InvalidArgumentError } from "commander";
import { parseBorder } from "../src/args.js";

describe("parseBorder", () => {
  it("accepts non-negative integers", () => {
    expect(parseBorder("0")).toBe(0);
    expect(parseBorder("3")).toBe(3);
  });

  it("rejects a fractional value instead of silently truncating it", () => {
    // Measured before this guard existed: "1.5" was accepted and rendered
    // three half-rings at a fractional pixel boundary.
    expect(() => parseBorder("1.5")).toThrow(InvalidArgumentError);
  });

  it("rejects a negative value", () => {
    expect(() => parseBorder("-1")).toThrow(InvalidArgumentError);
  });

  it("rejects non-numeric input with a message naming the flag, not node:buffer", () => {
    // Measured before this guard existed: "abc" travelled all the way to
    // Buffer.copy and threw RangeError [ERR_OUT_OF_RANGE] ... Received NaN.
    expect(() => parseBorder("abc")).toThrow(InvalidArgumentError);
    expect(() => parseBorder("abc")).toThrow(/--border/);
  });
});
