import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSymbolIndexCache } from "../src/projectSymbols.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it.each(["gba", "gbc"] as const)("%s preserves structural defects on index failure and retries the next check", (family) => {
  const parent = mkdtempSync(join(tmpdir(), "pokemap-symbol-retry-"));
  roots.push(parent);
  const root = join(parent, "project");
  const cache = createSymbolIndexCache(root, family);
  const defect = { file: "map.bin", kind: "size" as const, message: "wrong size", fix: "repair map.bin" };
  const run = () => cache.check((symbols) => ({ defects: [defect], incomplete: [{ file: "other.map", reason: "C5 unavailable" }], indexed: !!symbols?.labels.has("Script") }));
  expect(run()).toEqual({ defects: [defect], incomplete: [
    { file: "other.map", reason: "C5 unavailable" },
    { file: root, reason: expect.stringContaining("C7-C9") },
  ], indexed: false });
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", family === "gba" ? "scripts.s" : "scripts.asm"), "Script:\n");
  expect(run()).toEqual({ defects: [defect], incomplete: [{ file: "other.map", reason: "C5 unavailable" }], indexed: true });
});
