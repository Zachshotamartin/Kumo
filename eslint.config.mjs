import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "build", "coverage", ".vercel", "playwright-report", "test-results", "public/embed"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": ["error", { "allow": ["warn", "error"] }],
      "prefer-const": "error",
      "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }]
    }
  },
  {
    files: ["**/*.test.{ts,tsx}", "playwright.config.ts", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest }
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, fetch: "readonly" }
    }
  }
);
