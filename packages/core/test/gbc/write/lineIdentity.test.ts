import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { addGbcEvent, eventInsertAnchor, type GbcEventKind } from "../../../src/gbc/edit/events.js";
import { parseMapEvents } from "../../../src/gbc/load/events.js";
import { openGbcProject } from "../../../src/gbc/project.js";
import { insertLineAfter, locateEventCalls, removeLine } from "../../../src/gbc/write/asmSplice.js";
import { gbcCorpusRoots, GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";

// Part C of Plan 7 Task 3: the line primitive and the add op, proven over every real map
// file. Read-only: every text is read into memory, nothing is written anywhere.

const KINDS: { kind: GbcEventKind; macro: string }[] = [
  { kind: "warp", macro: "warp_event" },
  { kind: "coord", macro: "coord_event" },
  { kind: "bg", macro: "bg_event" },
  { kind: "object", macro: "object_event" },
];

const ADD_ARGS: Record<GbcEventKind, string[]> = {
  warp: ["0", "0", "SOME_MAP", "1"],
  coord: ["0", "0", "SCENE_X", "ScriptX"],
  bg: ["0", "0", "BGEVENT_READ", "X"],
  object: ["0", "0", "SPRITE_X", "SPRITEMOVEDATA_STILL", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", "ScriptX", "-1"],
};

/** `parseMapEvents` output with the (shifting) source line indices dropped. */
const bare = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === "lineIndex" ? undefined : x)));

describe("corpus line identity (G5-style): insert/remove are exact inverses on every real map file", () => {
  itWithGbcCorpus(
    "every maps/<Name>.asm, all 4 kinds: insert+remove and remove+reinsert are byte-identical; a bg add is exactly +1 bg",
    () => {
      for (const root of gbcCorpusRoots()) {
        const maps = openGbcProject(root).maps;
        if (root === GBC_SUBJECT_ROOT) expect(maps).toHaveLength(391);

        const failures: string[] = [];
        let insertRemove = 0;
        let removeReinsert = 0;
        let adds = 0;
        const skippedObjectAdds: string[] = [];

        for (const map of maps) {
          const text = readFileSync(`${root}/maps/${map.name}.asm`, "utf8");
          const before = parseMapEvents(text, map.name);
          const eol = text.includes("\r\n") ? "\r\n" : "\n";

          for (const { kind, macro } of KINDS) {
            const where = `${root} ${map.name} ${kind}`;

            // 1. Anchor as addGbcEvent would; insert a synthetic line, remove it again.
            const anchor = eventInsertAnchor(text, map.name, kind);
            const inserted = insertLineAfter(text, anchor, "\tSYNTHETIC_LINE 1, 2");
            const atEof = anchor === text.length;
            const termLen = atEof ? eol.length : text.startsWith("\r\n", anchor) ? 2 : 1;
            const newStart = anchor + termLen;
            if (removeLine(inserted, newStart, newStart + "\tSYNTHETIC_LINE 1, 2".length) !== text) failures.push(`${where}: insert+remove != original`);
            if (atEof && inserted.endsWith("\n")) failures.push(`${where}: insert at EOF added a final newline`);
            insertRemove++;

            // 2. Remove the last call, put it back after the previous line.
            const calls = locateEventCalls(text, map.name, macro);
            const last = calls[calls.length - 1];
            if (last) {
              const removed = removeLine(text, last.lineStart, last.lineEnd);
              const prevEnd = last.lineStart - (text.startsWith("\r\n", last.lineStart - 2) ? 2 : 1);
              if (insertLineAfter(removed, prevEnd, text.slice(last.lineStart, last.lineEnd)) !== text) failures.push(`${where}: remove+reinsert != original`);
              removeReinsert++;
            }

            // 3. The add op itself: +1 of this kind, nothing else changed (modulo line indices).
            const paired = before.objectConsts.length > 0;
            if (kind === "object" && (before.objects.length >= 15 || (paired && before.objectConsts.length !== before.objects.length))) {
              skippedObjectAdds.push(map.name);
              continue;
            }
            const key = ({ warp: "warps", coord: "coords", bg: "bgs", object: "objects" } as const)[kind];
            const edit = addGbcEvent(text, map.name, kind, ADD_ARGS[kind]);
            adds++;
            const after = edit.events;
            if (after[key].length !== before[key].length + 1) failures.push(`${where}: add did not give exactly +1`);
            if (JSON.stringify(bare(after[key].slice(0, -1))) !== JSON.stringify(bare(before[key]))) failures.push(`${where}: existing ${key} changed`);
            for (const other of ["warps", "coords", "bgs", "objects", "sceneScripts", "callbacks"] as const) {
              if (other !== key && JSON.stringify(bare(after[other])) !== JSON.stringify(bare(before[other]))) failures.push(`${where}: ${other} changed`);
            }
            const wantConsts = kind === "object" && paired ? before.objectConsts.length + 1 : before.objectConsts.length;
            if (after.objectConsts.length !== wantConsts) failures.push(`${where}: objectConsts ${before.objectConsts.length} -> ${after.objectConsts.length}`);
          }
        }

        expect(failures).toEqual([]);
        expect(insertRemove).toBe(maps.length * 4);
        if (root === GBC_SUBJECT_ROOT) expect(skippedObjectAdds).toEqual(["GoldenrodCity", "MoveDeletersHouse"]); // 15 objects; 1 const for 2 objects
        if (root === GBC_SUBJECT_ROOT) expect([removeReinsert, adds]).toEqual([1000, 1562]); // kinds with >= 1 call; 1564 minus the 2 skipped object adds
      }
    },
    120_000,
  );
});
