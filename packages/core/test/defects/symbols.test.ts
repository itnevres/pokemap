import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGbaSymbolIndex, buildGbcSymbolIndex, resolvesAll } from "../../src/defects/symbols.js";

const roots: string[] = [];
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "pokemap-symbols-"));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("indexes only the specified GBA sources and ignores comments", () => {
  const idx = buildGbaSymbolIndex(fixture({
    "data/maps/A/scripts.inc": "Script::\n// Fake::\n/*\nComment::\n*/\n",
    "data/scripts.s": "Global:\n",
    "include/constants/objects.h": "#define OBJ_EVENT_GFX_BOY 1\n#define SPECIES_MACHAMP 68\n",
    "src/ignored.inc": "Ignored::\n", "data/maps/A/ignored.s": "NestedS::\n",
  }));
  expect([...idx.labels].sort()).toEqual(["Global", "Script"]);
  expect(resolvesAll("OBJ_EVENT_GFX_BOY + SPECIES_MACHAMP", idx)).toBe(true);
  expect(resolvesAll("OBJ_EVENT_GFX_BOY + UNKNOWN", idx)).toBe(false);
});
it("indexes RGBDS labels, DEF/EQU, const and map_const without macro bodies", () => {
  const idx = buildGbcSymbolIndex(fixture({ "maps/A.asm": `Global::
.Local:
DEF FLAG EQU 1
OLD EQU 2
 const_def
 const SPRITE_BOY
 map_const TOWN, 1, 1
MACRO fake
Ghost:
 const GHOST
ENDM
; Comment:
` }));
  expect(idx.labels.has("Global")).toBe(true);
  expect(idx.labels.has("Global.Local")).toBe(true);
  expect([...idx.constants].sort()).toEqual(["FLAG", "OLD", "SPRITE_BOY", "TOWN"]);
  expect(idx.labels.has("Ghost")).toBe(false);
});
it("numeric literals resolve without treating radix digits as identifiers", () => {
  const idx = { labels: new Set<string>(), constants: new Set<string>() };
  for (const expr of ["0", "-1", "0xFF", "$ff", "%101", "0b101", "123"]) expect(resolvesAll(expr, idx)).toBe(true);
  expect(resolvesAll("MISSING + 0xFF", idx)).toBe(false);
});

it("qualified local labels do not replace the current global scope", () => {
  const idx = buildGbcSymbolIndex(fixture({ "maps/A.asm": "Global:\nGlobal.First:\n.Second:\nNext:\n.Local:\n" }));
  expect([...idx.labels]).toEqual(["Global", "Global.First", "Global.Second", "Next", "Next.Local"]);
});
