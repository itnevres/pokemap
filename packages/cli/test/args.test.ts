import { describe, it, expect } from "vitest";
import { InvalidArgumentError } from "commander";
import { parseBorder, parseBbox, parseScale } from "../src/args.js";

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

describe("parseBbox", () => {
  it("accepts four comma-separated integers as {x,y,w,h}", () => {
    expect(parseBbox("0,0,400,400")).toEqual({ x: 0, y: 0, w: 400, h: 400 });
  });

  it("accepts negative x/y (a bbox can legitimately start before the world origin) but not negative w/h", () => {
    expect(parseBbox("-10,-20,5,6")).toEqual({ x: -10, y: -20, w: 5, h: 6 });
  });

  // render-world's own culling test (`p.x + p.width <= bx || ...`) and the
  // blit destination (`(p.x - bx) * scale`) both silently do the wrong
  // thing on NaN rather than throwing: a NaN comparison is always false (so
  // the x-bounds exclusion clause never fires, over-including maps outside
  // the intended column) and a NaN destination index is a silent no-op
  // write on a Uint8ClampedArray (so `drawn++` still counts a map that
  // never actually painted a pixel). Both are confidently-wrong output, not
  // a crash -- the worse of the two failure modes this project's own test
  // rules call out repeatedly.
  it("rejects a non-numeric component instead of letting it become NaN downstream", () => {
    expect(() => parseBbox("abc,0,400,400")).toThrow(InvalidArgumentError);
    expect(() => parseBbox("abc,0,400,400")).toThrow(/--bbox/);
  });

  it("rejects a fractional component instead of silently truncating it", () => {
    expect(() => parseBbox("0,0,400.5,400")).toThrow(InvalidArgumentError);
  });

  it("rejects the wrong number of components", () => {
    expect(() => parseBbox("0,0,400")).toThrow(InvalidArgumentError);
    expect(() => parseBbox("0,0,400,400,1")).toThrow(InvalidArgumentError);
  });

  // createRaster(bw*scale, bh*scale) with a zero or negative dimension does
  // not throw either -- `new Uint8ClampedArray(0)` (or a negative length,
  // which ToIndex clamps) just silently allocates an empty buffer, and
  // encodePng's own guard would report it as a confusing "raster is 0x400"
  // rather than naming --bbox at all.
  it("rejects a zero or negative width/height", () => {
    expect(() => parseBbox("0,0,0,400")).toThrow(InvalidArgumentError);
    expect(() => parseBbox("0,0,400,-1")).toThrow(InvalidArgumentError);
  });
});

// Review fix: render-world's own `--scale` had the exact unvalidated-input
// problem parseBbox exists to prevent, in the same command: `Number(opts.scale)`
// let "abc" become NaN (createRaster(NaN, NaN) is a raster with NaN
// dimensions, not a throw) and "0" become a silently empty 0x0 PNG, both
// failing confusingly downstream instead of naming --scale.
describe("parseScale", () => {
  it("accepts a positive integer", () => {
    expect(parseScale("4")).toBe(4);
    expect(parseScale("16")).toBe(16);
  });

  it("rejects non-numeric input with a message naming the flag, not node:buffer or a NaN raster", () => {
    expect(() => parseScale("abc")).toThrow(InvalidArgumentError);
    expect(() => parseScale("abc")).toThrow(/--scale/);
  });

  it("rejects zero instead of silently producing a 0x0 raster", () => {
    expect(() => parseScale("0")).toThrow(InvalidArgumentError);
  });

  it("rejects a negative value", () => {
    expect(() => parseScale("-4")).toThrow(InvalidArgumentError);
  });

  it("rejects a fractional value instead of silently truncating it", () => {
    expect(() => parseScale("1.5")).toThrow(InvalidArgumentError);
  });
});
