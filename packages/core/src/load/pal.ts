import type { RGB } from "../model/types.js";

/**
 * JASC-PAL is the committed source for tileset palettes. The sibling .gbapal
 * is a gitignored build artifact and must not be the only source (I3).
 */
export function parseJascPal(text: string): RGB[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "JASC-PAL") throw new Error("not a JASC-PAL file");

  // Read the declared count; do not assume 16. Of this tree's 3,724 palettes,
  // one declares 10 and one declares 15.
  const count = Number(lines[2]);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`JASC-PAL header declares a bad colour count: ${JSON.stringify(lines[2])}`);
  }

  const out: RGB[] = [];
  for (let i = 0; i < count; i++) {
    const raw = lines[3 + i];
    if (raw === undefined || raw.trim() === "") {
      throw new Error(`JASC-PAL declares ${count} colours but has only ${i}`);
    }
    const parts = raw.trim().split(/\s+/).map(Number);
    // Refusing beats `?? 0`, which turns "24 41" into a plausible dark blue
    // that is simply wrong and looks like real data downstream (I7).
    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      throw new Error(`JASC-PAL colour ${i} is malformed: ${JSON.stringify(raw)}`);
    }
    out.push({ r: parts[0]!, g: parts[1]!, b: parts[2]! });
  }
  return out;
}
