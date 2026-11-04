import { test, expect } from "@playwright/test";

// This is a public demo-surface smoke test, not proof of a real Supabase
// upload, Meta inference, or human review. Playwright projects run it at
// 320px mobile, 768px tablet and 1440px desktop.
test.describe("public judging-demo responsiveness", () => {
  test("landing and sample map are reachable and have no document overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const workspace = page.getByRole("link", { name: /open workspace|sign in to workspace/i }).first();
    await expect(workspace).toBeVisible();
    const hitBox = await workspace.boundingBox();
    expect(hitBox).not.toBeNull();
    expect(hitBox!.height).toBeGreaterThanOrEqual(44);
    expect(hitBox!.width).toBeGreaterThanOrEqual(44);

    const sample = page.locator("#incident-map-preview");
    await expect(sample).toBeVisible();
    await expect(sample.getByText(/fictional reports are an illustration/i)).toBeVisible();

    const points = sample.getByRole("button", { name: /select sample:/i });
    expect(await points.count()).toBeGreaterThan(1);
    await points.nth(1).click();
    await expect(points.nth(1)).toHaveAttribute("aria-pressed", "true");

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 2);
    expect(dimensions.bodyWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 2);
  });

  test("reduced motion and keyboard access preserve sample navigation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#incident-map-preview");
    const sample = page.locator("#incident-map-preview");
    const first = sample.getByRole("button", { name: /select sample:/i }).first();
    await expect(first).toBeVisible();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "true");
  });
});
