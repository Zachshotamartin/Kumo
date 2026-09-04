import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { devProxyForMode } from "./src/config/devProxy.ts";

const outputFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const absolute = join(directory, entry);
  return statSync(absolute).isDirectory() ? outputFiles(absolute) : [absolute];
});

const injectServiceWorkerPrecache = (): Plugin => ({
  name: "kumo-service-worker-precache",
  apply: "build",
  closeBundle() {
    const outputDirectory = resolve(process.cwd(), "dist");
    const workerPath = join(outputDirectory, "sw.js");
    const urls = outputFiles(outputDirectory)
      .map((file) => relative(outputDirectory, file).replaceAll("\\", "/"))
      .filter((file) => !["index.html", "manifest.json", "sw.js"].includes(file) && !file.endsWith(".map"))
      .map((file) => `/${file}`)
      .sort();
    const source = readFileSync(workerPath, "utf8");
    const marker = "/* __KUMO_PRECACHE_MANIFEST__ */";
    if (!source.includes(marker)) throw new Error("The service worker precache marker is missing.");
    writeFileSync(workerPath, source.replace(marker, urls.map((url) => `, ${JSON.stringify(url)}`).join("")));
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), injectServiceWorkerPrecache()],
  server: {
    proxy: devProxyForMode(mode),
    watch: {
      ignored: ["**/coverage/**", "**/test-results/**", "**/playwright-report/**"],
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react-vendor", test: /node_modules[\\/](?:react|react-dom|react-redux|@reduxjs)/, priority: 30 },
            { name: "collaboration-vendor", test: /node_modules[\\/]@liveblocks/, priority: 25 },
            { name: "firebase-vendor", test: /node_modules[\\/](?:firebase|@firebase)/, priority: 20 },
            { name: "vendor", test: /node_modules/, minSize: 20_000, maxSize: 250_000, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    // Suites that reach the real Firebase browser client need a non-empty key for `getAuth` to
    // construct. Supplying a placeholder here keeps the suite independent of any local .env file:
    // the deployed key comes from the environment and is never committed.
    env: { VITE_FIREBASE_API_KEY: "test-firebase-browser-key" },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}", "api/**/*.ts", "server/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/setupTests.ts",
        "src/vite-env.d.ts",
        "src/liveblocks.config.ts",
        "src/index.tsx",
        "src/e2e/**",
      ],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
}));
