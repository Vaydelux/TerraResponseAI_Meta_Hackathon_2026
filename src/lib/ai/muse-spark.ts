// src/lib/ai/muse-spark.ts
//
// Meta Model API client for the Muse Spark vision model.
//
// Per the brief:
//   - "Use environment variables MODEL_API_KEY, META_MODEL_BASE_URL=
//     https://api.meta.ai/v1, and META_VISION_MODEL=muse-spark-1.3."
//   - "Check official image-understanding and structured-output docs
//     for the correct endpoint/request body."
//   - "Prefer a JSON-schema-constrained response with a second Zod
//     validation layer."
//   - "Never call the model directly from the browser, and never
//     expose keys or original private bucket URLs publicly."
//
// The client uses the standard OpenAI-compatible chat/completions
// endpoint with:
//   - image_url content type (the derivative's signed URL, NOT the
//     private bucket path)
//   - response_format: { type: "json_schema", json_schema: {...} }
//   - a fixed system prompt (prompt.ts)
//   - a fixed user prompt (prompt.ts)
//
// The image is passed as a data URL (base64-encoded derivative) so the
// model sees it without a public URL. The server reads the derivative
// from private storage, base64-encodes it, and passes it inline.

import { observationSchema, jsonSchemaForModel, type Observation } from "./observation-schema";
import { SYSTEM_PROMPT, USER_PROMPT, PROMPT_VERSION } from "./prompt";

const DEFAULT_TIMEOUT_MS = 30_000;

/** Model ID + prompt/schema version for the analysis row. */
export const MODEL_ID = "muse-spark-1.3";

export interface AnalyzeArgs {
  /** The derivative image bytes (EXIF-stripped JPEG, ≤1600px). */
  imageBytes: Uint8Array;
  /** The MIME type of the image (always image/jpeg for derivatives). */
  imageMimeType: string;
  /** Optional timeout override (ms). */
  timeoutMs?: number;
}

export interface AnalyzeSuccess {
  ok: true;
  observation: Observation;
  rawOutput: string;
  usageMetadata: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface AnalyzeFailure {
  ok: false;
  kind: "transient" | "permanent" | "schema_invalid" | "timeout";
  error: string;
  statusCode?: number;
  rawOutput?: string;
}

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFailure;

/**
 * Call the Meta Model API to analyze a disaster photo. Returns a
 * validated Observation on success, or a classified error on failure.
 *
 * The function is PURE (no DB writes) — the route handler persists
 * the result. This makes it unit-testable with a mocked transport.
 *
 * The transport function is injected so tests can mock it without
 * spying on fetch.
 */
export async function analyzeImage(
  args: AnalyzeArgs,
  transport: typeof fetch = fetch,
): Promise<AnalyzeResult> {
  const apiKey = process.env.MODEL_API_KEY ?? "";
  const baseUrl = process.env.META_MODEL_BASE_URL ?? "https://api.meta.ai/v1";
  const model = process.env.META_VISION_MODEL ?? "muse-spark-1.3";
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!apiKey) {
    return {
      ok: false,
      kind: "permanent",
      error: "MODEL_API_KEY is not set. The analyze endpoint returns 503 NOT_CONFIGURED.",
    };
  }

  // Base64-encode the derivative image as a data URL.
  const base64 = Buffer.from(args.imageBytes).toString("base64");
  const dataUrl = `data:${args.imageMimeType};base64,${base64}`;

  // Build the OpenAI-compatible chat completion request with the
  // JSON-schema-constrained response format.
  const requestBody = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "disaster_observation",
        schema: jsonSchemaForModel,
        strict: true,
      },
    },
    max_tokens: 2000,
    temperature: 0,
  };

  // Call the model with a timeout.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await transport(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusCode = response.status;
      const errorText = await response.text().catch(() => "unknown error");
      // Classify: 429 + 5xx are transient; 4xx (except 429) are permanent.
      const kind: "transient" | "permanent" =
        statusCode === 429 || statusCode >= 500 ? "transient" : "permanent";
      return {
        ok: false,
        kind,
        error: `Meta API returned ${statusCode}: ${errorText.slice(0, 500)}`,
        statusCode,
      };
    }

    const body = await response.json();
    const rawOutput: string = body?.choices?.[0]?.message?.content ?? "";

    if (!rawOutput) {
      return {
        ok: false,
        kind: "permanent",
        error: "Meta API returned an empty response.",
        statusCode: response.status,
      };
    }

    // SECOND validation layer: parse the raw JSON against the Zod schema.
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawOutput);
    } catch {
      return {
        ok: false,
        kind: "schema_invalid",
        error: "The model's response was not valid JSON.",
        rawOutput: rawOutput.slice(0, 1000),
      };
    }

    const parseResult = observationSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      return {
        ok: false,
        kind: "schema_invalid",
        error: `Zod validation failed: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        rawOutput: rawOutput.slice(0, 1000),
      };
    }

    // Extract usage metadata (token counts, model-side request id).
    const usage = body?.usage ?? {};

    return {
      ok: true,
      observation: parseResult.data,
      rawOutput,
      usageMetadata: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      modelId: model,
      promptVersion: PROMPT_VERSION,
      schemaVersion: "v1",
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        kind: "timeout",
        error: `Request timed out after ${timeoutMs}ms`,
      };
    }
    return {
      ok: false,
      kind: "transient",
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

export { observationSchema, type Observation };
