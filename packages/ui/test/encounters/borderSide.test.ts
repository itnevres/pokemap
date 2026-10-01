import { describe, it, expect } from "vitest";
import {
  BORDER_BAND,
  SIDE_ORDER,
  bandRect,
  borderSideFromConnections,
  overlapArea,
  pickBorderSide,
  type CompassDir,
  type Rect,
} from "../../src/encounters/borderSide.js";

const R = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const MAP = R(0, 0, 10, 10);
const BAND = 2;
// Flush neighbours (gap 0) on each side of MAP.
const L = R(-5, 0, 5, 10);
const T = R(0, -5, 10, 5);
const Rt = R(10, 0, 5, 10);
const B = R(0, 10, 10, 5);

describe("constants", () => {
  it("U4 order and band sizes", () => {
    expect(SIDE_ORDER).toEqual(["left", "top", "right", "bottom"]);
    expect(BORDER_BAND).toEqual({ gba: 4, gbc: 2 });
  });
});

describe("bandRect", () => {
  it("exact band per side, no corner squares", () => {
    expect(bandRect(MAP, "left", 2)).toEqual(R(-2, 0, 2, 10));
    expect(bandRect(MAP, "top", 2)).toEqual(R(0, -2, 10, 2));
    expect(bandRect(MAP, "right", 2)).toEqual(R(10, 0, 2, 10));
    expect(bandRect(MAP, "bottom", 2)).toEqual(R(0, 10, 10, 2));
    expect(bandRect(R(3, 4, 5, 6), "right", 4)).toEqual(R(8, 4, 4, 6));
  });
});

describe("overlapArea", () => {
  it("positive-area intersection; touching is 0", () => {
    expect(overlapArea(R(0, 0, 4, 4), R(2, 2, 4, 4))).toBe(4);
    expect(overlapArea(R(0, 0, 4, 4), R(4, 0, 4, 4))).toBe(0);
    expect(overlapArea(R(0, 0, 4, 4), R(4, 4, 4, 4))).toBe(0);
    expect(overlapArea(R(0, 0, 4, 4), R(9, 9, 1, 1))).toBe(0);
  });
});

describe("pickBorderSide: U4 examples (10x10 map at origin, band 2)", () => {
  it.each([
    ["top+bottom", [T, B], "left"],
    ["left+right", [L, Rt], "top"],
    ["top+right", [T, Rt], "left"],
    ["nothing", [], "left"],
    ["left only", [L], "top"],
    ["left+top+right", [L, T, Rt], "bottom"],
  ] as const)("%s -> %s", (_n, nbs, want) => {
    expect(pickBorderSide(MAP, [...nbs], BAND)).toBe(want);
  });
});

describe("pickBorderSide: all blocked -> least overlap", () => {
  const left = R(-2, 0, 2, 10);
  const right = R(10, 0, 2, 4);
  const bottom = R(0, 10, 10, 2);
  it("exact fixture picks top (6 < 8 < 20 = 20)", () => {
    const top = R(0, -2, 3, 2);
    expect(overlapArea(bandRect(MAP, "left", BAND), left)).toBe(20);
    expect(overlapArea(bandRect(MAP, "top", BAND), top)).toBe(6);
    expect(overlapArea(bandRect(MAP, "right", BAND), right)).toBe(8);
    expect(overlapArea(bandRect(MAP, "bottom", BAND), bottom)).toBe(20);
    expect(pickBorderSide(MAP, [left, top, right, bottom], BAND)).toBe("top");
  });
  it("tie top 8 = right 8 -> SIDE_ORDER picks top", () => {
    const top = R(0, -2, 4, 2);
    expect(overlapArea(bandRect(MAP, "top", BAND), top)).toBe(8);
    expect(pickBorderSide(MAP, [left, top, right, bottom], BAND)).toBe("top");
  });
  it("tie right 8 = bottom 8 -> right (order, not last)", () => {
    const top = R(0, -2, 10, 2);
    const bot = R(0, 10, 4, 2);
    expect(pickBorderSide(MAP, [left, top, right, bot], BAND)).toBe("right");
  });
});

describe("pickBorderSide: touching vs gap (left side, band 2)", () => {
  it("flush (gap 0) blocks left", () => {
    expect(pickBorderSide(MAP, [R(-5, 0, 5, 10)], BAND)).toBe("top");
  });
  it("gap band-1 blocks", () => {
    expect(pickBorderSide(MAP, [R(-6, 0, 5, 10)], BAND)).toBe("top");
  });
  it("gap exactly band is free", () => {
    expect(pickBorderSide(MAP, [R(-7, 0, 5, 10)], BAND)).toBe("left");
  });
  it("gap band+1 is free", () => {
    expect(pickBorderSide(MAP, [R(-8, 0, 5, 10)], BAND)).toBe("left");
  });
  it("corner-only contact blocks nothing", () => {
    expect(pickBorderSide(MAP, [R(-5, -5, 5, 5)], BAND)).toBe("left");
  });
  it("a rect equal to the map blocks nothing", () => {
    expect(pickBorderSide(MAP, [MAP], BAND)).toBe("left");
  });
});

describe("borderSideFromConnections", () => {
  it.each([
    [["north", "south"], "left"],
    [["west", "east"], "top"],
    [["north", "east"], "left"],
    [["west"], "top"],
    [["west", "north", "east"], "bottom"],
    [["west", "north", "east", "south"], "left"],
    [[], "left"],
  ] as [CompassDir[], string][])("%j -> %s", (dirs, want) => {
    expect(borderSideFromConnections(new Set(dirs))).toBe(want);
  });
  it("south alone leaves left free", () => {
    expect(borderSideFromConnections(new Set<CompassDir>(["south"]))).toBe("left");
  });
});
