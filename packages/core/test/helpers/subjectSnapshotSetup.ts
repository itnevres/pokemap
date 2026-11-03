import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { textFiles } from "../../src/addEvent/sources.js";

export function setup(): () => void {
  const start = performance.now();
  const config = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as { projectPath?: string; gbc?: { projectPath?: string } };
  const snapshot = mkdtempSync(join(tmpdir(), "pokemap-subjects-"));
  let bytes = 0, files = 0;
  try {
    for (const family of ["gba", "gbc"] as const) {
      const source = family === "gba" ? config.projectPath : config.gbc?.projectPath;
      if (!source || !existsSync(source)) continue;
      const target = join(snapshot, family);
      mkdirSync(target);
      const dirs = family === "gba" ? ["src", "include", "data"] : ["constants", "maps", "home"];
      const extensions = family === "gba" ? [".c", ".h", ".inc", ".s", ".json"] : [".asm"];
      for (const dir of dirs) for (const file of textFiles(join(source, dir), extensions)) {
        const dest = join(target, relative(source, file));
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
        bytes += statSync(file).size; files++;
      }
    }
    process.env.POKEMAP_SUBJECT_SNAPSHOT = snapshot;
    console.log(`Subject snapshot: ${files} files, ${bytes} bytes, ${(performance.now() - start).toFixed(1)} ms`);
  } catch (error) {
    rmSync(snapshot, { recursive: true, force: true }); throw error;
  }
  return () => {
    rmSync(snapshot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    delete process.env.POKEMAP_SUBJECT_SNAPSHOT;
  };
}
