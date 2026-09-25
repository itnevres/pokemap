import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set([
  join("src", "write", "save.ts"),
  join("src", "world", "sidecar.ts"),
  join("src", "world", "dungeons.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("I8/I2 static check", () => {
  it("no file under packages/core/src writes to the filesystem except the sanctioned three", () => {
    const root = join(__dirname, "..", "..");
    const files = walk(join(root, "src"));
    const offenders: string[] = [];
    for (const f of files) {
      const rel = f.slice(root.length + 1);
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (/\bwriteFileSync\s*\(|\bwriteFile\s*\(/.test(text)) offenders.push(rel);
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});
