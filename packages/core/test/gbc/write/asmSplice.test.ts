import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { scanCalls, stripComment, escapeRegExp, type AsmCall } from "../../../src/gbc/load/asm.js";
import { spliceArg, locateCall, locateEventCall, locateNthCall } from "../../../src/gbc/write/asmSplice.js";
import { itWithGbcCorpus, gbcCorpusRoots, GBC_SUBJECT_ROOT } from "../helpers/corpus.js";

const PRET_PINS = { maps: 388, attrArgc: 3, counts: { warp_event: 1312, coord_event: 114, bg_event: 792, object_event: 1466, scene_script: 170, callback: 103, map_attributes: 388, connection: 142, map: 388, map_const: 388, tilecoll: 2368 } };
/** Per-root corpus pins. subject = PerfPlus; pret = vanilla pret/pokecrystal @ 3bc8daa (a pret bump re-measures). */
const PINS = {
  subject: { maps: 391, attrArgc: 4, counts: { warp_event: 1327, coord_event: 114, bg_event: 792, object_event: 1468, scene_script: 170, callback: 105, map_attributes: 391, connection: 142, map: 391, map_const: 391, tilecoll: 2368 } },
  pret: PRET_PINS,
};

describe("spliceArg", () => {
  it("replaces exactly the argument's own span, leaving every other byte untouched", () => {
    const text = "\twarp_event  6,  3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    const out = spliceArg(text, call!, 0, "9");
    expect(out).toBe("\twarp_event  9,  3, ELMS_LAB, 1");
  });

  it("preserves a trailing comment untouched", () => {
    const text = "\twarp_event  5,  5, BURNED_TOWER_B1F, 1 ; inaccessible, left over from G/S";
    const [call] = scanCalls(text, "warp_event");
    const out = spliceArg(text, call!, 3, "2");
    expect(out).toBe("\twarp_event  5,  5, BURNED_TOWER_B1F, 2 ; inaccessible, left over from G/S");
  });

  it("a same-value splice is a byte-identical no-op", () => {
    const text = "\twarp_event  6,  3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(spliceArg(text, call!, 2, call!.args[2]!.text)).toBe(text);
  });

  it("refuses an out-of-range argIndex, naming it", () => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(() => spliceArg(text, call!, 4, "9")).toThrow(/4/);
    expect(() => spliceArg(text, call!, -1, "9")).toThrow(/-1/);
  });

  it("refuses an empty replacement value", () => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(() => spliceArg(text, call!, 0, "")).toThrow(/empty/);
  });

  it("refuses a replacement value with leading or trailing whitespace", () => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(() => spliceArg(text, call!, 0, " 9")).toThrow(/whitespace/);
    expect(() => spliceArg(text, call!, 0, "9 ")).toThrow(/whitespace/);
  });

  it("refuses a replacement value with a leading tab (not just a literal space)", () => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(() => spliceArg(text, call!, 0, "\t9")).toThrow(/whitespace/);
  });

  it.each([",", ";", "\n", "\r"])("refuses a replacement value containing %j (would change the line's structure)", (bad) => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    expect(() => spliceArg(text, call!, 2, `FOO${bad}BAR`)).toThrow();
  });

  it("refuses a stale call whose arg text no longer matches the text at its offsets", () => {
    const text = "\twarp_event 6, 3, ELMS_LAB, 1";
    const [call] = scanCalls(text, "warp_event");
    // Same length substitution at the same offset -- arg2's span still exists, but its
    // recorded text ("ELMS_LAB") no longer matches what's actually there.
    const edited = "\twarp_event 6, 3, DIFFEREN2, 1";
    expect(() => spliceArg(edited, call!, 2, "9")).toThrow(/stale/);
  });
});

describe("real-edit splices (in-memory strings, never touch disk)", () => {
  it("NewBarkTown-style warp_event x arg", () => {
    const text = [
      "NewBarkTown_MapEvents:",
      "\tdb 0, 0 ; filler",
      "",
      "\tdef_warp_events",
      "\twarp_event  6,  3, ELMS_LAB, 1",
      "\twarp_event 13,  5, PLAYERS_HOUSE_1F, 1",
    ].join("\n");
    const call = locateEventCall(text, "NewBarkTown", "warp_event", 0);
    const out = spliceArg(text, call, 0, "20");
    expect(out).not.toBe(text);
    const prefixEnd = call.args[0]!.start;
    const suffixStart = call.args[0]!.end;
    expect(out.slice(0, prefixEnd)).toBe(text.slice(0, prefixEnd));
    expect(out.slice(prefixEnd + "20".length)).toBe(text.slice(suffixStart));
  });

  it("map_attributes border arg", () => {
    const text = "\tmap_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST";
    const call = locateCall(text, "map_attributes", "NewBarkTown");
    const out = spliceArg(text, call, 2, "$09");
    expect(out).toBe("\tmap_attributes NewBarkTown, NEW_BARK_TOWN, $09, WEST | EAST");
    expect(out.length - text.length).toBe("$09".length - "$05".length);
  });

  it("tilecoll quadrant arg", () => {
    const text = [
      "\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 00",
      "\ttilecoll FLOOR, FLOOR, FLOOR, FLOOR ; 01",
    ].join("\n");
    const call = locateNthCall(text, "tilecoll", 1);
    const out = spliceArg(text, call, 3, "WALL");
    expect(out).toBe(["\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 00", "\ttilecoll FLOOR, FLOOR, FLOOR, WALL ; 01"].join("\n"));
  });
});

describe("locateCall", () => {
  it("finds the unique call whose first arg equals firstArg", () => {
    const text = ["\tmap_attributes FooTown, FOO_TOWN, $00, 0", "\tmap_attributes BarTown, BAR_TOWN, $00, 0"].join("\n");
    const call = locateCall(text, "map_attributes", "BarTown");
    expect(call.args[0]!.text).toBe("BarTown");
  });

  it("refuses when there is no match, naming the target", () => {
    const text = "\tmap_attributes FooTown, FOO_TOWN, $00, 0";
    expect(() => locateCall(text, "map_attributes", "NoSuchTown")).toThrow(/NoSuchTown/);
  });

  it("refuses when more than one call matches, naming the target", () => {
    const text = ["\tmap_attributes FooTown, FOO_TOWN, $00, 0", "\tmap_attributes FooTown, FOO_TOWN2, $00, 0"].join("\n");
    expect(() => locateCall(text, "map_attributes", "FooTown")).toThrow(/FooTown/);
  });
});

describe("locateNthCall", () => {
  it("returns the ordinal-th call (0-based)", () => {
    const text = [
      "\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 00",
      "\ttilecoll FLOOR, FLOOR, FLOOR, FLOOR ; 01",
      "\ttilecoll WALL, WALL, WALL, DOOR ; 02",
    ].join("\n");
    expect(locateNthCall(text, "tilecoll", 2).args[3]!.text).toBe("DOOR");
  });

  it("refuses an out-of-range ordinal, naming it", () => {
    const text = "\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 00";
    expect(() => locateNthCall(text, "tilecoll", 1)).toThrow(/1/);
  });

  it("refuses a negative ordinal, naming it", () => {
    const text = "\ttilecoll CUT_TREE, CUT_TREE, CUT_TREE, CUT_TREE ; 00";
    expect(() => locateNthCall(text, "tilecoll", -1)).toThrow(/-1/);
  });
});

describe("locateEventCall", () => {
  const text = [
    "NewBarkTown_MapEvents:",
    "\tdb 0, 0 ; filler",
    "",
    "\tdef_warp_events",
    "\twarp_event  6,  3, ELMS_LAB, 1",
    "\twarp_event 13,  5, PLAYERS_HOUSE_1F, 1",
    "",
    "\tdef_coord_events",
    "\tcoord_event  1,  8, SCENE_FOO, FooScene",
  ].join("\n");

  it("finds the ordinal-th macro call after the map's MapEvents label", () => {
    expect(locateEventCall(text, "NewBarkTown", "warp_event", 1).args[2]!.text).toBe("PLAYERS_HOUSE_1F");
    expect(locateEventCall(text, "NewBarkTown", "coord_event", 0).args[3]!.text).toBe("FooScene");
  });

  it("returns absolute offsets and lineIndex into the whole file, not the tail slice", () => {
    const call = locateEventCall(text, "NewBarkTown", "warp_event", 0);
    expect(text.slice(call.lineStart, call.lineEnd)).toBe("\twarp_event  6,  3, ELMS_LAB, 1");
    expect(text.slice(call.args[2]!.start, call.args[2]!.end)).toBe("ELMS_LAB");
    // Absolute line index in `text`: label=0, filler=1, blank=2, def_warp_events=3, this call=4.
    expect(call.lineIndex).toBe(4);
  });

  it("finds ordinal 0 when the label is immediately followed by the first call, no filler/def line between", () => {
    const tight = ["FooTown_MapEvents:", "\twarp_event 1, 2, BAR, 1"].join("\n");
    const call = locateEventCall(tight, "FooTown", "warp_event", 0);
    expect(call.args[2]!.text).toBe("BAR");
    expect(call.lineIndex).toBe(1);
  });

  it("finds ordinal 0 when the label is immediately followed by the first call, CRLF", () => {
    const tight = ["FooTown_MapEvents:", "\twarp_event 1, 2, BAR, 1"].join("\r\n");
    const call = locateEventCall(tight, "FooTown", "warp_event", 0);
    expect(call.args[2]!.text).toBe("BAR");
    expect(call.lineIndex).toBe(1);
  });

  it("stops at the next map's label -- a call past it is not this map's, so it's out of range rather than borrowed", () => {
    const twoMaps = [
      "Foo_MapEvents:",
      "\tdb 0, 0",
      "\tdef_warp_events",
      "\twarp_event 1, 2, A, 1",
      "Bar_MapEvents:",
      "\tdb 0, 0",
      "\tdef_warp_events",
      "\twarp_event 9, 9, B, 1",
    ].join("\n");
    expect(locateEventCall(twoMaps, "Foo", "warp_event", 0).args[2]!.text).toBe("A");
    expect(() => locateEventCall(twoMaps, "Foo", "warp_event", 1)).toThrow(/1/);
    expect(locateEventCall(twoMaps, "Bar", "warp_event", 0).args[2]!.text).toBe("B");
  });

  it("tolerates a label with trailing whitespace (CeruleanCave1F style)", () => {
    const withTrailingSpace = text.replace("NewBarkTown_MapEvents:", "NewBarkTown_MapEvents: ");
    expect(locateEventCall(withTrailingSpace, "NewBarkTown", "warp_event", 0).args[2]!.text).toBe("ELMS_LAB");
  });

  it("refuses when the map's MapEvents label is missing, naming it, prefixed with its own name (not labelTail's)", () => {
    expect(() => locateEventCall("no label here", "NewBarkTown", "warp_event", 0)).toThrow(/^locateEventCall: /);
    expect(() => locateEventCall("no label here", "NewBarkTown", "warp_event", 0)).toThrow(/NewBarkTown_MapEvents/);
  });

  it("refuses an out-of-range ordinal, naming it", () => {
    expect(() => locateEventCall(text, "NewBarkTown", "warp_event", 5)).toThrow(/5/);
  });

  it("refuses a negative ordinal, naming it", () => {
    expect(() => locateEventCall(text, "NewBarkTown", "warp_event", -1)).toThrow(/-1/);
  });
});

describe("corpus no-op round trip (G5-for-G3): every call, every arg, over every file in the enumerated set", () => {
  function includedPaths(sourceFile: string, re: RegExp): string[] {
    return [...sourceFile.matchAll(re)].map((m) => m[1]!);
  }

  function reconstruct(text: string, call: AsmCall): string {
    let out = "";
    let cursor = call.lineStart;
    for (const arg of call.args) {
      out += text.slice(cursor, arg.start) + arg.text;
      cursor = arg.end;
    }
    return out + text.slice(cursor, call.lineEnd);
  }

  itWithGbcCorpus("enumerates 391 maps/*.asm via scripts.asm and 32 collision files via tilesets.asm INCLUDEs", () => {
    for (const root of gbcCorpusRoots()) {
      const scriptsAsm = readFileSync(`${root}/data/maps/scripts.asm`, "utf8");
      const mapFiles = includedPaths(scriptsAsm, /INCLUDE "(maps\/[^"]+\.asm)"/g);
      expect(mapFiles).toHaveLength(PINS[root === GBC_SUBJECT_ROOT ? "subject" : "pret"].maps);

      const tilesetsAsm = readFileSync(`${root}/gfx/tilesets.asm`, "utf8");
      const collisionFiles = includedPaths(tilesetsAsm, /INCLUDE "(data\/tilesets\/[^"]+_collision\.asm)"/g);
      expect(collisionFiles).toHaveLength(32);
    }
  });

  itWithGbcCorpus(
    "no-op splice of every arg of every call is byte-identical; call spans reconstruct exactly; per-macro call/arg-count pins",
    () => {
      const failures: string[] = [];
      let counts: Record<string, number> = {};
      let argCountsSeen: Record<string, Set<number>> = {};

      function record(macro: string, call: AsmCall) {
        counts[macro] = (counts[macro] ?? 0) + 1;
        (argCountsSeen[macro] ??= new Set()).add(call.args.length);
      }

      function checkFile(path: string, text: string, macros: string[]) {
        for (const macro of macros) {
          const keywordRe = new RegExp(`^\\s*${escapeRegExp(macro)}\\s+`);
          for (const call of scanCalls(text, macro)) {
            record(macro, call);

            if (reconstruct(text, call) !== text.slice(call.lineStart, call.lineEnd)) {
              failures.push(`${path} ${macro}#${call.lineIndex}: reconstructed span mismatch`);
            }

            // Non-circular check (W5): recompute the arg list straight from the raw
            // line text (comment-stripped, keyword removed, comma-split, trimmed) --
            // never touching call.args' own offsets -- and compare to what scanCalls
            // found. A wrong-but-internally-consistent span set can't hide from this.
            const line = text.slice(call.lineStart, call.lineEnd);
            const afterKeyword = stripComment(line).replace(keywordRe, "");
            const independentArgs = afterKeyword.split(",").map((s) => s.trim());
            const scannedArgs = call.args.map((a) => a.text);
            if (JSON.stringify(independentArgs) !== JSON.stringify(scannedArgs)) {
              failures.push(
                `${path} ${macro}#${call.lineIndex}: non-circular check mismatch: ${JSON.stringify(independentArgs)} vs ${JSON.stringify(scannedArgs)}`,
              );
            }

            for (let i = 0; i < call.args.length; i++) {
              const spliced = spliceArg(text, call, i, call.args[i]!.text);
              if (spliced !== text) failures.push(`${path} ${macro}#${call.lineIndex} arg${i}: no-op splice changed text`);
            }
          }
        }
      }

      for (const root of gbcCorpusRoots()) {
        counts = {};
        argCountsSeen = {};
        const pins = PINS[root === GBC_SUBJECT_ROOT ? "subject" : "pret"];
        const scriptsAsm = readFileSync(`${root}/data/maps/scripts.asm`, "utf8");
        const mapFiles = includedPaths(scriptsAsm, /INCLUDE "(maps\/[^"]+\.asm)"/g);
        expect(mapFiles).toHaveLength(pins.maps);
        for (const rel of mapFiles) {
          const text = readFileSync(`${root}/${rel}`, "utf8");
          checkFile(rel, text, ["warp_event", "coord_event", "bg_event", "object_event", "scene_script", "callback"]);
        }

        const attributesAsm = readFileSync(`${root}/data/maps/attributes.asm`, "utf8");
        checkFile("data/maps/attributes.asm", attributesAsm, ["map_attributes", "connection"]);

        const mapsAsm = readFileSync(`${root}/data/maps/maps.asm`, "utf8");
        checkFile("data/maps/maps.asm", mapsAsm, ["map"]);

        const mapConstantsAsm = readFileSync(`${root}/constants/map_constants.asm`, "utf8");
        checkFile("constants/map_constants.asm", mapConstantsAsm, ["map_const"]);

        const tilesetsAsm = readFileSync(`${root}/gfx/tilesets.asm`, "utf8");
        const collisionFiles = includedPaths(tilesetsAsm, /INCLUDE "(data\/tilesets\/[^"]+_collision\.asm)"/g);
        expect(collisionFiles).toHaveLength(32);
        for (const rel of collisionFiles) {
          const text = readFileSync(`${root}/${rel}`, "utf8");
          checkFile(rel, text, ["tilecoll"]);
        }

        expect(failures).toEqual([]);

        // Per-macro total call counts, measured over the subject corpus (findings doc §3.1,
        // cross-checked directly against the real files before writing this pin; tilecoll's
        // total was not given in the findings doc and was measured here: 2368).
        expect(counts["warp_event"]).toBe(pins.counts.warp_event);
        expect(counts["coord_event"]).toBe(pins.counts.coord_event);
        expect(counts["bg_event"]).toBe(pins.counts.bg_event);
        expect(counts["object_event"]).toBe(pins.counts.object_event);
        expect(counts["scene_script"]).toBe(pins.counts.scene_script);
        expect(counts["callback"]).toBe(pins.counts.callback);
        expect(counts["map_attributes"]).toBe(pins.counts.map_attributes);
        expect(counts["connection"]).toBe(pins.counts.connection);
        expect(counts["map"]).toBe(pins.counts.map);
        expect(counts["map_const"]).toBe(pins.counts.map_const);
        expect(counts["tilecoll"]).toBe(pins.counts.tilecoll);

        // Per-macro arg-count sets: a scanner bug that mis-splits an argument list shows up here.
        expect(argCountsSeen["warp_event"]).toEqual(new Set([4]));
        expect(argCountsSeen["coord_event"]).toEqual(new Set([4]));
        expect(argCountsSeen["bg_event"]).toEqual(new Set([4]));
        expect(argCountsSeen["object_event"]).toEqual(new Set([13]));
        expect(argCountsSeen["scene_script"]).toEqual(new Set([1, 2]));
        expect(argCountsSeen["callback"]).toEqual(new Set([2]));
        expect(argCountsSeen["map_attributes"]).toEqual(new Set([pins.attrArgc])); // vanilla pret has no trailing flags arg (3); PerfPlus has it (4)
        expect(argCountsSeen["connection"]).toEqual(new Set([4]));
        expect(argCountsSeen["map"]).toEqual(new Set([8]));
        expect(argCountsSeen["map_const"]).toEqual(new Set([3]));
        expect(argCountsSeen["tilecoll"]).toEqual(new Set([4]));
      }

    },
  );
});

// Plan 7 Task 3: line insert/remove primitive. Imports sit next to their describe so the
// pre-existing block above stays byte-unchanged.
import { insertLineAfter, removeLine, locateEventCalls } from "../../../src/gbc/write/asmSplice.js";

describe("insertLineAfter / removeLine (line primitive)", () => {
  /** [start, end) of the n-th (0-based) line's content. */
  function lineSpan(text: string, n: number): [number, number] {
    let start = 0;
    for (let i = 0; i < n; i++) start = text.indexOf("\n", start) + 1;
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    else if (text[end - 1] === "\r") end--;
    return [start, end];
  }

  it("1. insertLineAfter: mid-file, final line with \\n, final line without \\n (exact strings)", () => {
    const t = "a\nb\nc\n";
    expect(insertLineAfter(t, lineSpan(t, 0)[1], "X")).toBe("a\nX\nb\nc\n");
    expect(insertLineAfter(t, lineSpan(t, 2)[1], "X")).toBe("a\nb\nc\nX\n");
    const n = "a\nb\nc";
    expect(insertLineAfter(n, lineSpan(n, 2)[1], "X")).toBe("a\nb\nc\nX");
    expect(insertLineAfter(n, lineSpan(n, 1)[1], "X")).toBe("a\nb\nX\nc");
  });

  it("2. removeLine: middle, last with \\n, last without \\n, only line (exact strings)", () => {
    const t = "a\nb\nc\n";
    expect(removeLine(t, ...lineSpan(t, 1))).toBe("a\nc\n");
    expect(removeLine(t, ...lineSpan(t, 2))).toBe("a\nb\n");
    const n = "a\nb\nc";
    expect(removeLine(n, ...lineSpan(n, 2))).toBe("a\nb");
    expect(removeLine("only", 0, 4)).toBe("");
    expect(removeLine("only\n", 0, 4)).toBe("");
    expect(removeLine(n, ...lineSpan(n, 0))).toBe("b\nc");
  });

  it.each([
    ["LF, final newline", "a\nb\nc\n"],
    ["LF, no final newline", "a\nb\nc"],
    ["CRLF, final newline", "a\r\nb\r\nc\r\n"],
    ["CRLF, no final newline", "a\r\nb\r\nc"],
  ])("3. round-trip inverses both ways: %s", (_name, t) => {
    const eol = t.includes("\r\n") ? "\r\n" : "\n";
    const lines = t.split(/\r?\n/).filter((_, i, a) => !(i === a.length - 1 && a[i] === ""));
    for (let i = 0; i < lines.length; i++) {
      const [s, e] = lineSpan(t, i);
      // insert then remove the inserted line (which is line i+1 of the result)
      const inserted = insertLineAfter(t, e, "NEW");
      expect(inserted.split(eol)).toContain("NEW");
      expect(removeLine(inserted, ...lineSpan(inserted, i + 1))).toBe(t);
      // remove then re-insert after the previous line (not possible for line 0)
      const removed = removeLine(t, s, e);
      if (i > 0) expect(insertLineAfter(removed, lineSpan(removed, i - 1)[1], t.slice(s, e))).toBe(t);
    }
  });

  it("3b. CRLF text inserts CRLF, and an LF-only text never gains \\r", () => {
    expect(insertLineAfter("a\r\nb\r\n", 1, "X")).toBe("a\r\nX\r\nb\r\n");
    expect(insertLineAfter("a\r\nb", 4, "X")).toBe("a\r\nb\r\nX");
    expect(insertLineAfter("a\nb", 3, "X")).toBe("a\nb\nX");
  });

  it("4. refuses a mid-line offset and a line containing \\n or \\r", () => {
    const t = "abc\ndef\n";
    expect(() => insertLineAfter(t, 1, "X")).toThrow(/insertLineAfter/);
    expect(() => insertLineAfter(t, 99, "X")).toThrow(/insertLineAfter/);
    expect(() => insertLineAfter(t, 3, "X\nY")).toThrow(/insertLineAfter/);
    expect(() => insertLineAfter(t, 3, "X\rY")).toThrow(/insertLineAfter/);
    expect(() => removeLine(t, 1, 3)).toThrow(/removeLine/); // lineStart mid-line
    expect(() => removeLine(t, 0, 2)).toThrow(/removeLine/); // lineEnd mid-line
    expect(() => removeLine(t, 0, 7)).toThrow(/removeLine/); // spans two lines
  });
});

describe("locateEventCalls", () => {
  const text = [
    "Foo_MapEvents:",
    "\tdb 0, 0",
    "\tdef_warp_events",
    "\twarp_event 1, 2, A, 1",
    "\twarp_event 3, 4, B, 1",
    "Bar_MapEvents:",
    "\twarp_event 9, 9, C, 1",
  ].join("\n");

  it("5. returns every call in the section, absolute offsets, source order", () => {
    const calls = locateEventCalls(text, "Foo", "warp_event");
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => text.slice(c.lineStart, c.lineEnd))).toEqual(["\twarp_event 1, 2, A, 1", "\twarp_event 3, 4, B, 1"]);
    expect(calls).toEqual([locateEventCall(text, "Foo", "warp_event", 0), locateEventCall(text, "Foo", "warp_event", 1)]);
    expect(locateEventCalls(text, "Foo", "coord_event")).toEqual([]);
    expect(locateEventCalls(text, "Bar", "warp_event")).toHaveLength(1);
  });

  it("5b. refuses a missing label, naming it", () => {
    expect(() => locateEventCalls(text, "Nope", "warp_event")).toThrow(/Nope_MapEvents/);
  });
});

describe("lone CR is not a line terminator (codeLines only splits on \n / \r\n)", () => {
  it("4b. insertLineAfter and removeLine refuse a lone-CR line end instead of mis-splicing", () => {
    expect(() => insertLineAfter("a\nb\r", 3, "X")).toThrow(/insertLineAfter/); // lone CR at EOF
    expect(() => insertLineAfter("a\rb\n", 1, "X")).toThrow(/insertLineAfter/); // lone CR mid-file
    expect(() => removeLine("a\nb\r", 2, 3)).toThrow(/removeLine/);
    expect(() => removeLine("x\ny\rz\n", 2, 3)).toThrow(/removeLine/);
  });
});
