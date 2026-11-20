// Independent block-usage oracle for PokeMap live acceptance.
// Plain node, no deps. Reads only the decomp/disassembly clones' data files.
import fs from 'node:fs';
import path from 'node:path';

const GBA = 'C:/Users/Serve/AppData/Local/Temp/claude/8fd0350c313cb955/2d4175d4-8548-424b-acd0-e63f1b320a9f/scratchpad/live/gba';
const GBC = 'C:/Users/Serve/AppData/Local/Temp/claude/8fd0350c313cb955/2d4175d4-8548-424b-acd0-e63f1b320a9f/scratchpad/live/gbc';

const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const parseNum = (s) =>
  s.startsWith('$') ? parseInt(s.slice(1), 16)
  : s.startsWith('0x') ? parseInt(s.slice(2), 16)
  : parseInt(s, 10);

function summarize(title, thisMap, rows, extra = []) {
  const self = rows.find((r) => r.name === thisMap) ?? { interior: 0, border: 0 };
  const others = rows.filter((r) => r.name !== thisMap);
  const withHits = others.filter((r) => r.interior + r.border > 0);
  const oiInt = others.reduce((a, r) => a + r.interior, 0);
  const oiBor = others.reduce((a, r) => a + r.border, 0);
  console.log(`== ${title}`);
  for (const line of extra) console.log(line);
  console.log(`this map ${thisMap}: ${self.interior} interior, ${self.border} border => ${self.interior + self.border}`);
  console.log(`other maps total: ${oiInt + oiBor} (interior ${oiInt}, border ${oiBor}); other maps with count>0: ${withHits.length}`);
  for (const r of withHits.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`${r.name}: interior ${r.interior}, border ${r.border}`);
  }
  console.log('');
}

// ---------- GBA ----------
function gbaCase(thisMap, tilesetSym, blockId) {
  const mt = {};
  for (const m of rd(GBA, 'src/data/tilesets/metatiles.h').matchAll(/(gMetatiles_\w+)\[\]\s*=\s*INCBIN_U16\("([^"]+)"\)/g)) {
    mt[m[1]] = m[2];
  }
  const tsFile = {};
  for (const m of rd(GBA, 'src/data/tilesets/headers.h').matchAll(/const struct Tileset (gTileset_\w+)\s*=\s*\{([^}]*)\}/g)) {
    const mm = m[2].match(/\.metatiles\s*=\s*(gMetatiles_\w+)/);
    if (mm) tsFile[m[1]] = mt[mm[1]];
  }
  const target = tsFile[tilesetSym];
  const extra = [`target ${tilesetSym} metatiles: ${target}`, `block id ${blockId} < 512 -> primary tileset rule`];
  if (blockId >= 0x200) throw new Error('only primary ids handled');

  const layouts = new Map(JSON.parse(rd(GBA, 'data/layouts/layouts.json')).layouts.map((l) => [l.id, l]));
  const countU16 = (rel) => {
    const b = fs.readFileSync(path.join(GBA, rel));
    let n = 0;
    for (let i = 0; i + 1 < b.length; i += 2) if ((b.readUInt16LE(i) & 0x3ff) === blockId) n++;
    return n;
  };
  const rows = [];
  let thisLayout = null;
  for (const d of fs.readdirSync(path.join(GBA, 'data/maps'))) {
    const mf = path.join(GBA, 'data/maps', d, 'map.json');
    if (!fs.existsSync(mf)) continue;
    const mj = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const lay = layouts.get(mj.layout);
    if (!lay) { extra.push(`skip ${mj.name}: no layout ${mj.layout}`); continue; }
    if (mj.name === thisMap) thisLayout = lay.id;
    const same = tsFile[lay.primary_tileset] === target;
    let interior = 0, border = 0;
    if (same) {
      interior = countU16(lay.blockdata_filepath);
      border = countU16(lay.border_filepath);
    }
    rows.push({ name: mj.name, interior, border, layout: lay.id });
  }
  const sharers = rows.filter((r) => r.layout === thisLayout).map((r) => r.name);
  extra.push(`this map layout ${thisLayout}; maps sharing that layout: ${sharers.join(', ')}`);
  summarize(`GBA-1 block 0x${blockId.toString(16).padStart(3, '0')} in ${tilesetSym}`, thisMap, rows, extra);
}

// ---------- GBC ----------
function gbcCase(thisMap, blockId) {
  // tileset constant -> index (from the "; NN" comment, else sequential)
  const tsIndex = {};
  let seq = 0;
  for (const line of rd(GBC, 'constants/tileset_constants.asm').split('\n')) {
    const m = line.match(/^\s*const\s+(TILESET_\w+)\s*(;\s*([0-9a-fA-F]+))?/);
    if (!m) continue;
    const idx = m[3] !== undefined ? parseInt(m[3], 16) : seq;
    tsIndex[m[1]] = idx;
    seq = idx + 1;
  }
  // Tilesets:: table, entry i = TILESET_ index i
  const tsLabels = [];
  for (const line of rd(GBC, 'data/tilesets.asm').split('\n')) {
    const m = line.match(/^\s+tileset\s+(\w+)\s*$/);
    if (m) tsLabels.push(m[1]);
  }
  // gfx/tilesets.asm: labels (incl. aliases) before an INCBIN -> metatiles file
  const metaOf = {};
  let pending = [];
  for (const line of rd(GBC, 'gfx/tilesets.asm').split('\n')) {
    const lab = line.match(/^(\w+)::\s*$/);
    if (lab) { pending.push(lab[1]); continue; }
    const inc = line.match(/INCBIN\s+"([^"]+)"/);
    if (inc) {
      for (const p of pending) if (p.endsWith('Meta')) metaOf[p] = inc[1];
      pending = [];
    } else if (line.trim() && !line.trim().startsWith(';')) {
      pending = [];
    }
  }
  // blocks.asm: <Name>_Blocks: -> maps/<Name>.blk
  const blkOf = {};
  pending = [];
  for (const line of rd(GBC, 'data/maps/blocks.asm').split('\n')) {
    const lab = line.match(/^(\w+)_Blocks:/);
    if (lab) { pending.push(lab[1]); continue; }
    const inc = line.match(/INCBIN\s+"([^"]+)"/);
    if (inc) {
      for (const p of pending) blkOf[p] = inc[1];
      pending = [];
    }
  }
  // map -> tileset constant
  const mapTs = {};
  for (const line of rd(GBC, 'data/maps/maps.asm').split('\n')) {
    const m = line.match(/^\s*map\s+(\w+),\s*(TILESET_\w+)/);
    if (m) mapTs[m[1]] = m[2];
  }
  const metaFor = (mapName) => {
    const c = mapTs[mapName];
    if (!c) return undefined;
    const label = tsLabels[tsIndex[c]];
    return metaOf[label + 'Meta'];
  };
  const target = metaFor(thisMap);
  const extra = [
    `target ${thisMap}: tileset ${mapTs[thisMap]} -> ${tsLabels[tsIndex[mapTs[thisMap]]]} -> metatiles ${target}`,
  ];

  const rows = [];
  for (const line of rd(GBC, 'data/maps/attributes.asm').split('\n')) {
    const m = line.match(/^\s*map_attributes\s+(\w+),\s*\w+,\s*(\$[0-9a-fA-F]+|0x[0-9a-fA-F]+|\d+)/);
    if (!m) continue;
    const name = m[1];
    const border = parseNum(m[2]);
    const blk = blkOf[name];
    const same = metaFor(name) === target && blk;
    let interior = 0, borderHit = 0;
    if (same) {
      const b = fs.readFileSync(path.join(GBC, blk));
      for (const v of b) if (v === blockId) interior++;
      if (border === blockId) borderHit = 1;
    }
    rows.push({ name, interior, border: borderHit, borderBlock: border });
  }
  if (!rows.find((r) => r.name === thisMap)) extra.push(`WARNING: ${thisMap} not in attributes.asm`);
  summarize(`GBC-1 block 0x${blockId.toString(16).padStart(2, '0')} on ${thisMap}'s tileset`, thisMap, rows, extra);
}

gbaCase('BattleFrontier_Lounge2', 'gTileset_Building', 0x001);
gbcCase('NewBarkTown', 0x01);
