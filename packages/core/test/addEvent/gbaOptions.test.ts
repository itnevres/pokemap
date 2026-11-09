import { beforeAll, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { loadGbaEventOptions, freeGbaSlots, gbaDefineValues, gbaWarpBehavior } from "../../src/addEvent/gbaOptions.js";
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

// Conductor ruling R2: a slot is free only when unreferenced outside its own #define line (header included),
// not aliasing another define's value, and outside the temp, daily and special (unsaved) ranges.
it("R2: free slots on a hand-written project exclude header references, aliases, ranges and unevaluable values", () => {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gba-slots-"));
  try {
    mkdirSync(join(dir, "include/constants"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "include/constants/flags.h"), [
      "#define TEMP_FLAGS_START 0x0",
      "#define FLAG_UNUSED_0x1 0x1",
      "#define TEMP_FLAGS_END 0x1F",
      "#define FLAG_REAL 0x30",
      "#define FLAG_UNUSED_0x30 0x30",
      "#define FLAG_UNUSED_0x31 0x31",
      "#define FLAG_UNUSED_0x32 0x32",
      "#define FLAG_UNUSED_0x33 0x33",
      "#define DAILY_FLAGS_START (FLAG_UNUSED_0x33 + (8 - FLAG_UNUSED_0x33 % 8))",
      "#define FLAG_UNUSED_0x3A (DAILY_FLAGS_START + 0x2)",
      "#define DAILY_FLAGS_END (DAILY_FLAGS_START + 0x7)",
      "#define FLAG_UNUSED_0x40 (0x80 / 2)",
      "#define FLAG_UNUSED_0x41 (FLAG_REAL + 0x11)",
      "#define FLAG_UNUSED_0x42 042",
      "#define SPECIAL_FLAGS_START 0x4000",
      "#define FLAG_UNUSED_0x4001 (SPECIAL_FLAGS_START + 1)",
      "#define SPECIAL_FLAGS_END (SPECIAL_FLAGS_START + 0x7F)", ""].join("\n"));
    writeFileSync(join(dir, "include/constants/vars.h"), [
      "#define TEMP_VARS_START 0x4000",
      "#define VAR_UNUSED_0x4001 (TEMP_VARS_START + 0x1)",
      "#define TEMP_VARS_END (TEMP_VARS_START + 0xF)",
      "#define VAR_UNUSED_0x4050 0x4050",
      "#define VAR_REAL 0x4051",
      "#define VAR_UNUSED_0x4051 0x4051",
      "#define SPECIAL_VARS_START 0x8000",
      "#define VAR_UNUSED_0x8014 0x8014",
      "#define SPECIAL_VARS_END 0x8015", ""].join("\n"));
    writeFileSync(join(dir, "src/a.c"), "void f(void) { FlagSet(FLAG_UNUSED_0x32); }\n");
    // 0x1 temp; 0x30 aliases FLAG_REAL; 0x32 used in src; 0x33 used by DAILY_FLAGS_START; 0x3A daily (0x38..0x3F);
    // 0x40 uses division (not evaluated); 0x42 is an octal literal (not evaluated); 0x4001 special (unsaved).
    expect(freeGbaSlots(dir, "FLAG")).toEqual(["FLAG_UNUSED_0x31", "FLAG_UNUSED_0x41"]);
    // 0x4001 temp; 0x4051 aliases VAR_REAL; 0x8014 special.
    expect(freeGbaSlots(dir, "VAR")).toEqual(["VAR_UNUSED_0x4050"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("gbaDefineValues evaluates + - * % arithmetic through included headers and refuses the rest", () => {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gba-defs-"));
  try {
    mkdirSync(join(dir, "include/constants"), { recursive: true });
    writeFileSync(join(dir, "include/constants/opponents.h"), "#define MAX_TRAINERS_COUNT 0x10\n");
    const values = gbaDefineValues(dir, ["#include \"constants/opponents.h\"", "#define A 0x10", "#define B (A * 3 - 1) // c",
      "#define C (B % 7)", "#define D (MAX_TRAINERS_COUNT + A)", "#define E (A / 2)", "#define F 010", "#define G H", "#define H G",
      "#define I UNKNOWN_NAME", "#define J (A << 1)"].join("\n"));
    expect(Object.fromEntries(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map(n => [n, values.get(n)]))).toEqual({
      A: 16, B: 47, C: 5, D: 32, E: undefined, F: undefined, G: undefined, H: undefined, I: undefined, J: undefined });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
corpus("R2: subject FLAG slots skip the 0x296 alias, the DAILY_FLAGS_* sentinels' slots and the daily range", () => {
  const free = freeGbaSlots(gba!, "FLAG");
  expect(free.length).toBeGreaterThan(0);
  // flags.h:706 FLAG_UNUSED_0x296 0x296 aliases flags.h:709 FLAG_SHINY_STARTER_3 0x296.
  expect(read("include/constants/flags.h")).toMatch(/#define\s+FLAG_SHINY_STARTER_3\s+0x296\b/);
  expect(free[0]).not.toBe("FLAG_UNUSED_0x296");
  expect(free).not.toContain("FLAG_UNUSED_0x296");
  // flags.h:1647 DAILY_FLAGS_START uses FLAG_UNUSED_0x91F; flags.h:1720 DAILY_FLAGS_END uses FLAG_UNUSED_0x95F.
  expect(free).not.toContain("FLAG_UNUSED_0x91F");
  expect(free).not.toContain("FLAG_UNUSED_0x95F");
  // Daily flags are written as (DAILY_FLAGS_START + n) in flags.h:1648-1719; none may be offered.
  const daily = [...read("include/constants/flags.h").matchAll(/^#define\s+(FLAG_\w+)\s+\(DAILY_FLAGS_START\s*\+\s*0x[\da-f]+\)/gmi)]
    .map(m => m[1]!);
  expect(daily.filter(n => n.startsWith("FLAG_UNUSED_")).length).toBeGreaterThan(0);
  for (const name of daily) expect(free).not.toContain(name);
  // Hand-derived (the slot names' hex is the vanilla numbering, not the value here): TRAINER_FLAGS_START 0x500 +
  // MAX_TRAINERS_COUNT 1408 (opponents.h) - 1 = TRAINER_FLAGS_END 0xA7F, SYSTEM_FLAGS 0xA80, FLAG_UNUSED_0x91F 0xB3F,
  // DAILY_FLAGS_START 0xB3F + (8 - 7) = 0xB40, FLAG_UNUSED_0x95F 0xB7F, DAILY_FLAGS_END 0xB7F + (7 - 7) = 0xB7F.
  const values = gbaDefineValues(gba!, read("include/constants/flags.h"));
  expect([values.get("DAILY_FLAGS_START"), values.get("DAILY_FLAGS_END"), values.get("FLAG_HIDDEN_ITEMS_START")]).toEqual([0xb40, 0xb7f, 0x1f4]);
  for (const name of free) expect(values.get(name)! < 0xb40 || values.get(name)! > 0xb7f).toBe(true);
});

corpus("unused flag and var definitions are excluded from existing options", () => {
  expect(options.flags.some(name => name.includes("_UNUSED_"))).toBe(false);
  expect(options.vars.some(name => name.includes("_UNUSED_"))).toBe(false);
});
