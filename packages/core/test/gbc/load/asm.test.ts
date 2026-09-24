import { describe, it, expect } from "vitest";
import { scanCalls, stripComment, stripMacroDefs, splitArgs, matchCall } from "../../../src/gbc/load/asm.js";

describe("scanCalls", () => {
  it("arg spans exclude padding -- arg0 span is exactly the trimmed text", () => {
    const text = "\twarp_event  6,  3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(call).toBeDefined();
    expect(call!.args).toHaveLength(4);
    expect(call!.args[0]!.text).toBe("6");
    expect(text.slice(call!.args[0]!.start, call!.args[0]!.end)).toBe("6");
    expect(call!.args[1]!.text).toBe("3");
    expect(call!.args[2]!.text).toBe("ELMS_LAB");
    expect(call!.args[3]!.text).toBe("1");
  });

  it("excludes a trailing comment from the last arg's span", () => {
    const text = "\twarp_event  5,  5, BURNED_TOWER_B1F, 1 ; inaccessible, left over from G/S";
    const [call] = scanCalls(text, "warp_event");
    expect(call!.args).toHaveLength(4);
    expect(call!.args[3]!.text).toBe("1");
    // the span itself must not swallow any comment characters
    expect(text.slice(call!.args[3]!.start, call!.args[3]!.end)).toBe("1");
  });

  it("keeps a compound expression as one arg span (bitwise-or, never split)", () => {
    const text1 = "\tmap RadioTower1F, TILESET_RADIO_TOWER, INDOOR, LANDMARK_RADIO_TOWER, RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY, TRUE, PALETTE_DAY, FISHGROUP_SHORE";
    const [call1] = scanCalls(text1, "map");
    expect(call1!.args).toHaveLength(8);
    expect(call1!.args[4]!.text).toBe("RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY");

    const text2 = "\tmap_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST";
    const [call2] = scanCalls(text2, "map_attributes");
    expect(call2!.args).toHaveLength(4);
    expect(call2!.args[3]!.text).toBe("WEST | EAST");
  });

  it("skips a MACRO...ENDM body, including a legacy recursive call that looks like a real invocation", () => {
    // Real legacy line from data/maps/attributes.asm's own connection macro.
    const text = [
      "MACRO connection",
      ";\\1: direction",
      "\tif _NARG == 6",
      "\t\tconnection \\1, \\2, \\3, (\\4) - (\\5)",
      "\telse",
      "\t\tDEF _src = 0",
      "\tendc",
      "ENDM",
      "",
      "\tconnection west, Route34, ROUTE_34, -18",
    ].join("\n");
    const calls = scanCalls(text, "connection");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[1]!.text).toBe("Route34");
  });

  it("keyword matches as a whole token only -- 'map' never matches map_const/map_attributes/map_id", () => {
    const text = [
      "\tmap_const FOO_TOWN, 4, 4",
      "\tmap_attributes FooTown, FOO_TOWN, $00, 0",
      "\tmap_id FOO_TOWN",
      "\tmap FooTown, TILESET_JOHTO, TOWN, LANDMARK_FOO, MUSIC_FOO, FALSE, PALETTE_AUTO, FISHGROUP_OCEAN",
    ].join("\n");
    const calls = scanCalls(text, "map");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0]!.text).toBe("FooTown");
  });

  it("tolerates CRLF line endings", () => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1\r\n\twarp_event 1, 2, FOO, 3\r\n";
    const calls = scanCalls(text, "warp_event");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.args[0]!.text).toBe("6");
    expect(calls[1]!.args[2]!.text).toBe("FOO");
    // spans must not include the \r
    const arg = calls[0]!.args[2]!;
    expect(text.slice(arg.start, arg.end)).toBe("ELMS_LAB");
  });

  it("accepts a final line with no trailing newline", () => {
    const text = "\twarp_event 1, 2, FOO, 3\n\twarp_event 6, 3, ELMS_LAB, 1";
    const calls = scanCalls(text, "warp_event");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args[2]!.text).toBe("ELMS_LAB");
    expect(calls[1]!.lineEnd).toBe(text.length);
  });

  it("reports lineIndex, lineStart and lineEnd covering exactly the line's own content", () => {
    const text = "\tfoo\n\twarp_event 1, 2, FOO, 3\n\tbar\n";
    const [call] = scanCalls(text, "warp_event");
    expect(call!.lineIndex).toBe(1);
    expect(text.slice(call!.lineStart, call!.lineEnd)).toBe("\twarp_event 1, 2, FOO, 3");
  });

  it("returns an empty array when the macro never occurs", () => {
    expect(scanCalls("\tsomething_else 1, 2", "warp_event")).toEqual([]);
  });

  it("cuts a comment at the FIRST ';', not the last -- a comment containing its own ';' keeps the last arg intact", () => {
    const text = "\twarp_event 1, 2, FOO, 3 ; a ; b";
    const [call] = scanCalls(text, "warp_event");
    expect(call!.args).toHaveLength(4);
    expect(call!.args[3]!.text).toBe("3");
  });

  it("refuses a blank argument between two commas, naming the argument list, rather than silently renumbering", () => {
    expect(() => scanCalls("\twarp_event 1,,3,4", "warp_event")).toThrow(/1,,3,4/);
  });

  it("refuses a trailing comma with nothing after it, rather than silently dropping the empty slot", () => {
    expect(() => scanCalls("\twarp_event 1,2,3,", "warp_event")).toThrow();
  });
});

describe("stripComment / stripMacroDefs / splitArgs / matchCall (re-exported, moved from map.ts)", () => {
  it("stripComment removes a trailing comment", () => {
    expect(stripComment("map_const FOO, 4, 4 ; comment")).toBe("map_const FOO, 4, 4 ");
  });

  it("stripMacroDefs drops lines between MACRO and ENDM", () => {
    const text = ["MACRO foo", "bar", "ENDM", "", "real_call 1"].join("\n");
    expect(stripMacroDefs(text)).toEqual(["", "real_call 1"]);
  });

  it("splitArgs comma-splits and trims", () => {
    expect(splitArgs(" 1,  2 ,FOO ")).toEqual(["1", "2", "FOO"]);
  });

  it("matchCall matches a whole-token keyword and returns comma-split args", () => {
    expect(matchCall("\tmap_const FOO, 4, 4", "map_const")).toEqual(["FOO", "4", "4"]);
    expect(matchCall("\tmap_const FOO, 4, 4", "map")).toBeNull();
  });

  it("splitArgs refuses a blank argument between two commas rather than silently renumbering", () => {
    expect(() => splitArgs("1,,3")).toThrow(/1,,3/);
  });

  it("splitArgs refuses a trailing comma with nothing after it", () => {
    expect(() => splitArgs("1,2,")).toThrow();
  });

  it("stripMacroDefs and scanCalls agree on a line with a lone trailing '\\r' and no following '\\n' (regression: this used to diverge)", () => {
    const text = "\twarp_event 1, 2, FOO, 3\r";
    const [line] = stripMacroDefs(text);
    expect(matchCall(line!, "warp_event")).toEqual(["1", "2", "FOO", "3"]);
    expect(scanCalls(text, "warp_event")).toHaveLength(1);
    expect(scanCalls(text, "warp_event")[0]!.args[2]!.text).toBe("FOO");
  });
});
