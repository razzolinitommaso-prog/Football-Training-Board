import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./scripts/prelaunch",
  testMatch: "*.spec.ts",
  timeout: 45000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".tools/prelaunch-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5203",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/prelaunch/preview.cjs",
    url: "http://127.0.0.1:5203",
    reuseExistingServer: !process.env.CI,
    timeout: 90000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
