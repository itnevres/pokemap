import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SUBJECT_ROOT } from "./corpus.js";

/** The GBA subject files the add-event builder reads or writes, copied to a fresh temp root. */
const FILES = [
  "data/maps/Route101", "data/maps/LittlerootTown/map.json",
  "include/constants/flags.h", "include/constants/vars.h", "include/constants/opponents.h", "charmap.txt",
];

export function copyGbaAddEventProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gba-add-"));
  try {
    for (const rel of FILES) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      cpSync(join(SUBJECT_ROOT, rel), join(dir, rel), { recursive: true });
    }
  } catch (e) { removeGbaTemp(dir); throw e; }
  return dir;
}

export function removeGbaTemp(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
