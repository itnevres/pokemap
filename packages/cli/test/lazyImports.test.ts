import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Plan 4 row 6b: `pokemap render` pays for every command's import graph at
// start-up (about 350 ms of the 6a benchmark's 580 ms `--help`). Heavy modules
// must load through `await import()` inside the action that needs them, so a
// command only pays for its own graph. This guards the static import list.
const SRC = readFileSync(join(process.cwd(), "packages/cli/src/index.ts"), "utf8");

/** Module specifiers of every runtime (non `import type`) static import. */
function staticImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gms)) out.push(m[1]!);
  // Side-effect imports and re-exports load a module just the same.
  for (const m of src.matchAll(/^import\s+"([^"]+)";/gm)) out.push(m[1]!);
  for (const m of src.matchAll(/^export\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gms)) out.push(m[1]!);
  return out;
}

describe("cli index.ts start-up imports", () => {
  it("statically imports only the light modules every command needs", () => {
    const allowed = new Set([
      "commander",
      "node:fs",
      "@pokemap/core/src/family.js",
      "@pokemap/core/src/errorMessage.js", // import-free helper
      "./context.js",
      "./args.js",
    ]);
    const extra = staticImports(SRC).filter((s) => !allowed.has(s));
    expect(extra).toEqual([]);
  });

  it("loads the heavy modules lazily", () => {
    for (const spec of ["./gbcCommands.js", "./writeCommands.js", "./png.js", "@pokemap/core/src/render/layout.js"]) {
      expect(SRC).toContain(`import("${spec}")`);
    }
  });

  it("context.ts loads the GBA project module lazily, so a GBC command never pays for it", () => {
    const ctx = readFileSync(join(process.cwd(), "packages/cli/src/context.ts"), "utf8");
    expect(staticImports(ctx)).toEqual(["node:fs", "@pokemap/core/src/errorMessage.js"]);
    expect(ctx).toContain('import("@pokemap/core/src/project.js")');
  });
});
