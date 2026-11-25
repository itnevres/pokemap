// Plan H P1: lint the current code as it stands. Recommended sets for ESLint,
// typescript-eslint and react-hooks, minus what the code does not already pass
// (the "follow-up" rules below, each listed in the P1 PR). No formatter rules.
// Not type-aware on purpose: fast, and no tsconfig coupling for CI (P2).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // docs/ holds task-report scratch drivers; .claude/.codex/.agents hold tooling; fixtures are data.
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "docs/**", ".claude/**", ".codex/**", ".agents/**", "fixtures/**", "packages/ui/public/**"],
  },
  // Existing eslint-disable comments name exhaustive-deps, which is off until its follow-up.
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // TypeScript does this check (typescript-eslint's own advice).
      "no-undef": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true, caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
      // Follow-up (P1 PR body): the code does not pass these yet, and fixing them is a mass rewrite.
      "@typescript-eslint/no-explicit-any": "off",
      "preserve-caught-error": "off",
    },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Follow-up: 43 existing sites (37 in ui/src).
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // Follow-up: tests carry unused imports/variables and a few regex and finally patterns the rules flag.
    files: ["packages/*/test/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "no-control-regex": "off",
      "no-regex-spaces": "off",
      "no-useless-escape": "off",
      "no-unsafe-finally": "off",
    },
  },
);
