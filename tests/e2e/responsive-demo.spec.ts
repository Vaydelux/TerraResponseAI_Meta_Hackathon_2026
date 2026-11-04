import { test, expect } from "@playwright/test";

test.describe("public asset availability", () => {
  test("brand, editorial and hero assets return media rather than a login redirect", async ({ page, request }) => {
    for (const [path, mime] of [
      ["/logo.svg", "image/svg+xml"],
      ["/icon.svg", "image/svg+xml"],
      ["/demo/flood-aerial.png", "image/png"],
      ["/brand/readme-banner.svg", "image/svg+xml"],
      ["/hero/terraresponse-poster.jpg", "image/jpeg"],
    ] as const) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain(mime);
      expect(response.headers()["location"], path).toBeUndefined();
    }
    await page.goto("/login");
    const mark = page.locator('img[src="/logo.svg"]').first();
    await expect(mark).toBeVisible();
    await expect.poll(async () => mark.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });
});



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


test.describe("smooth scrolling and floating back-to-top", () => {
  test("uses smooth anchors, respects sticky headers and returns to the top without overflow", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("smooth");

    await page.goto("/#how-it-works");
    const heading = page.getByRole("heading", { name: "How it works" });
    await expect(heading).toBeVisible();
    await expect.poll(async () => heading.evaluate((el) => el.getBoundingClientRect().top), { timeout: 5000 })
      .toBeGreaterThanOrEqual(64);

    await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "instant" }));
    const backToTop = page.getByTestId("back-to-top");
    await expect(backToTop).toBeVisible();
    const bounds = await backToTop.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await backToTop.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeLessThan(8);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("honors reduced motion across the public and authentication shells", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    await page.goto("/login");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    const backToTop = page.getByTestId("back-to-top");
    if (await backToTop.isVisible()) {
      await backToTop.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(8);
    }
  });
});
