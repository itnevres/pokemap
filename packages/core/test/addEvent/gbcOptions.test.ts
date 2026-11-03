import { beforeAll, expect, it } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGbcEventOptions, gbcWarpCapable, gbcEventQuarter, gbcTileWarpCapable } from "../../src/addEvent/gbcOptions.js";
import { entryPointsFor } from "../../src/addEvent/entryPoints.js";
import { subjectSnapshot } from "../helpers/subjectSnapshot.js";
const { gbc } = subjectSnapshot();
const corpus = it.skipIf(!gbc);
let options: ReturnType<typeof loadGbcEventOptions>;
beforeAll(() => { if (gbc) options = loadGbcEventOptions(gbc); });
const read = (p: string) => readFileSync(join(gbc!, p), "utf8");
corpus("sprites has SPRITE_YOUNGSTER", () => {
  expect(options.sprites).toContain("SPRITE_YOUNGSTER");
});
corpus("items has POTION", () => {
  expect(options.items).toContain("POTION");
});
corpus("bgTypes lacks BGEVENT_COPY", () => {
  expect(options.bgTypes).toContain("BGEVENT_READ");
  expect(options.bgTypes).not.toContain("BGEVENT_COPY");
});
corpus("palettes starts with 0", () => {
  expect(options.palettes[0]).toBe("0");
});
corpus("GBC objectCap is 15", () => {
  expect(options.objectCap).toBe(15);
});
corpus("Route29 entry points include ObjectEvent and NPC but exclude Route29Potion data and MapScripts", () => {
  const entries = entryPointsFor("gbc", gbc!, "Route29", read("maps/Route29.asm"));
  expect(entries).toContain("ObjectEvent");
  expect(entries).toContain("Route29YoungsterScript");
  expect(entries).not.toContain("Route29Potion");
  expect(entries).not.toContain("Route29_MapScripts");
  const foreign = read("maps/CherrygroveCity.asm");
  const foreignScript = [...foreign.matchAll(/^(\w+Script):/gm)][0]![1]!;
  expect(entries).not.toContain(foreignScript);
});
it("bank rule excludes other map files even in the same SECTION and accepts own file and home", () => {
  const root = mkdtempSync(join(tmpdir(), "pokemap-bank-rule-"));
  try {
    mkdirSync(join(root, "maps")); mkdirSync(join(root, "home"));
    const event = (label: string) => `\tbg_event 0, 0, BGEVENT_READ, ${label}\n`;
    const own = 'SECTION "Same", ROMX\nOwnScript:\n\tend\n' + event("OwnScript") + event("HomeScript") + event("SameScript") + event("OtherScript");
    writeFileSync(join(root, "maps/Own.asm"), own);
    writeFileSync(join(root, "maps/Same.asm"), 'SECTION "Same", ROMX\nSameScript:\n\tend\n' + event("SameScript"));
    writeFileSync(join(root, "maps/Other.asm"), 'SECTION "Other", ROMX\nOtherScript:\n\tend\n' + event("OtherScript"));
    writeFileSync(join(root, "home/events.asm"), 'HomeScript::\n\tend\n');
    const entries = entryPointsFor("gbc", root, "Own", own);
    expect(entries).toContain("OwnScript"); expect(entries).toContain("HomeScript");
    expect(entries).not.toContain("SameScript"); expect(entries).not.toContain("OtherScript");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it("even x odd y selects bottom-left and tileInfo warpCapable follows only that quarter", () => {
  const names = new Map([[0, "COLL_FLOOR"], [0x71, "COLL_DOOR"]]);
  const collisions = [0, 0, 0x71, 0];
  expect(gbcEventQuarter(2, 3)).toBe(2);
  const tileInfo = { x: 2, y: 3, warpCapable: gbcTileWarpCapable(collisions, 2, 3, names) };
  expect(tileInfo).toEqual({ x: 2, y: 3, warpCapable: true });
  expect(gbcTileWarpCapable(collisions, 2, 2, names)).toBe(false);
  expect(gbcTileWarpCapable(collisions, 3, 2, names)).toBe(false);
  expect(gbcTileWarpCapable(collisions, 3, 3, names)).toBe(false);
  expect(gbcTileWarpCapable([0x71, 0, 0, 0], 2, 3, names)).toBe(false);
});
corpus("GBC warp predicate accepts door and ladder but rejects floor", () => {
  const names = new Map([...read("constants/collision_constants.asm").matchAll(/DEF\s+(COLL_\w+)\s+EQU\s+\$([0-9a-f]+)/gi)]
    .map(m => [parseInt(m[2]!, 16), m[1]!]));
  const value = (name: string) => [...names].find(([, n]) => n === name)![0];
  expect(gbcWarpCapable(value("COLL_DOOR"), names)).toBe(true);
  expect(gbcWarpCapable(value("COLL_FLOOR"), names)).toBe(false);
  expect(gbcWarpCapable(value("COLL_LADDER"), names)).toBe(true);
});
