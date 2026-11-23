import { defineConfig } from "vitest/config";

// vitest 5 removed `environmentMatchGlobs`; the jsdom/node split is now two projects.
// `globalSetup` (scratch test roots + subject snapshot) runs once at the root.
export default defineConfig({
  test: {
    globalSetup: ["packages/core/test/helpers/testRootsSetup.ts", "packages/core/test/helpers/subjectSnapshotSetup.ts"],
    globals: false,
    setupFiles: ["packages/ui/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/*/test/**/*.test.{ts,tsx}"],
          exclude: ["packages/ui/**", "**/node_modules/**"]
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
