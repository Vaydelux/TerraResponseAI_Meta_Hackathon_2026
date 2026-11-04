// Opt-in staging acceptance test for the truthful reporter → reviewer → map flow.
//
// This file is intentionally skipped unless every protected input is present.
// It must run only against an owner-approved staging deployment, never against
// production. Credentials and evidence paths are read from the runner's secret
// environment and are never printed or included in traces.

import { readFileSync } from "node:fs";
import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";

const reporterEmail = process.env.E2E_REPORTER_EMAIL;
const reporterPassword = process.env.E2E_REPORTER_PASSWORD;
const reviewerEmail = process.env.E2E_REVIEWER_EMAIL;
const reviewerPassword = process.env.E2E_REVIEWER_PASSWORD;
const imagePath = process.env.E2E_IMAGE_PATH;
const stagingRef = process.env.STAGING_SUPABASE_PROJECT_REF;
const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const productionBaseUrl = process.env.PRODUCTION_BASE_URL ?? "";

const enabled = Boolean(
  reporterEmail && reporterPassword && reviewerEmail && reviewerPassword &&
  imagePath && stagingRef && productionRef && stagingRef !== productionRef &&
  baseUrl && productionBaseUrl && baseUrl !== productionBaseUrl &&
  !baseUrl.includes(`${productionRef}.supabase.co`),
);

if (process.env.E2E_REQUIRE_AUTHENTICATED === "1" && !enabled) {
  throw new Error(
    "E2E_REQUIRE_AUTHENTICATED=1 requires complete protected staging inputs; refusing a false-green release run.",
  );
}

test.describe("Authenticated staging acceptance flow", () => {
  test.skip(!enabled, "Requires protected, owner-approved staging E2E environment variables.");

  async function signIn(page: Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /Sign in to Workspace/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  }

  async function postJson(page: Page, path: string, init: RequestInit = {}) {
    return page.evaluate(async ({ path, init }) => {
      const response = await fetch(path, {
        ...init,
        headers: { Accept: "application/json", ...(init.headers ?? {}) },
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    }, { path, init });
  }

  test("persists live analysis, audited separate review, private evidence, and map result", async ({
    browser,
  }) => {
    expect(reporterEmail).toBeTruthy();
    expect(reviewerEmail).toBeTruthy();
    expect(reporterEmail).not.toBe(reviewerEmail);
    const seed = Date.now();
    const stamp = Buffer.from([
      seed & 0xff, (seed >> 8) & 0xff, (seed >> 16) & 0xff,
      (seed >> 3) & 0xff, (seed >> 11) & 0xff, (seed >> 19) & 0xff,
      (seed >> 5) & 0xff, (seed >> 13) & 0xff, (seed >> 21) & 0xff,
      (seed >> 7) & 0xff, (seed >> 15) & 0xff, (seed >> 23) & 0xff,
    ]);
    const normalizedJpeg = await sharp(readFileSync(imagePath!))
      .resize({ width: 768, withoutEnlargement: true })
      .composite([
        {
          input: stamp,
          raw: { width: 2, height: 2, channels: 3 },
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 82 })
      .toBuffer();
    const imageBytes = Array.from(normalizedJpeg);

    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    let reportId: string | undefined;
    let reviewerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

    try {
      await signIn(reporterPage, reporterEmail!, reporterPassword!);

      const upload = await reporterPage.evaluate(async ({ imageBytes }) => {
        const file = new File([new Uint8Array(imageBytes)], "staging-e2e.jpg", { type: "image/jpeg" });
        const form = new FormData();
        form.append("file", file);
        form.append("meta", JSON.stringify({
          title: "STAGING E2E — synthetic acceptance evidence",
          description: "STAGING E2E ONLY — not a real incident report.",
          latitude: 14.5995,
          longitude: 120.9842,
          locationSource: "manual",
        }));
        const response = await fetch("/api/reports", { method: "POST", body: form });
        return { status: response.status, body: await response.json().catch(() => null) };
      }, { imageBytes });
      expect([200, 201], JSON.stringify(upload.body)).toContain(upload.status);
      reportId = (upload.body as { reportId?: unknown }).reportId as string | undefined;
      expect(typeof reportId).toBe("string");
      if (!reportId) throw new Error("Upload response did not include a report id.");

      const evidence = await postJson(reporterPage, `/api/reports/${reportId}/evidence?kind=derivative`);
      expect(evidence.status).toBe(200);
      expect((evidence.body as { expiresIn?: unknown }).expiresIn).toBe(60);
      const signedUrl = (evidence.body as { signedUrl?: unknown }).signedUrl;
      expect(typeof signedUrl).toBe("string");
      // Prove the private derivative is readable only through the short-lived
      // signed URL. Do not print or include the URL in test output/traces.
      const signedEvidence = await reporterPage.evaluate(async (url) => {
        const response = await fetch(url);
        return { status: response.status, contentType: response.headers.get("content-type") };
      }, signedUrl as string);
      expect(signedEvidence.status).toBe(200);
      expect(signedEvidence.contentType).toMatch(/^image\//);

      const analysis = await postJson(reporterPage, `/api/reports/${reportId}/analyze`, { method: "POST" });
      expect(analysis.status, JSON.stringify(analysis.body)).toBe(200);
      const analysisBody = analysis.body as {
        analysis?: { model_id?: string; structured_observation?: Record<string, unknown> };
        modelId?: string;
        observation?: Record<string, unknown>;
      };
      const modelId = analysisBody.analysis?.model_id ?? analysisBody.modelId;
      const observation = analysisBody.analysis?.structured_observation ?? analysisBody.observation;
      expect(modelId).toBeTruthy();
      expect(modelId).not.toBe("demo-mock-v1");
      expect(observation?._demo).not.toBe(true);
      expect(observation?.incident_type).toBeTruthy();

      reviewerContext = await browser.newContext();
      const reviewerPage = await reviewerContext.newPage();
      await signIn(reviewerPage, reviewerEmail!, reviewerPassword!);

      const review = await postJson(reviewerPage, `/api/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          requestId: crypto.randomUUID(),
          comment: "STAGING E2E — separate reviewer confirmation.",
        }),
      });
      expect(review.status, JSON.stringify(review.body)).toBe(200);

      const reviewHistory = await postJson(reviewerPage, `/api/reports/${reportId}/review`);
      expect(reviewHistory.status).toBe(200);
      const actions = (reviewHistory.body as {
        actions?: Array<{ action?: string; reviewer_id?: string; new_status?: string }>;
      }).actions ?? [];
      expect(actions.some((action) =>
        action.action === "confirm" &&
        Boolean(action.reviewer_id) &&
        action.new_status === "reviewed",
      )).toBe(true);

      const persisted = await postJson(reviewerPage, `/api/reports/${reportId}`);
      expect(persisted.status).toBe(200);
      expect((persisted.body as { report?: { status?: string; review_outcome?: string } }).report?.status).toBe("reviewed");
      expect((persisted.body as { report?: { review_outcome?: string } }).report?.review_outcome).toBe("confirmed");

      await reviewerPage.goto("/map");
      await expect(reviewerPage.getByText("Pinned Reports")).toBeVisible({ timeout: 20_000 });
      await expect(reviewerPage.getByText(`#TR-${reportId.slice(0, 6).toUpperCase()}`)).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      // Never leave an active synthetic report in staging after acceptance.
      // Purging storage remains an explicit admin retention operation.
      if (reportId) {
        const cleanup = await postJson(reporterPage, `/api/reports/${reportId}/retention`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "STAGING E2E cleanup — synthetic acceptance evidence." }),
        });
        expect([200, 409]).toContain(cleanup.status);
      }
      await reviewerContext?.close();
      await reporterContext.close();
    }
  });
});
