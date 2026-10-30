// tests/e2e/happy-path.spec.ts
//
// E2E happy-path tests for TerraResponse AI.
//
// NOTE on the full happy path: The complete login → upload → manual
// pin → analyze → review → map flow requires:
//   1. A configured Supabase project (NEXT_PUBLIC_SUPABASE_URL, etc.)
//   2. A real auth session (signed-in user).
//   3. A real Meta API key (MODEL_API_KEY) for the analyze step.
//   4. Seeded events + reports.
// These are NOT available in the sandbox / CI environment. The full
// flow is documented in docs/BUILD_PLAN.md §8 (the 3-minute demo
// script) + verified manually by the developer before each release.
//
// These E2E tests cover what CAN be verified without a backend:
//   - The login page renders the "Setup required" state (since
//     Supabase is not configured in the sandbox).
//   - The brand + setup-state card are accessible.
//   - The API endpoints return 503 NOT_CONFIGURED (so the UI
//     surfaces the empty state, not a crash).
//   - The protected routes (dashboard, map, etc.) redirect to /login.
//
// The brief: "Test accessibility, keyboard focus, mobile viewport,
// loading and empty states."

import { test, expect } from "@playwright/test";

test.describe("Happy path — login page (Setup state, no backend)", () => {
  test("the login page renders with the brand", async ({ page }) => {
    await page.goto("/");
    // The brand text "TerraResponse AI" should appear (either in
    // the SetupState or the login form). The page redirects to
    // /login (since / requires auth). Wait for the redirect.
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.locator("text=TerraResponse AI")).toBeVisible({ timeout: 10000 });
  });

  test("the Setup State shows the env vars to configure (no silent failure)", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    // The "Setup required" header should be visible.
    await expect(page.locator("text=Setup required")).toBeVisible({ timeout: 10000 });
    // The three env var names should be listed.
    await expect(page.locator("text=NEXT_PUBLIC_SUPABASE_URL")).toBeVisible();
    await expect(page.locator("text=NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBeVisible();
    await expect(page.locator("text=SUPABASE_SERVICE_ROLE_KEY")).toBeVisible();
  });

  test("the prototype banner / description is present", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    // The "Decision-support prototype" subtitle is the project's
    // way of setting user expectations.
    await expect(page.locator("text=Decision-support prototype")).toBeVisible();
  });
});

test.describe("Happy path — API endpoints return 503 without backend", () => {
  // These tests verify the API endpoints respond with 503
  // NOT_CONFIGURED when Supabase isn't configured. This is the
  // correct behavior — the brief: "no silent failures". The UI
  // surfaces the empty state, not a crash.

  test("GET /api/reports returns 503 NOT_CONFIGURED", async ({ request }) => {
    const res = await request.get("/api/reports");
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  test("GET /api/reports/[id] returns 503 NOT_CONFIGURED", async ({ request }) => {
    const res = await request.get("/api/reports/test-id");
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  test("POST /api/reports/[id]/analyze returns 503 NOT_CONFIGURED", async ({ request }) => {
    const res = await request.post("/api/reports/test-id/analyze");
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  test("GET /api/reports/[id]/retention returns 503 NOT_CONFIGURED", async ({ request }) => {
    const res = await request.get("/api/reports/test-id/retention");
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  test("POST /api/reports/[id]/force-manual-review returns 503 NOT_CONFIGURED", async ({ request }) => {
    const res = await request.post("/api/reports/test-id/force-manual-review");
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  test("GET /api/admin/ai-usage returns 503 NOT_CONFIGURED", async ({ request }) => {
    const res = await request.get("/api/admin/ai-usage");
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });
});

test.describe("Happy path — protected routes redirect to /login", () => {
  test("/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("/map redirects to /login", async ({ page }) => {
    await page.goto("/map");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("/reports redirects to /login", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("/review redirects to /login", async ({ page }) => {
    await page.goto("/review");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("/audit redirects to /login", async ({ page }) => {
    await page.goto("/audit");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("/profile redirects to /login", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});
