/**
 * Meta's SAM 3.1 wire-grammar adapter for one image frame.
 * Official parser and mask decoder are vendored with their SAM license.
 * Never treat output text as an RLE mask or infer geometry from prose.
 */
import { parseImageStream, recordsOfKind, type SegmentationMask, type SegmentationMaskBounds } from "@/lib/vendor/meta-sam/segmentation";
import { decodeMaskToRaster } from "@/lib/vendor/meta-sam/mask-codec";

const MAX_STREAM_BYTES = 1_800_000;
const MAX_MASK_PIXELS = 4_000_000;
const MAX_MASKS = 24;

export interface SamStoredMask {
  objectId: string;
  mask: SegmentationMask;
  bounds: SegmentationMaskBounds;
  /** Missing means Meta did not provide a confidence measurement. */
  confidence?: number;
}
export interface ParsedSamImage {
  masks: SamStoredMask[];
  width: number;
  height: number;
  usage: Record<string, unknown>;
  status: "completed" | "no_match";
}

function frameSize(raw: string): { width: number; height: number } | null {
  const token = raw.match(/<\|box;([^|]+)\|>/)?.[1];
  if (!token) return null;
  const fields = new Map(token.split(";").map((entry) => {
    const at = entry.indexOf("=");
    return [at >= 0 ? entry.slice(0, at) : entry, at >= 0 ? entry.slice(at + 1) : ""];
  }));
  const width = Number(fields.get("w")), height = Number(fields.get("h"));
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || width * height > 28_000_000) return null;
  return { width, height };
}

export async function parseSamImageResponse(response: Response): Promise<ParsedSamImage> {
  if (!response.body) throw new Error("SAM_STREAM_MISSING");
  let usage: Record<string, unknown> = {};
  async function* streamEvents(): AsyncGenerator<{ type: string; [key: string]: unknown }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "", total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_STREAM_BYTES) throw new Error("SAM_STREAM_TOO_LARGE");
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const data = part.split(/\r?\n/).filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart()).join("");
          if (!data || data === "[DONE]") continue;
          let event: unknown;
          try { event = JSON.parse(data); } catch { throw new Error("SAM_STREAM_INVALID_JSON"); }
          if (!event || typeof event !== "object" ||
            typeof (event as { type?: unknown }).type !== "string") continue;
          const record = event as { type: string; [key: string]: unknown };
          if (record.type === "response.completed" &&
            record.response && typeof record.response === "object") {
            const raw = record.response as { usage?: unknown };
            if (raw.usage && typeof raw.usage === "object" && !Array.isArray(raw.usage))
              usage = raw.usage as Record<string, unknown>;
          }
          yield record;
        }
      }
      if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
        throw new Error("SAM_STREAM_TRUNCATED");
      }
    } finally {
      reader.releaseLock();
    }
  }

  // The official parser checks response lane completion, object/frame IDs,
  // mask base85 arithmetic coding and malformed/truncated events.
  const parsed = await parseImageStream(streamEvents()).finalResult;
  if (parsed.outcome.status !== "completed") throw new Error("SAM_STREAM_INCOMPLETE");
  const records = recordsOfKind(parsed.records, "mask");
  if (records.length === 0) {
    if (parsed.diagnostics.some((d) => d.severity === "error")) {
      throw new Error("SAM_MASK_MALFORMED");
    }
    return { status: "no_match", masks: [], width: 0, height: 0, usage };
  }
  const dimensions = frameSize(parsed.rawOutput);
  if (!dimensions || records.length > MAX_MASKS) throw new Error("SAM_MASK_DIMENSIONS_INVALID");
  const masks: SamStoredMask[] = [];
  for (const record of records) {
    const { mask, bounds } = record;
    if (mask.width < 1 || mask.height < 1 ||
      mask.width * mask.height > MAX_MASK_PIXELS ||
      bounds.left < 0 || bounds.top < 0 ||
      bounds.right > dimensions.width || bounds.bottom > dimensions.height ||
      bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
      throw new Error("SAM_MASK_BOUNDS_INVALID");
    }
    // Strict decode validates the complete base85 payload; don't persist
    // non-decodable masks or ever paint a placeholder highlight.
    const raster = decodeMaskToRaster(mask);
    if (raster.length !== mask.width * mask.height) throw new Error("SAM_MASK_SIZE_INVALID");
    masks.push({
      objectId: record.objectId,
      mask: { encoding: mask.encoding, payload: mask.payload, width: mask.width, height: mask.height },
      bounds: { ...bounds },
      ...(typeof record.confidence === "number" ? { confidence: record.confidence } : {}),
    });
  }
  return { status: "completed", masks, width: dimensions.width,
    height: dimensions.height, usage };
}
