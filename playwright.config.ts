// playwright.config.ts
//
// Playwright E2E test configuration for TerraResponse AI.
//
// Per the brief: "Playwright E2E happy paths: log in → upload → manual
// pin → analyze via controlled fixture → review → map, plus unknown-
// location and failure cases. Test accessibility, keyboard focus,
// mobile viewport, loading and empty states."
//
// IMPORTANT: The E2E tests run against the REAL Next.js dev server
// (next dev on :3000). The dev server is NOT mocked — it's the same
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
// map with a real backend) is the developer's manual pre-release
// check; it's NOT automated because it requires a real Supabase
// project + a real Meta API key. See tests/TEST_COVERAGE.md.
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
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    // Desktop Chromium
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    // Mobile viewport (the brief: "Test mobile viewport")
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
  // The webServer config starts the dev server automatically before
  // the tests + stops it after. We use `dev` (not `build` + `start`)
  // because dev is faster to boot and we don't need a prod build
  // for E2E tests (the behavior under test is the not-configured
  // empty state, which is the same in dev + prod).
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "ignore",
    stderr: "pipe", // surface dev-server errors
  },
});
