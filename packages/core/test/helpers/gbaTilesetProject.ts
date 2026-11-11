import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SUBJECT_ROOT } from "./corpus.js";

/**
 * What `loadProject` (openProject) and a tileset load need: the tables under
 * src/data/tilesets, the layouts/maps they name, `include/fieldmap.h`, the
 * `.pal` sources under data/tilesets, the art under graphics/tilesets
 * (metatiles.bin names no art; the tileset PNG does), `src/graphics.c` (the
 * General/Frontier palettes INCBIN there, not in graphics.h), and the cfg.
 */
const ENTRIES = [
  "data/tilesets",
  "data/layouts",
  "data/maps",
  "include",
  "src/data/tilesets",
  "src/graphics.c",
  "graphics/tilesets",
  "porymap.project.cfg",
];

/**
 * A hermetic temp copy of the GBA subject for block-editor tests that write
 * tileset files. Never the real root: `copyGbaAddEventProject` only carries
 * the add-event inputs and has no layouts/tilesets. Pair with
 * `removeGbaTemp` in `afterAll`.
 */
export function copyGbaTilesetProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gba-tileset-"));
  try {
    for (const rel of ENTRIES) {
      const from = join(SUBJECT_ROOT, rel);
      if (!existsSync(from)) continue;
      const to = join(dir, rel);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to, { recursive: true });
    }
  } catch (e) {
    removeGbaTemp(dir); // a half-copied temp dir must not leak
    throw e;
  }
  return dir;
}

/** Windows AV/indexers hold files briefly after thousands of writes (EBUSY), hence the retries. */
export function removeGbaTemp(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
