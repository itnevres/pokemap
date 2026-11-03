import { beforeAll, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { loadGbaEventOptions, freeGbaSlots, gbaWarpBehavior } from "../../src/addEvent/gbaOptions.js";
import { entryPointsFor } from "../../src/addEvent/entryPoints.js";
import { subjectSnapshot } from "../helpers/subjectSnapshot.js";
const { gba } = subjectSnapshot();
const corpus = it.skipIf(!gba);
let options: ReturnType<typeof loadGbaEventOptions>;
beforeAll(() => { if (gba) options = loadGbaEventOptions(gba); });
const texts = new Map<string, string>();
function readSource(path: string): string {
  let text = texts.get(path);
  if (text === undefined) { text = readFileSync(path, "utf8"); texts.set(path, text); }
  return text;
}
const read = (p: string) => readSource(join(gba!, p));
const fileLists = new Map<string, string[]>();
function files(root: string): string[] {
  const cached = fileLists.get(root);
  if (cached) return cached;
  const result = readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(root, e.name)) :
    e.isFile() && [".c", ".h", ".inc", ".s", ".json"].includes(extname(e.name)) ? [join(root, e.name)] : []);
  fileLists.set(root, result);
  return result;
}
corpus("sprites has OBJ_EVENT_GFX_YOUNGSTER", () => {
  expect(options.sprites).toContain("OBJ_EVENT_GFX_YOUNGSTER");
});
corpus("no option list contains sentinels or function-like header macros", () => {
  const macros = files(join(gba!, "include/constants")).flatMap(p => [...readSource(p)
    .matchAll(/^\s*#define\s+(\w+)\(/gm)].map(m => m[1]!));
  expect(macros.length).toBeGreaterThan(0);
  for (const [key, value] of Object.entries(options)) if (key !== "maps" && Array.isArray(value)) for (const entry of value) {
    const n = typeof entry === "string" ? entry : entry.id;
    expect(n).not.toMatch(/^NUM_|_COUNT$|_START$|_END$/);
    expect(macros).not.toContain(n);
  }
});
corpus("maps preserves real END names and excludes NUM and COUNT sentinels", () => {
  expect(options.maps).toContain("MarineCave_End");
  expect(options.maps).toContain("Route101");
  for (const name of options.maps) expect(name).not.toMatch(/^NUM_|_COUNT$/);
});
corpus("objectCap is OBJECT_EVENT_TEMPLATES_COUNT 64", () => {
  expect(read("include/constants/global.h")).toMatch(/#define\s+OBJECT_EVENT_TEMPLATES_COUNT\s+64\b/);
  expect(options.objectCap).toBe(64);
});
corpus("VAR slots equal unused defines with zero outside-header references and exclude referenced names", () => {
  const header = normalize(join(gba!, "include/constants/vars.h"));
  const names = [...readSource(header).matchAll(/^\s*#define\s+(VAR_UNUSED_\w+)\s/gm)].map(m => m[1]!);
  const references = new Set<string>();
  for (const p of ["src", "include", "data"].flatMap(d => files(join(gba!, d)))) {
    if (normalize(p) === header) continue;
    // Independent plain grep: one whole-token pass, not one pass per candidate.
    for (const match of readSource(p).matchAll(/\bVAR_UNUSED_\w+\b/g)) references.add(match[0]);
  }
  const referenced = names.filter(n => references.has(n));
  const expected = names.filter(n => !references.has(n));
  const actual = freeGbaSlots(gba!, "VAR");
  expect(referenced.length).toBeGreaterThan(0);
  expect(expected.length).toBeGreaterThan(0);
  expect([...actual].sort()).toEqual(expected.sort());
  for (const name of referenced) expect(actual).not.toContain(name);
});
corpus("facings equals header BG_EVENT_PLAYER_FACING constants", () => {
  const expected = [...read("include/constants/event_bg.h").matchAll(/^#define\s+(BG_EVENT_PLAYER_FACING_\w+)\s/gm)].map(m => m[1]!);
  expect(expected.length).toBeGreaterThan(0);
  expect(options.facings).toEqual(expected);
});
corpus("entry points include Route101 Youngster and exclude Littleroot map table and movement", () => {
  const entries = entryPointsFor("gba", gba!, "Route101", read("data/maps/Route101/scripts.inc"));
  expect(entries).toContain("Route101_EventScript_Youngster");
  expect(entries).toContain("0x0");
  expect(entries).not.toContain("LittlerootTown_MapScripts");
  const text = read("data/maps/LittlerootTown/scripts.inc");
  const movement = [...text.matchAll(/^(\w*Movement\w*)::?/gm)].map(m => m[1]!);
  expect(movement.length).toBeGreaterThan(0);
  for (const name of movement) expect(entries).not.toContain(name);
});
corpus("GBA warp predicate accepts door, custom stair and arrow but rejects normal", () => {
  const b = Object.fromEntries([...read("include/constants/metatile_behaviors.h")
    .matchAll(/^#define\s+(MB_\w+)\s+(0x[0-9a-f]+|\d+)\b/gmi)].map(m => [m[1]!, Number(m[2])]));
  expect(gbaWarpBehavior(b.MB_ANIMATED_DOOR!, b)).toBe(true);
  expect(gbaWarpBehavior(b.MB_NORMAL!, b)).toBe(false);
  expect(gbaWarpBehavior(b.MB_UP_LEFT_STAIR_WARP!, b)).toBe(true);
  expect(gbaWarpBehavior(b.MB_EAST_ARROW_WARP!, b)).toBe(true);
});

corpus("GBA bgTypes exactly matches map.json event type values", () => {
  expect(options.bgTypes).toEqual(["sign", "hidden_item", "secret_base"]);
});
corpus("GBA item options contain real IDs and exclude item-use categories", () => {
  expect(options.items).toContain("ITEM_POTION");
  expect(options.items).not.toContain("ITEM_USE_MAIL");
  expect(options.items).not.toContain("ITEM_B_USE_MEDICINE");
});
corpus("GBA secret-base options contain entrance IDs and exclude grouping constants", () => {
  expect(options.secretBases).toContain("SECRET_BASE_RED_CAVE1_1");
  expect(options.secretBases).not.toContain("SECRET_BASE_RED_CAVE1");
  expect(options.secretBases).not.toContain("SECRET_BASE_RED_CAVE");
});
