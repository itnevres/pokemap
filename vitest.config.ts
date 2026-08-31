import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    environmentMatchGlobs: [["packages/ui/**", "jsdom"]],
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    setupFiles: ["packages/ui/test/setup.ts"]
  }
});
