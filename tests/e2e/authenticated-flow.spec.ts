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

  test.setTimeout(240_000);

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

    const reporterContext = await browser.newContext();
    const reporterPage = await reporterContext.newPage();
    let reportId: string | undefined;
    let reviewerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

    try {
      await signIn(reporterPage, reporterEmail!, reporterPassword!);

      // Use the actual three-step reporter UI, not a hidden direct-upload API
      // call. This catches broken file-picker, location and submit controls.
      await reporterPage.goto("/reports/new");
      await expect(reporterPage.getByRole("heading", { name: "Upload a photo" })).toBeVisible();
      await reporterPage.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({
        name: `staging-e2e-${seed}.jpg`,
        mimeType: "image/jpeg",
        buffer: normalizedJpeg,
      });
      await reporterPage.getByLabel("Report title (enter what you observed)").fill("STAGING E2E — synthetic acceptance evidence");
      await reporterPage.getByLabel("Description (facts you observed, not AI estimates)").fill(
        "STAGING E2E ONLY — synthetic and not a real emergency.",
      );
      const continueButton = reporterPage.getByRole("button", { name: /^Continue$/ });
      await expect(continueButton).toBeEnabled({ timeout: 15000 });
      await continueButton.click();
      await expect(reporterPage.getByRole("heading", { name: "Confirm the location" })).toBeVisible();
      await reporterPage.getByLabel("Latitude").fill("14.5995");
      await reporterPage.getByLabel("Longitude").fill("120.9842");
      await reporterPage.getByRole("button", { name: "Use this location" }).click();
      await expect(reporterPage.getByTestId("step3-review-summary-card")).toBeVisible();
      await reporterPage.getByRole("button", { name: "Submit for review" }).click();

      const reportLink = reporterPage.getByTestId("submitted-report-link");
      await expect(reportLink).toBeVisible({ timeout: 60000 });
      const reportHref = await reportLink.getAttribute("href");
      reportId = reportHref?.match(/^\/reports\/([0-9a-f-]{36})$/i)?.[1];
      if (!reportId) throw new Error("UI did not provide a valid saved report link.");

      // The upload component initiates analysis itself. Poll read-only state;
      // never silently issue a second analysis or fake a model response.
      await expect.poll(async () => {
        const result = await postJson(reporterPage, `/api/reports/${reportId}`);
        return (result.body as { report?: { status?: string } } | null)?.report?.status ?? "unavailable";
      }, { timeout: 150000, intervals: [2000, 4000, 6000] }).toBe("needs_review");

      const saved = await postJson(reporterPage, `/api/reports/${reportId}`);
      expect(saved.status).toBe(200);
      const savedReport = (saved.body as {
        report?: {
          creator_id?: string;
          report_analyses?: Array<{
            model_id?: string;
            structured_observation?: Record<string, unknown>;
          }>;
        };
      }).report;
      const latest = savedReport?.report_analyses?.[0];
      expect(latest?.model_id).toBeTruthy();
      expect(latest?.model_id).not.toBe("demo-mock-v1");
      expect(latest?.structured_observation?._demo).not.toBe(true);
      expect(latest?.structured_observation?.incident_type).toBeTruthy();
      const creatorId = savedReport?.creator_id;
      expect(creatorId).toBeTruthy();
      await reportLink.click();
      await expect(reporterPage.getByText(/AI.generated, not verified/i).first()).toBeVisible();

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

      reviewerContext = await browser.newContext();
      const reviewerPage = await reviewerContext.newPage();
      await signIn(reviewerPage, reviewerEmail!, reviewerPassword!);
      await reviewerPage.goto("/review");
      const pendingLink = reviewerPage.locator(`a[href="/review/${reportId}"]`).first();
      await expect(pendingLink).toBeVisible({ timeout: 30000 });
      await pendingLink.click();
      const confirm = reviewerPage.getByRole("button", { name: /Confirm/i }).first();
      await expect(confirm).toBeEnabled({ timeout: 20000 });
      await confirm.click();

      // The reviewer used the actual protected action bar; verify its
      // authenticated DB-backed action from the same reviewer session.
      await expect.poll(async () => {
        const result = await postJson(reviewerPage, `/api/reports/${reportId}`);
        return (result.body as { report?: { status?: string } } | null)?.report?.status ?? "unavailable";
      }, { timeout: 40000, intervals: [1000, 2000, 3000] }).toBe("reviewed");

      const reviewHistory = await postJson(reviewerPage, `/api/reports/${reportId}/review`);
      expect(reviewHistory.status).toBe(200);
      const actions = (reviewHistory.body as {
        actions?: Array<{ action?: string; reviewer_id?: string; new_status?: string }>;
      }).actions ?? [];
      expect(actions.some((action) =>
        action.action === "confirm" &&
        Boolean(action.reviewer_id) &&
        action.reviewer_id !== creatorId &&
        action.new_status === "reviewed",
      )).toBe(true);

      const persisted = await postJson(reviewerPage, `/api/reports/${reportId}`);
      expect(persisted.status).toBe(200);
      expect((persisted.body as { report?: { status?: string; review_outcome?: string } }).report?.status).toBe("reviewed");
      expect((persisted.body as { report?: { review_outcome?: string } }).report?.review_outcome).toBe("confirmed");

      await reviewerPage.goto("/map");
      await expect(reviewerPage.getByTestId("reviewed-map-index")).toBeVisible({ timeout: 25000 });
      await expect(reviewerPage.getByTestId(`reviewed-map-report-${reportId}`)).toBeVisible({ timeout: 25000 });
      // The reviewed index remains accessible if map tiles/WebGL fail.
      // A visual map pin must be demonstrated separately in the live rehearsal.
      await expect(reviewerPage.getByTestId(`reviewed-map-report-${reportId}`).getByText(/Human confirmed/)).toBeVisible();

      // Deliberately print only non-secret evidence; no user identifiers,
      // private report IDs, image content, signed URLs, or auth state.
      const safeModel = (latest?.model_id ?? "unknown").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 48);
      console.info(`[demo-acceptance] pass=${test.info().repeatEachIndex + 1}; model=${safeModel}; independent_review=true; durable_audit=true; map_index=true; commit=${(process.env.GITHUB_SHA ?? "local").slice(0, 12)}`);
    } finally {
      // Never leave an active synthetic report in staging after acceptance.
      // Purging storage remains an explicit admin retention operation.
      if (reportId) {
        const cleanup = await postJson(reporterPage, `/api/reports/${reportId}/retention`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "STAGING E2E cleanup — synthetic acceptance evidence." }),
        });
        if (cleanup.status === 409) {
          // Only ALREADY_DELETED is an acceptable idempotent cleanup.
          // A different 409 is a real staging hygiene failure.
          const code = (cleanup.body as { error?: { code?: string } } | null)?.error?.code;
          expect(code).toBe("ALREADY_DELETED");
        } else {
          expect(cleanup.status).toBe(200);
        }
      }
      await reviewerContext?.close();
      await reporterContext.close();
    }
  });
});
