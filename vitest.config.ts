import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["packages/core/test/helpers/subjectSnapshotSetup.ts"],
    globals: false,
    environment: "node",
    environmentMatchGlobs: [["packages/ui/**", "jsdom"]],
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    setupFiles: ["packages/ui/test/setup.ts"]
  }
});
