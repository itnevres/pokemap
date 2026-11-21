// Direct hub probe of Q3 ownership: map A stages a tileset edit, map B (same tileset file) applies to another block.
// usage: node ownprobe.mjs <hubPort> <mapA> <ax,ay> <mapB> <bx,by> <tileA> <tileB>
const [port, A, ac, B, bc, ta, tb] = process.argv.slice(2), base = `http://127.0.0.1:${port}/api/edit`;
const j = async (u, b) => { const r = await fetch(u, b ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) } : undefined); return { s: r.status, b: await r.json().catch(() => null) }; };
const plan = async (m) => (await j(`${base}/${m}/plan`)).b.changes.map((c) => c.summary);
const get = (m, c) => { const [x, y] = c.split(","); return j(`${base}/${m}/block?x=${x}&y=${y}`); };
const apply = async (m, c, tile) => { const g = (await get(m, c)).b; const [x, y] = c.split(",").map(Number);
  const draft = { tiles: [Number(tile), ...g.block.tiles.slice(1)], collision: g.block.collision, palettes: [] };
  return j(`${base}/${m}/block/apply`, { request: { blockId: g.blockId, mode: "ok", from: "map", cell: { x, y }, draft }, revision: g.revision }); };
for (const m of [A, B]) await j(`${base}/${m}/discard`, {});
const a = await apply(A, ac, ta); console.log("A apply", a.s, JSON.stringify(a.b).slice(0, 160), "planA", await plan(A));
if (process.env.UNDOREDO) { const u = await j(`${base}/${A}/undo`, {}); const r = await j(`${base}/${A}/redo`, {}); console.log("A undo", u.s, "redo", r.s, JSON.stringify(r.b).slice(0, 120), "planA", await plan(A)); }
const b = await apply(B, bc, tb); console.log("B apply", b.s, JSON.stringify(b.b).slice(0, 400));
console.log("planA", await plan(A), "planB", await plan(B));
console.log("A block now", JSON.stringify((await get(A, ac)).b.block.tiles.slice(0, 2)), "B block now", JSON.stringify((await get(B, bc)).b.block.tiles.slice(0, 2)), "B id", (await get(B, bc)).b.blockId);
for (const m of [A, B]) await j(`${base}/${m}/discard`, {});
console.log("after discard planA", await plan(A), "planB", await plan(B));
