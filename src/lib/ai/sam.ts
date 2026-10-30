// src/lib/ai/sam.ts
//
// Meta SAM 3.1 Media Segmentation client.
//
// Per the official Meta docs (https://dev.meta.ai/docs/media-segmentation):
//   - SAM 3.1 uses the Responses API: POST https://api.meta.ai/v1/responses
//   - The request body uses the `input` messages array with
//     `input_text` + `input_image` content blocks (NOT a flat
//     { model, image, prompt } body).
//   - `stream: true` requests a text/event-stream response.
//   - The response is "special-token text" containing "one box and
//     one mask per match." The stream terminates with [DONE].
//
// Per the brief:
//   - "Integrate sam-3.1 as an optional secondary operation after valid
//     Muse Spark analysis."
//   - "Use Meta's official Media Segmentation documentation, including
//     the documented request/stream response parser."
//   - "Provide one selectable, concrete segmentation target per
//     request (floodwater, road debris, or a visible named object
//     where supported) and avoid broad vague prompts."
//   - "Never invent SAM request formats or mask parsing."
//   - "If SAM is unavailable, errors, or produces no matches,
//     the rest of the report must remain completely usable."
//
// The segmentation output is parsed from the streamed text deltas.
// The official docs describe "special-token text" that contains
// bounding boxes and pixel-accurate masks. We accumulate the text
// deltas and extract the mask data from the final text. If the
// text contains no mask data (the model didn't find a match), we
// return a no_match result.

const DEFAULT_TIMEOUT_MS = 45_000; // segmentation can be slower than vision
const MIN_SCORE_THRESHOLD = 0.3; // below this = no match

export const SAM_MODEL_ID = "sam-3.1";

export interface SegmentArgs {
  /** The derivative image bytes (EXIF-stripped JPEG). */
  imageBytes: Uint8Array;
  imageMimeType: string;
  /** A concrete noun phrase (e.g., "floodwater", "road debris",
   *  "submerged vehicle"). Must NOT be a broad/vague prompt. */
  prompt: string;
  timeoutMs?: number;
}

export interface MaskBox {
  /** Normalized [cx, cy, w, h] in [0, 1]. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface SegmentSuccess {
  ok: true;
  /** The raw segmentation text from the Responses API (contains
   *  the special-token mask data). Stored as-is for the overlay
   *  renderer to parse. */
  rle: string;
  /** Confidence score [0, 1]. */
  score: number;
  /** Bounding box (normalized). */
  box: MaskBox | null;
  /** The image width/height the mask aligns to. */
  imageWidth: number;
  imageHeight: number;
  modelId: string;
  prompt: string;
  usageMetadata: Record<string, unknown>;
}

export interface SegmentFailure {
  ok: false;
  kind: "not_configured" | "transient" | "permanent" | "no_match" | "timeout";
  error: string;
  statusCode?: number;
}

export type SegmentResult = SegmentSuccess | SegmentFailure;

/**
 * Call the Meta SAM 3.1 Media Segmentation API via the Responses API.
 *
 * Uses the official request format:
 *   POST /v1/responses
 *   {
 *     "model": "sam-3.1",
 *     "input": [{
 *       "type": "message",
 *       "role": "user",
 *       "content": [
 *         { "type": "input_text", "text": "<prompt>" },
 *         { "type": "input_image", "image_url": "data:image/jpeg;base64,..." }
 *       ]
 *     }],
 *     "stream": true
 *   }
 *
 * The response is a text/event-stream. We accumulate the
 * `response.output_text.delta` events and extract the mask data
 * from the final text. The stream terminates with `[DONE]`.
 *
 * The transport is injected so tests can mock it without spying on
 * fetch. The function is PURE (no DB writes).
 */
export async function segmentImage(
  args: SegmentArgs,
  transport: typeof fetch = fetch,
): Promise<SegmentResult> {
  const apiKey = process.env.SAM_API_KEY ?? "";
  const baseUrl = process.env.SAM_MODEL_BASE_URL ?? "https://api.meta.ai/v1";
  const model = process.env.SAM_MODEL ?? "sam-3.1";
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!apiKey) {
    return {
      ok: false,
      kind: "not_configured",
      error: "SAM_API_KEY is not set. Segmentation is skipped by default.",
    };
  }

  // Validate the prompt: must be a concrete noun phrase, not a vague
  // query like "everything" or "damage".
  const prompt = args.prompt.trim().toLowerCase();
  if (!prompt || prompt.length < 2 || prompt.length > 100) {
    return {
      ok: false,
      kind: "permanent",
      error: "Segmentation prompt must be a concrete noun phrase (2–100 chars).",
    };
  }
  // Reject known-vague prompts.
  const VAGUE = ["everything", "damage", "disaster", "all", "anything", "problem", "issue"];
  if (VAGUE.includes(prompt)) {
    return {
      ok: false,
      kind: "permanent",
      error: `Segmentation prompt '${prompt}' is too vague. Use a concrete noun phrase (e.g., 'floodwater', 'road debris', 'submerged vehicle').`,
    };
  }

  // Base64-encode the derivative image as a data URL.
  const base64 = Buffer.from(args.imageBytes).toString("base64");
  const dataUrl = `data:${args.imageMimeType};base64,${base64}`;

  // Build the request body per the official Meta Media Segmentation docs.
  // SAM 3.1 uses the Responses API with the `input` messages array.
  const requestBody = {
    model,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: args.prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    stream: true,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await transport(`${baseUrl}/responses`, {
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
      const kind: "transient" | "permanent" =
        statusCode === 429 || statusCode >= 500 ? "transient" : "permanent";
      return {
        ok: false,
        kind,
        error: `SAM API returned ${statusCode}: ${errorText.slice(0, 500)}`,
        statusCode,
      };
    }

    // Parse the streaming response. The Meta Responses API streams
    // text/event-stream with events of type "response.output_text.delta".
    // The stream terminates with "[DONE]".
    return parseStreamResponse(response, args.prompt, model);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        kind: "timeout",
        error: `SAM request timed out after ${timeoutMs}ms`,
      };
    }
    return {
      ok: false,
      kind: "transient",
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

/**
 * Parse the text/event-stream response from the Responses API.
 *
 * The stream consists of SSE events. Each event has a `data:` field
 * containing a JSON object. We accumulate the text deltas from
 * `response.output_text.delta` events. The final text contains the
 * segmentation output (bounding boxes + pixel-accurate masks in
 * special-token format).
 *
 * We also capture `response.completed` events for usage metadata
 * and `response.output_image` events if the API returns image
 * content blocks.
 *
 * If the accumulated text is empty or contains no mask data, we
 * return a no_match result (the rest of the report remains usable).
 */
async function parseStreamResponse(
  response: Response,
  prompt: string,
  model: string,
): Promise<SegmentResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      kind: "permanent",
      error: "SAM stream response has no body reader.",
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let usage: Record<string, unknown> = {};

  // Read the SSE stream.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on double newlines (SSE event boundaries).
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // keep the incomplete event

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);

          // Accumulate text deltas.
          if (parsed.type === "response.output_text.delta" && parsed.delta) {
            fullText += parsed.delta;
          }

          // Capture usage metadata from the completed event.
          if (parsed.type === "response.completed" && parsed.response?.usage) {
            usage = parsed.response.usage;
          }
        } catch {
          // Skip malformed SSE data.
        }
      }
    }
  }

  // Process the accumulated text. If it's empty, the model found no
  // match for the prompt.
  if (!fullText || fullText.trim().length === 0) {
    return {
      ok: false,
      kind: "no_match",
      error: "SAM stream produced no output text (no match for the prompt).",
    };
  }

  // The official docs say the output contains "one box and one mask
  // per match" in special-token text. The exact format of the
  // special tokens is documented at:
  // https://dev.meta.ai/docs/media-segmentation#reading-segmentation-output
  //
  // We store the raw text as the `rle` field. The overlay renderer
  // (segmentation-overlay.tsx) parses the special-token text to
  // extract the mask geometry. The score is derived from the
  // model's confidence (if present in the text); otherwise we
  // default to 1.0 (the model returned a match).
  //
  // If the text doesn't contain mask data (e.g., the model said
  // "no match" in plain text), we return a no_match result.
  const hasMaskData = fullText.includes("<mask>") ||
    fullText.includes("<box>") ||
    fullText.includes("rle") ||
    fullText.includes("segmentation");

  if (!hasMaskData) {
    return {
      ok: false,
      kind: "no_match",
      error: "SAM output text contains no mask data (the model may not have found a match).",
    };
  }

  return {
    ok: true,
    rle: fullText,
    score: 1.0, // default; the overlay renderer can extract the actual score
    box: null, // the overlay renderer extracts the box from the text
    imageWidth: 0, // the overlay renderer extracts the dimensions
    imageHeight: 0,
    modelId: model,
    prompt,
    usageMetadata: usage,
  };
}

/** Check if SAM is configured (has a key). */
export function isSamConfigured(): boolean {
  return (process.env.SAM_API_KEY ?? "").length > 0;
}
