import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { devProxyForMode } from "./src/config/devProxy.ts";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: devProxyForMode(mode),
    watch: {
      ignored: ["**/coverage/**", "**/test-results/**", "**/playwright-report/**"],
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}", "api/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/setupTests.ts",
        "src/vite-env.d.ts",
        "src/liveblocks.config.ts",
        "src/index.tsx",
        "src/e2e/**",
      ],
      thresholds: {
        statements: 82,
        branches: 68,
        functions: 86,
        lines: 84,
        "src/editor/**": {
          statements: 90,
          branches: 80,
          functions: 95,
          lines: 90,
        },
      },
    },
  },
}));
