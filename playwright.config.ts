import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {},
  },
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: "npm run dev -- --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
        env: {
          VITE_SUPABASE_URL: "https://domino-test.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
        },
      },
});
