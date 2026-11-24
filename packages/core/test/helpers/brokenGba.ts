import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Plan H F1d: a broken GBA path points one component at a file ABOVE the project
// root. The sentinel files sit there so a reader that wrongly opens them would
// find real bytes; the tests prove no reader ever does (outsideCalls).
export const OUTSIDE = "pokemap-f1d-outside";

const SENTINEL = Buffer.alloc(64, 0xee);

/** Rewrite layouts.json so layout `id` points blockdata and border at a file ABOVE root; write 8-byte sentinel files there. Returns the sentinel paths (caller deletes them). */
export function breakLayout(root: string, id: string): string[] {
  const blockName = `${OUTSIDE}-${id}.bin`;
  const borderName = `${OUTSIDE}-${id}-border.bin`;
  const file = join(root, "data/layouts/layouts.json");
  const table = JSON.parse(readFileSync(file, "utf8")) as { layouts: { id: string; blockdata_filepath: string; border_filepath: string }[] };
  const layout = table.layouts.find((l) => l.id === id);
  if (layout === undefined) throw new Error(`breakLayout: no layout ${id}`);
  layout.blockdata_filepath = `../${blockName}`;
  layout.border_filepath = `../${borderName}`;
  writeFileSync(file, JSON.stringify(table));
  const sentinels = [join(root, "..", blockName), join(root, "..", borderName)];
  for (const p of sentinels) writeFileSync(p, Buffer.alloc(8, 0xee));
  return sentinels;
}

/** Edit src/data/tilesets/metatiles.h so tileset NAME ("A","B","S","T") INCBINs its metatiles from "../pokemap-f1d-outside-ts-<NAME>.bin"; write a 64-byte sentinel there. Returns sentinel paths. */
export function breakTileset(root: string, name: string): string[] {
  const file = join(root, "src/data/tilesets/metatiles.h");
  const from = `data/tilesets/${name}/metatiles.bin`;
  const to = `../${OUTSIDE}-ts-${name}.bin`;
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.findIndex((l) => l.startsWith(`const u16 gMeta${name}[]`));
  if (at < 0 || !lines[at]!.includes(from)) throw new Error(`breakTileset: no metatiles INCBIN for ${name}`);
  lines[at] = lines[at]!.replace(from, to);
  writeFileSync(file, lines.join("\n"));
  const sentinel = join(root, "..", `${OUTSIDE}-ts-${name}.bin`);
  writeFileSync(sentinel, SENTINEL);
  return [sentinel];
}

/** Absolute paths of every readFileSync/existsSync/statSync/openSync/readdirSync call whose first argument string contains OUTSIDE. `spy` is the vi.fn. */
export function outsideCalls(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((args) => args[0])
    .filter((a): a is string => typeof a === "string" && a.includes(OUTSIDE))
    .map((a) => resolve(a));
}
