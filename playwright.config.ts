import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Tests that talk to Supabase or sign webhook payloads need the same env the
// app reads, and Playwright does not load .env files on its own.
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The suite signs in as the same few users dozens of times in minutes;
    // production limits (10 per account per 10 min) would lock it out.
    env: {
      LOGIN_RATE_LIMIT_PER_IP: "100000",
      LOGIN_RATE_LIMIT_PER_EMAIL: "100000",
      SIGNUP_RATE_LIMIT_PER_IP: "100000",
      RESET_RATE_LIMIT_PER_IP: "100000",
      RESET_RATE_LIMIT_PER_EMAIL: "100000",
    },
  },
});
