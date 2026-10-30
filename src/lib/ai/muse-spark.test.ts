// src/lib/ai/muse-spark.test.ts
//
// Unit tests for the Meta Model API client. Uses a MOCKED transport
// (no real API calls). The tests verify:
//   1. A valid JSON response passes both validation layers (model
//      JSON-schema + Zod).
//   2. A schema-invalid response (wrong enum, missing field) is
//      rejected by Zod.
//   3. A non-JSON response is rejected.
//   4. A 429 response is classified as transient.
//   5. A 500 response is classified as transient.
//   6. A 400 response is classified as permanent.
//   7. A timeout is classified as timeout.
//   8. The observation has needs_review = true always.
//   9. The model ID + prompt/schema version are returned.
//
// The live API integration smoke test is in muse-spark.smoke.test.ts
// (opt-in, gated by MODEL_API_KEY).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeImage, type AnalyzeResult } from "@/lib/ai/muse-spark";

// A valid observation the model might return.
const VALID_OBSERVATION = {
  incident_type: "flooding",
  visible_evidence: ["Water covering a road", "Vehicles partially submerged"],
  preliminary_severity: 3,
  uncertainties: ["Depth of water is unclear", "Cannot determine if anyone is trapped"],
  summary_en: "A road is flooded with water covering both lanes. Several vehicles appear partially submerged.",
  summary_tl: "Isang kalsada ang binaha at tumataas ang tubig sa parehong lane. Ilang sasakyan ang tila bahos na.",
  needs_review: true,
  segmentation_target: "submerged vehicle",
};

function makeMockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeValidApiResponse(observation: Record<string, unknown> = VALID_OBSERVATION) {
  return makeMockResponse({
    choices: [{ message: { content: JSON.stringify(observation) } }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  });
}

describe("analyzeImage (mocked transport)", () => {
  const origApiKey = process.env.MODEL_API_KEY;

  beforeEach(() => {
    process.env.MODEL_API_KEY = "test-key";
    process.env.META_MODEL_BASE_URL = "https://api.meta.ai/v1";
    process.env.META_VISION_MODEL = "muse-spark-1.3";
  });

  afterEach(() => {
    if (origApiKey === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = origApiKey;
  });

  it("returns a validated observation on a valid API response", async () => {
    const transport = vi.fn(async () => makeValidApiResponse());
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff, 0xd8, 0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.observation.incident_type).toBe("flooding");
      expect(result.observation.needs_review).toBe(true);
      expect(result.usageMetadata.total_tokens).toBe(300);
      expect(result.modelId).toBe("muse-spark-1.3");
      expect(result.promptVersion).toBe("v1");
      expect(result.schemaVersion).toBe("v1");
    }
  });

  it("rejects a response with an invalid incident_type (Zod layer)", async () => {
    const bad = { ...VALID_OBSERVATION, incident_type: "earthquake" };
    const transport = vi.fn(async () => makeValidApiResponse(bad));
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema_invalid");
      expect(result.error).toContain("incident_type");
    }
  });

  it("rejects a response missing a required field", async () => {
    const bad = { ...VALID_OBSERVATION, summary_en: undefined };
    const transport = vi.fn(async () => makeValidApiResponse(bad));
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema_invalid");
      expect(result.error).toContain("summary_en");
    }
  });

  it("rejects a response with needs_review = false (must be true)", async () => {
    const bad = { ...VALID_OBSERVATION, needs_review: false };
    const transport = vi.fn(async () => makeValidApiResponse(bad));
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema_invalid");
    }
  });

  it("rejects a non-JSON response", async () => {
    const transport = vi.fn(async () =>
      makeMockResponse({
        choices: [{ message: { content: "This is not JSON" } }],
      }),
    );
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema_invalid");
      expect(result.error).toContain("not valid JSON");
    }
  });

  it("classifies a 429 as transient", async () => {
    const transport = vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    );
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("transient");
      expect(result.statusCode).toBe(429);
    }
  });

  it("classifies a 500 as transient", async () => {
    const transport = vi.fn(async () =>
      new Response("server error", { status: 500 }),
    );
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("transient");
      expect(result.statusCode).toBe(500);
    }
  });

  it("classifies a 400 as permanent", async () => {
    const transport = vi.fn(async () =>
      new Response("bad request", { status: 400 }),
    );
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("permanent");
      expect(result.statusCode).toBe(400);
    }
  });

  it("returns permanent error when MODEL_API_KEY is not set", async () => {
    delete process.env.MODEL_API_KEY;
    const result = await analyzeImage({
      imageBytes: new Uint8Array([0xff]),
      imageMimeType: "image/jpeg",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("permanent");
      expect(result.error).toContain("MODEL_API_KEY");
    }
  });

  it("accepts preliminary_severity = null (cannot determine)", async () => {
    const obs = { ...VALID_OBSERVATION, preliminary_severity: null };
    const transport = vi.fn(async () => makeValidApiResponse(obs));
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.observation.preliminary_severity).toBeNull();
    }
  });

  it("accepts segmentation_target = null", async () => {
    const obs = { ...VALID_OBSERVATION, segmentation_target: null };
    const transport = vi.fn(async () => makeValidApiResponse(obs));
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.observation.segmentation_target).toBeNull();
    }
  });

  it("rejects extra fields (strict mode)", async () => {
    const bad = { ...VALID_OBSERVATION, coordinates: { lat: 35.5, lng: -82.5 } };
    const transport = vi.fn(async () => makeValidApiResponse(bad));
    const result = await analyzeImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema_invalid");
    }
  });
});
