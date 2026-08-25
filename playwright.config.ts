import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4177",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: "**/mobile-editor.spec.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testIgnore: "**/mobile-editor.spec.ts", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testIgnore: "**/mobile-editor.spec.ts", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", testMatch: ["**/auth.spec.ts", "**/mobile-editor.spec.ts", "**/accessibility.spec.ts", "**/visual.spec.ts"], use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", testMatch: ["**/auth.spec.ts", "**/mobile-editor.spec.ts", "**/accessibility.spec.ts"], use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4177 --strictPort",
    env: { VITE_E2E: "true" },
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
