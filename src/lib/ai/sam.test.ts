// src/lib/ai/sam.test.ts
//
// Unit tests for the SAM 3.1 segmentation client. Uses a MOCKED
// transport (no real API calls). The tests verify:
//   1. A valid SSE stream with mask data in the output text passes.
//   2. A stream with no output text is classified as no_match.
//   3. A stream with output text but no mask tokens is no_match.
//   4. A 429 is classified as transient.
//   5. A 500 is classified as transient.
//   6. A 400 is classified as permanent.
//   7. No SAM_API_KEY → not_configured.
//   8. A vague prompt is rejected.
//   9. An empty prompt is rejected.
//  10. A timeout is classified as timeout.
//  11. The request body uses the Responses API format (input array
//      with input_text + input_image content blocks, stream: true).
//
// The live API integration smoke test is in sam.smoke.test.ts
// (opt-in, gated by SAM_API_KEY).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { segmentImage, isSamConfigured, type SegmentResult } from "@/lib/ai/sam";

/** Build a mock SSE stream response (text/event-stream) with the
 *  Responses API event format. Each event is a `data: {...}\n\n` block. */
function makeSseResponse(events: Array<{ type: string; [key: string]: unknown }>): Response {
  const sse = events
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("") + "data: [DONE]\n\n";
  return new Response(sse, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Build a mock error response. */
function makeErrorResponse(status: number, message: string): Response {
  return new Response(message, { status });
}

describe("segmentImage (mocked transport)", () => {
  const origKey = process.env.SAM_API_KEY;

  beforeEach(() => {
    process.env.SAM_API_KEY = "test-sam-key";
    process.env.SAM_MODEL_BASE_URL = "https://api.meta.ai/v1";
    process.env.SAM_MODEL = "sam-3.1";
  });

  afterEach(() => {
    if (origKey === undefined) delete process.env.SAM_API_KEY;
    else process.env.SAM_API_KEY = origKey;
  });

  it("returns a valid mask on a successful SSE stream with mask data", async () => {
    const stream = makeSseResponse([
      { type: "response.output_text.delta", delta: "<mask>" },
      { type: "response.output_text.delta", delta: "100 50 100 50 100" },
      { type: "response.output_text.delta", delta: "</mask>" },
      { type: "response.output_text.delta", delta: "<box>" },
      { type: "response.output_text.delta", delta: "0.5 0.5 0.3 0.3" },
      { type: "response.output_text.delta", delta: "</box>" },
      {
        type: "response.completed",
        response: { usage: { inference_time_ms: 1200 } },
      },
    ]);
    const transport = vi.fn(async () => stream);
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rle).toContain("<mask>");
      expect(result.rle).toContain("100 50 100 50 100");
      expect(result.rle).toContain("</mask>");
      expect(result.rle).toContain("<box>");
      expect(result.modelId).toBe("sam-3.1");
      expect(result.prompt).toBe("floodwater");
      expect(result.usageMetadata).toEqual({ inference_time_ms: 1200 });
    }
  });

  it("returns no_match for a stream with no output text (empty deltas)", async () => {
    const stream = makeSseResponse([
      { type: "response.completed", response: { usage: {} } },
    ]);
    const transport = vi.fn(async () => stream);
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("no_match");
      expect(result.error).toContain("no output text");
    }
  });

  it("returns no_match for a stream with output text but no mask tokens", async () => {
    const stream = makeSseResponse([
      { type: "response.output_text.delta", delta: "No matching objects found." },
      { type: "response.completed", response: { usage: {} } },
    ]);
    const transport = vi.fn(async () => stream);
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "submerged vehicle" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("no_match");
      expect(result.error).toContain("no mask data");
    }
  });

  it("classifies a 429 as transient", async () => {
    const transport = vi.fn(async () => makeErrorResponse(429, "rate limited"));
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("transient");
      expect(result.statusCode).toBe(429);
    }
  });

  it("classifies a 500 as transient", async () => {
    const transport = vi.fn(async () => makeErrorResponse(500, "server error"));
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("transient");
    }
  });

  it("classifies a 400 as permanent", async () => {
    const transport = vi.fn(async () => makeErrorResponse(400, "bad request"));
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater" },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("permanent");
    }
  });

  it("returns not_configured when SAM_API_KEY is empty", async () => {
    delete process.env.SAM_API_KEY;
    const result = await segmentImage({
      imageBytes: new Uint8Array([0xff]),
      imageMimeType: "image/jpeg",
      prompt: "floodwater",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not_configured");
    }
  });

  it("rejects a vague prompt ('everything')", async () => {
    const result = await segmentImage({
      imageBytes: new Uint8Array([0xff]),
      imageMimeType: "image/jpeg",
      prompt: "everything",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("permanent");
      expect(result.error).toContain("too vague");
    }
  });

  it("rejects an empty prompt", async () => {
    const result = await segmentImage({
      imageBytes: new Uint8Array([0xff]),
      imageMimeType: "image/jpeg",
      prompt: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("permanent");
    }
  });

  it("handles a timeout (AbortError)", async () => {
    const transport = vi.fn(async () => {
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    });
    const result = await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater", timeoutMs: 100 },
      transport as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("timeout");
    }
  });

  it("uses the Responses API endpoint (/v1/responses) + the input messages format", async () => {
    const transport = vi.fn(async () =>
      makeSseResponse([
        { type: "response.output_text.delta", delta: "<mask>rle_data</mask>" },
        { type: "response.completed", response: { usage: {} } },
      ]),
    );
    await segmentImage(
      { imageBytes: new Uint8Array([0xff]), imageMimeType: "image/jpeg", prompt: "floodwater" },
      transport as unknown as typeof fetch,
    );
    // Verify the transport was called with the Responses API endpoint.
    expect(transport).toHaveBeenCalledTimes(1);
    const callArgs = transport.mock.calls[0] as unknown[];
    const url = callArgs[0] as string;
    expect(url).toContain("/v1/responses");
    // Verify the request body has the `input` messages array.
    const init = callArgs[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("sam-3.1");
    expect(body.stream).toBe(true);
    expect(body.input).toBeInstanceOf(Array);
    expect(body.input[0].type).toBe("message");
    expect(body.input[0].role).toBe("user");
    expect(body.input[0].content).toBeInstanceOf(Array);
    expect(body.input[0].content[0].type).toBe("input_text");
    expect(body.input[0].content[0].text).toBe("floodwater");
    expect(body.input[0].content[1].type).toBe("input_image");
    expect(body.input[0].content[1].image_url).toContain("data:image/jpeg;base64,");
    // Verify the Authorization header.
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-sam-key",
    });
  });
});

describe("isSamConfigured", () => {
  it("returns false when SAM_API_KEY is empty", () => {
    const orig = process.env.SAM_API_KEY;
    delete process.env.SAM_API_KEY;
    expect(isSamConfigured()).toBe(false);
    if (orig !== undefined) process.env.SAM_API_KEY = orig;
  });

  it("returns true when SAM_API_KEY is set", () => {
    const orig = process.env.SAM_API_KEY;
    process.env.SAM_API_KEY = "test-key";
    expect(isSamConfigured()).toBe(true);
    if (orig === undefined) delete process.env.SAM_API_KEY;
    else process.env.SAM_API_KEY = orig;
  });
});
