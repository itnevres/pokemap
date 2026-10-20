// Run only the new synchronous tests with native assertions, without Vitest.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hooks, passed, failed } from "./task-2-native-adapter.mjs";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "vitest") return { url: new URL("./task-2-native-adapter.mjs", import.meta.url).href, shortCircuit: true };
    if (specifier.endsWith(".js") && context.parentURL) {
      const target = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (target.protocol === "file:" && existsSync(fileURLToPath(target))) return nextResolve(target.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const files = [
  "../../../../packages/core/test/write/preparedSave.test.ts",
  "../../../../packages/core/test/write/planFingerprint.test.ts",
  "../../../../packages/core/test/gbc/write/preparedSave.test.ts",
];
for (const file of files) {
  hooks.length = 0;
  await import(new URL(file, import.meta.url));
}
console.log(`Native assertions: ${passed} passed, ${failed} failed, ${files.length} files`);
if (failed) process.exitCode = 1;
