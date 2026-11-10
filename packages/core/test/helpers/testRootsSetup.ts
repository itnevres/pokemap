import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertManifestUnchanged, assertScratchRoots, configuredRoots, copyTestRoots,
  createScratchDir, removeScratchDir, rootManifest, type TestConfig,
} from "./testRoots.js";

export function setup(): () => void {
  const real = JSON.parse(readFileSync("pokemap.config.json", "utf8")) as TestConfig;
  real.yellowPath ??= "C:/Programming Projects/Pokemon Game/refs/pokeyellow";
  return setupTestRoots(real);
}

/** Explicit-input entry for sentinel tests; never reads the developer config. */
export function setupTestRoots(real: TestConfig, scratch = createScratchDir()): () => void {
  const start = performance.now();
  const oldConfig = process.env.POKEMAP_TEST_CONFIG, oldHome = process.env.POKEMAP_HOME;
  const restoreEnv = () => {
    if (oldConfig === undefined) delete process.env.POKEMAP_TEST_CONFIG; else process.env.POKEMAP_TEST_CONFIG = oldConfig;
    if (oldHome === undefined) delete process.env.POKEMAP_HOME; else process.env.POKEMAP_HOME = oldHome;
  };
  try {
    const roots = configuredRoots(real).map(root => ({ ...root, before: rootManifest(root.path, root.family) }));
    const copied = copyTestRoots(real, scratch);
    assertScratchRoots(copied.config, scratch);
    const configPath = join(scratch, "pokemap.config.json");
    writeFileSync(configPath, `${JSON.stringify(copied.config, null, 2)}\n`);
    const home = join(scratch, "home"); mkdirSync(home);
    process.env.POKEMAP_TEST_CONFIG = configPath;
    process.env.POKEMAP_HOME = home;
    console.log(`Test roots setup: ${copied.files} files, ${copied.bytes} bytes, ${(performance.now() - start).toFixed(1)} ms`);
    return () => {
      const teardownStart = performance.now();
      const failures: unknown[] = [];
      try {
        for (const root of roots) {
          try { assertManifestUnchanged(root.path, root.before, rootManifest(root.path, root.family)); }
          catch (error) { failures.push(error); }
        }
      } finally {
        try { removeScratchDir(scratch); } finally {
          restoreEnv();
          console.log(`Test roots teardown: ${(performance.now() - teardownStart).toFixed(1)} ms`);
        }
      }
      if (failures.length) throw new AggregateError(failures, `Real subject/reference roots changed during tests:\n${failures.map(String).join("\n")}`);
    };
  } catch (error) {
    try { removeScratchDir(scratch); } finally { restoreEnv(); }
    throw error;
  }
}
