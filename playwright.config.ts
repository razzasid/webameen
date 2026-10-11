import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3301";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Next.js recommends production mode for E2E so tests exercise the same
    // complete route manifest and server-action behavior as a deployment.
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    env: {
      NEXT_DIST_DIR: ".next-playwright",
      APP_URL: `http://127.0.0.1:${port}`,
    },
    // Production build output is isolated in .next-playwright. Reusing an
    // unrelated/stale local server can serve HTML whose chunk manifest no
    // longer matches that output and make every browser test fail at hydration.
    // Set PLAYWRIGHT_REUSE_SERVER=true only when intentionally attaching to a
    // matching server started with the same build and NEXT_DIST_DIR.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 300_000,
  },
});
