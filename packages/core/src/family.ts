import { existsSync } from "node:fs";

export type EngineFamily = "gba" | "gbc";

const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * Probes a project root for its engine family and refuses rather than guesses
 * (I7/G4): every probed path is named in any thrown message.
 *
 * - gba: `include/fieldmap.h` exists (the same file `openProject` requires).
 * - gbc (Crystal): `data/maps/attributes.asm` AND `constants/map_constants.asm`
 *   both exist.
 * - pokeyellow shape (`data/maps/headers/` + `constants/map_constants.asm`,
 *   no `attributes.asm`) is unsupported until Plan 8 and gets its own message
 *   rather than being treated as gbc.
 *
 * See docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md,
 * "Config and family decision" -- verified against all 12 local roots, 0
 * misdetections.
 */
export function detectEngineFamily(root: string): EngineFamily {
  const r = norm(root);
  const gbaMarker = `${r}/include/fieldmap.h`;
  const attributesAsm = `${r}/data/maps/attributes.asm`;
  const mapConstantsAsm = `${r}/constants/map_constants.asm`;
  const yellowHeadersDir = `${r}/data/maps/headers`;

  const isGba = existsSync(gbaMarker);
  const isGbc = existsSync(attributesAsm) && existsSync(mapConstantsAsm);

  if (isGba && isGbc) {
    throw new Error(
      `${root}: matches both engine families -- refusing to guess. ` +
      `gba marker present: ${gbaMarker}. gbc markers present: ${attributesAsm}, ${mapConstantsAsm}.`,
    );
  }
  if (isGba) return "gba";
  if (isGbc) return "gbc";

  if (existsSync(yellowHeadersDir) && existsSync(mapConstantsAsm)) {
    throw new Error(
      `${root}: looks pokeyellow-shaped (${yellowHeadersDir} and ${mapConstantsAsm} exist, ` +
      `${attributesAsm} does not) -- unsupported until Plan 8.`,
    );
  }

  throw new Error(
    `${root} does not look like a gba or gbc decomp project root. Probed: ` +
    `${gbaMarker} (gba); ${attributesAsm} and ${mapConstantsAsm} (gbc).`,
  );
}
