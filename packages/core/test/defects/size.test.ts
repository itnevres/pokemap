import { describe, expect, it } from "vitest";
import { sizeDefect } from "../../src/defects/size.js";

describe("sizeDefect", () => {
  it("names both GBA fixes and the exact byte counts", () => {
    expect(sizeDefect("data/layouts/Test/map.bin", 25, 24, "the width/height in data/layouts/layouts.json")).toEqual({
      file: "data/layouts/Test/map.bin", kind: "size",
      message: "data/layouts/Test/map.bin: actual size 25 bytes, expected 24 bytes",
      fix: "Change the width/height in data/layouts/layouts.json or trim/extend data/layouts/Test/map.bin from 25 to 24 bytes.",
    });
  });

  it("names map_const and both GBC fixes for a short file", () => {
    expect(sizeDefect("maps/Test.blk", 3, 4, "the map_const dimensions in constants/map_constants.asm")).toEqual({
      file: "maps/Test.blk", kind: "size",
      message: "maps/Test.blk: actual size 3 bytes, expected 4 bytes",
      fix: "Change the map_const dimensions in constants/map_constants.asm or trim/extend maps/Test.blk from 3 to 4 bytes.",
    });
  });
});
