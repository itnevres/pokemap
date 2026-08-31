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

  it("rejects a magnitude that would reach Buffer.copy as an allocation failure", () => {
    // Measured before this cap existed: --border 100000 reached Buffer.copy
    // as "Array buffer allocation failed", and --border 4294967296 reached
    // it as "Invalid typed array length: 3.022314556777135e+23" -- both
    // naming node:buffer or V8 internals, not the user's flag. A
    // non-negative integer alone (no upper bound) does not stop either.
    expect(() => parseBorder("100000")).toThrow(InvalidArgumentError);
    expect(() => parseBorder("4294967296")).toThrow(InvalidArgumentError);
  });

  it("accepts the top of the allowed range and rejects one past it", () => {
    expect(parseBorder("1000")).toBe(1000);
    expect(() => parseBorder("1001")).toThrow(InvalidArgumentError);
  });
});
