import { configDefaults, defineConfig } from "vitest/config";

// vitest 5 removed `environmentMatchGlobs`; the jsdom/node split is now two projects.
// `globalSetup` (scratch test roots + subject snapshot) runs once at the root.
// vitest 5 fails a synchronous test that overruns `testTimeout` after it returns (vitest 2 never did), so the
// corpus tests that block for 5-10 s on the scratch subject copy need the longer limit below.
export default defineConfig({
  test: {
    globalSetup: ["packages/core/test/helpers/testRootsSetup.ts", "packages/core/test/helpers/subjectSnapshotSetup.ts"],
    globals: false,
    testTimeout: 60_000,
    setupFiles: ["packages/ui/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/*/test/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "packages/ui/**"]
        }
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["packages/ui/test/**/*.test.{ts,tsx}"]
        }
      }
    ]
  }
});
