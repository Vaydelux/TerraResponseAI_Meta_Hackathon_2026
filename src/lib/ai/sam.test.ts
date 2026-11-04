// Fully mocked SAM contract tests. NO paid calls are made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import upstreamEvents from "@/lib/vendor/meta-sam/image-wheel.events.json";
import { segmentImage, isSamConfigured } from "@/lib/ai/sam";

type Event = { type: string; [key: string]: unknown };

function makeSseResponse(events: Event[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join("") +
    "data: [DONE]\n\n", { status: 200,
    headers: { "Content-Type": "text/event-stream" } });
}
const source = upstreamEvents as Event[];
const sample = { imageBytes: new Uint8Array([0xff, 0xd8, 0xff]),
  imageMimeType: "image/jpeg", prompt: "damaged building" };
const orig = {
  key: process.env.SAM_API_KEY,
  base: process.env.SAM_MODEL_BASE_URL,
  model: process.env.SAM_MODEL,
};

function replaceOutput(text: string): Event[] {
  return source.map((event) => {
    if (event.type === "response.output_text.delta") return { ...event, delta: text };
    if (event.type === "response.content_part.done" &&
      event.part && typeof event.part === "object") {
      return { ...event, part: { ...event.part as Record<string, unknown>, text } };
    }
    return event;
  });
}

describe("SAM 3.1 image segmentation, official Meta parser", () => {
  beforeEach(() => {
    process.env.SAM_API_KEY = "test-sam-key";
    process.env.SAM_MODEL_BASE_URL = "https://api.meta.ai/v1";
    process.env.SAM_MODEL = "sam-3.1";
  });
  afterEach(() => {
    for (const [key, value] of Object.entries({
      SAM_API_KEY: orig.key,
      SAM_MODEL_BASE_URL: orig.base,
      SAM_MODEL: orig.model,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("decodes the upstream privacy-reviewed image fixture into genuine model geometry", async () => {
    const transport = vi.fn(async () => makeSseResponse(source));
    const result = await segmentImage(sample, transport as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.masks.length).toBeGreaterThan(0);
    expect(result.imageWidth).toBe(1800);
    expect(result.imageHeight).toBe(1200);
    expect(result.masks[0].bounds.left).toBe(445);
    expect(result.masks[0].bounds.top).toBe(626);
    expect(result.masks[0].mask.height).toBe(224);
    expect(result.masks[0].mask.width).toBe(231);
    expect(result.score).toBeNull(); // missing confidence is NOT an invented 100%
  });

  it("classifies a complete empty output as a valid no-match (not an exception)", async () => {
    const result = await segmentImage(sample,
      vi.fn(async () => makeSseResponse(replaceOutput(""))) as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("no_match");
  });

  it("never accepts fabricated legacy <mask> text as an actual decoded overlay", async () => {
    const result = await segmentImage(sample,
      vi.fn(async () => makeSseResponse(replaceOutput("<mask>100 50 100</mask>"))) as unknown as typeof fetch);
    expect(result.ok).toBe(false);
  });

  it.each([429, 500, 400])("classifies HTTP %s without exposing provider response bodies", async (code) => {
    const result = await segmentImage(sample,
      vi.fn(async () => new Response("private provider response body", { status: code })) as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe(code === 400 ? "permanent" : "transient");
      expect(result.error).not.toContain("private provider");
    }
  });

  it("rejects unconfigured, vague and empty prompts without a model request", async () => {
    delete process.env.SAM_API_KEY;
    const noKey = await segmentImage(sample);
    expect(noKey.ok).toBe(false);
    if (!noKey.ok) expect(noKey.kind).toBe("not_configured");
    process.env.SAM_API_KEY = "test-key";
    for (const prompt of ["", "everything", "disaster"]) {
      const result = await segmentImage({ ...sample, prompt });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.kind).toBe("permanent");
    }
  });

  it("times out without a result", async () => {
    const result = await segmentImage({ ...sample, timeoutMs: 100 },
      vi.fn(async () => { throw Object.assign(new Error("Aborted"), { name: "AbortError" }); }) as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("timeout");
  });

  it("uses correct Responses API format and the no-extra-call policy", async () => {
    const transport = vi.fn(async () => makeSseResponse(source));
    await segmentImage(sample, transport as unknown as typeof fetch);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, request] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("sam-3.1");
    expect(body.stream).toBe(true);
    expect(body.metadata.mask_encoding).toBe("one_bit");
    expect(body.input[0].content[0].type).toBe("input_text");
    expect(body.input[0].content[1].image_url).toContain("data:image/jpeg;base64,");
  });
});

describe("SAM configuration", () => {
  it("detects absence and presence of API keys", () => {
    const prior = process.env.SAM_API_KEY;
    delete process.env.SAM_API_KEY;
    expect(isSamConfigured()).toBe(false);
    process.env.SAM_API_KEY = "x";
    expect(isSamConfigured()).toBe(true);
    if (prior === undefined) delete process.env.SAM_API_KEY;
    else process.env.SAM_API_KEY = prior;
  });
});
