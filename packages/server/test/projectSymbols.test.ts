import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSymbolIndexCache } from "../src/projectSymbols.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it.each(["gba", "gbc"] as const)("%s preserves structural defects on index failure and retries after the backoff", (family) => {
  const parent = mkdtempSync(join(tmpdir(), "pokemap-symbol-retry-"));
  roots.push(parent);
  const root = join(parent, "project");
  let now = 0;
  const cache = createSymbolIndexCache(root, family, () => now);
  const defect = { file: "map.bin", kind: "size" as const, message: "wrong size", fix: "repair map.bin" };
  const run = () => cache.check((symbols) => ({ defects: [defect], incomplete: [{ file: "other.map", reason: "C5 unavailable" }], indexed: !!symbols?.labels.has("Script") }));
  expect(run()).toEqual({ defects: [defect], incomplete: [
    { file: "other.map", reason: "C5 unavailable" },
    { file: root, reason: expect.stringContaining("C7-C9") },
  ], indexed: false });
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", family === "gba" ? "scripts.s" : "scripts.asm"), "Script:\n");
  now = 4_999;
  expect(run().indexed).toBe(false); // Inside the backoff window the failure is reused, not rebuilt.
  now = 5_000;
  expect(run()).toEqual({ defects: [defect], incomplete: [{ file: "other.map", reason: "C5 unavailable" }], indexed: true });
});

it("invalidate drops a cached failure so the next check rebuilds at once", () => {
  const parent = mkdtempSync(join(tmpdir(), "pokemap-symbol-retry-"));
  roots.push(parent);
  const root = join(parent, "project");
  const cache = createSymbolIndexCache(root, "gbc", () => 0);
  const run = () => cache.check((symbols) => ({ defects: [], incomplete: [], indexed: !!symbols?.labels.has("Script") }));
  expect(run().indexed).toBe(false);
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", "scripts.asm"), "Script:\n");
  cache.invalidate();
  expect(run().indexed).toBe(true);
});
