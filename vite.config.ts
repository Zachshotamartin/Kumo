import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { devProxyForMode } from "./src/config/devProxy.ts";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: devProxyForMode(mode),
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
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
}));
