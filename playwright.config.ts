// playwright.config.ts
//
// Playwright E2E test configuration for TerraResponse AI.
//
// Per the brief: "Playwright E2E happy paths: log in → upload → manual
// pin → analyze via controlled fixture → review → map, plus unknown-
// location and failure cases. Test accessibility, keyboard focus,
// mobile viewport, loading and empty states."
//
// IMPORTANT: The E2E tests run against the real built standalone Next.js server
// on port 3000, matching the production runtime. The dev server is NOT mocked — it's the same
// code the user runs. What IS "absent" is the Supabase backend
// (the env vars aren't set in the sandbox), so the app surfaces the
// "Setup required" state and every API endpoint returns 503
// NOT_CONFIGURED. The E2E tests verify:
//   - The login page's "Setup required" state is accessible + mobile-
//     friendly + keyboard-navigable + has no console errors.
//   - The API endpoints return 503 NOT_CONFIGURED (the brief: "no
//     silent failures").
//   - The protected routes (dashboard, map, etc.) redirect to /login.
//
// The full happy-path UI flow (login → upload → analyze → review →
// map with a real backend) is covered by the opt-in authenticated
// staging spec. It remains skipped in ordinary CI without protected
// staging credentials; use E2E_REQUIRE_AUTHENTICATED=1 for a release
// run that must fail instead of silently skipping it.
//
// To run:
//   bun run test:e2e     # auto-starts the dev server + runs the tests
//
// Or, to run a single test file:
//   bunx playwright test tests/e2e/happy-path.spec.ts

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false, // serial: the tests share a dev server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker — the dev server is shared
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    // Desktop Chromium
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "chromium-tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    // Smallest supported mobile viewport.
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 320, height: 800 },
      },
    },
  ],
  // Exercise the standalone production artifact. This avoids sharing
  // hot-reload state across tests and catches missing standalone assets
  // before a release.
  ...(process.env.PLAYWRIGHT_BASE_URL ? {} : {
    webServer: {
      // The production build already copies static assets to .next/standalone.
      // The previous command pointed at a non-existent helper script.
      command: "bun run start",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120 * 1000,
      stdout: "ignore",
      stderr: "pipe", // surface server errors
    },
  }),
});
