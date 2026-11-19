import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

// A complete, deterministic project. Every call owns a fresh directory.
export function makeGbaFixture(triple = false, aliases = false): string {
  const root = mkdtempSync(join(tmpdir(), "pokemap-gba-block-"));
  const put = (p: string, data: string | Buffer) => { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); };
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type); let crc = 0xffffffff;
    for (const b of Buffer.concat([name, data])) { crc ^= b; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, name, data, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(128, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 3;
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("PLTE", Buffer.from([0, 0, 0])), chunk("IDAT", deflateSync(Buffer.alloc(129 * 8))), chunk("IEND", Buffer.alloc(0))]);
  put("include/fieldmap.h", `#define NUM_TILES_IN_PRIMARY 12\n#define NUM_TILES_IN_PRIMARY_EMERALD 8\n#define NUM_METATILES_IN_PRIMARY 12\n#define NUM_METATILES_IN_PRIMARY_EMERALD 8\n#define NUM_PALS_IN_PRIMARY 3\n#define NUM_PALS_IN_PRIMARY_EMERALD 2\n#define NUM_METATILES_TOTAL 32\n`);
  put("porymap.project.cfg", `base_game_version=pokeemerald\nenable_triple_layer_metatiles=${triple ? 1 : 0}\n`);
  let headers = "", metas = "", graphics = "";
  for (const [name, count, pals] of [["A", 4, 13], ["B", 4, 13], ["S", 3, 5], ["T", 3, 16]] as const) {
    const dir = `data/tilesets/${name}`; const art = `graphics/tilesets/${name}`;
    headers += `const struct Tileset gTileset_${name} = {\n.isSecondary = ${name === "S" || name === "T" ? "TRUE" : "FALSE"},\n.metatiles = gMeta${name},\n.metatileAttributes = gAttr${name},\n.tiles = gTiles${name},\n.palettes = gPals${name},\n};\n`;
    metas += `const u16 gMeta${name}[] = INCBIN_U16("${dir}/metatiles.bin");\nconst u16 gAttr${name}[] = INCBIN_U16("${dir}/attributes.bin");\n`;
    graphics += `const u16 gTiles${name}[] = INCBIN_U16("${art}/tiles.4bpp.lz");\nconst u16 gPals${name}[][16] = { ${Array.from({ length: pals }, (_, i) => `INCBIN_U16("${dir}/${i}.gbapal")`).join(", ")} };\n`;
    put(`${art}/tiles.png`, png);
    for (let i = 0; i < pals; i++) put(`${dir}/${i}.pal`, `JASC-PAL\n0100\n1\n0 0 0\n`);
    const blocks = Buffer.alloc(count * 16), attrs = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++) { for (let j = 0; j < 8; j++) blocks.writeUInt16LE((i + j) % 4, i * 16 + j * 2); attrs.writeUInt16LE(i === 1 ? 0x0a12 : 0x0021, i * 2); }
    if (name === "A") { blocks.writeUInt16LE(0xd009, 2 * 16); blocks.writeUInt16LE(0xe00a, 2 * 16 + 2); blocks.writeUInt16LE(0xf00b, 2 * 16 + 4); }
    put(`${dir}/metatiles.bin`, blocks); put(`${dir}/attributes.bin`, attrs);
  }
  if (aliases) {
    for (const name of ["A2", "A3", "A4"] as const) {
      const dir = `data/tilesets/${name}`, art = `graphics/tilesets/${name}`;
      headers += `const struct Tileset gTileset_${name} = {\n.isSecondary = FALSE,\n.metatiles = gMeta${name},\n.metatileAttributes = gAttr${name},\n.tiles = gTiles${name},\n.palettes = gPals${name},\n};\n`;
      metas += `const u16 gMeta${name}[] = INCBIN_U16("data/tilesets/${name === "A2" ? "A" : name === "A4" ? "A3" : name}/metatiles.bin");\nconst u16 gAttr${name}[] = INCBIN_U16("data/tilesets/${name === "A4" ? "A4" : "A"}/attributes.bin");\n`;
      graphics += `const u16 gTiles${name}[] = INCBIN_U16("${art}/tiles.4bpp.lz");\nconst u16 gPals${name}[][16] = { ${Array.from({ length: 13 }, (_, i) => `INCBIN_U16("${dir}/${i}.gbapal")`).join(", ")} };\n`;
      const header = Buffer.from(ihdr); header.writeUInt32BE(name === "A2" ? 64 : 128, 0);
      put(`${art}/tiles.png`, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("PLTE", Buffer.from([8, 0, 0])), chunk("IDAT", deflateSync(Buffer.alloc((name === "A2" ? 65 : 129) * 8))), chunk("IEND", Buffer.alloc(0))]));
      for (let i = 0; i < 13; i++) put(`${dir}/${i}.pal`, `JASC-PAL\n0100\n1\n8 0 0\n`);
      if (name === "A4") put(`${dir}/attributes.bin`, Buffer.alloc(4 * 2));
      if (name === "A3") {
        const blocks = Buffer.alloc(4 * 16);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) blocks.writeUInt16LE((i + j) % 4, i * 16 + j * 2);
        put(`${dir}/metatiles.bin`, blocks);
      }
    }
  }
  put("src/data/tilesets/headers.h", headers); put("src/data/tilesets/metatiles.h", metas); put("src/data/tilesets/graphics.h", graphics); put("src/graphics.c", "");
  const layouts: (readonly [string, string, string, string, string])[] = [
    ["E", "emerald", "A", "S", "Emerald"], ["F", "frlg", "A", "S", "Frlg"],
    ["O", "emerald", "B", "S", "Other"], ["X", "emerald", "A", "T", "Extra"],
    ["H", "emerald", "A", "T", "Shared"],
  ];
  if (aliases) layouts.push(["J", "frlg", "A2", "B", "AliasTwo"], ["K", "emerald", "A3", "B", "AliasThree"], ["L", "emerald", "A4", "B", "AliasFour"], ["M", "emerald", "A", "A2", "AliasBoth"]);
  put("data/layouts/layouts.json", JSON.stringify({ layouts_table_label: "gLayouts", layouts: layouts.map(([id, version, primary, secondary]) => ({ id, name: id, width: 2, height: 2, layout_version: version, primary_tileset: `gTileset_${primary}`, secondary_tileset: `gTileset_${secondary}`, blockdata_filepath: `data/layouts/${id}/map.bin`, border_filepath: `data/layouts/${id}/border.bin` })) }));
  const maps: string[] = [];
  for (const [id, , , , map] of layouts) {
    const values = id === "J" ? [3, 3, 0, 0] : id === "K" ? [2, 2, 0, 0] : [1, 1, id === "F" ? 13 : 9, 0];
    const cells = Buffer.alloc(8); values.forEach((v, i) => cells.writeUInt16LE(v | (i === 0 || i === 2 ? 0x5800 : 0), i * 2));
    const border = Buffer.alloc(8); [id === "J" || id === "K" ? 0 : 1, 0, 0, 0].forEach((v, i) => border.writeUInt16LE(v, i * 2));
    put(`data/layouts/${id}/map.bin`, cells); put(`data/layouts/${id}/border.bin`, border);
    for (const n of id === "H" ? ["SharedA", "SharedB"] : [map]) { maps.push(n); put(`data/maps/${n}/map.json`, JSON.stringify({ id: n, name: n, layout: id })); }
  }
  if (aliases) {
    const cells = Buffer.alloc(8); [0, 8, 0, 8].forEach((v, i) => cells.writeUInt16LE(v | (i === 0 || i === 2 ? 0x5800 : 0), i * 2));
    put("data/layouts/M/map.bin", cells); put("data/layouts/M/border.bin", Buffer.alloc(8));
  }
  put("data/maps/map_groups.json", JSON.stringify({ group_order: ["main"], main: maps }));
  return root;
}
