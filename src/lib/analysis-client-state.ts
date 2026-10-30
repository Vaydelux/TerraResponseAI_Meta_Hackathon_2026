/**
 * Human-readable state of the upload-initiated Meta analysis request.
 * Image upload success never implies that inference succeeded.
 */
export type AnalysisProgress =
  | { kind: "requesting"; message: string }
  | { kind: "review_ready"; message: string }
  | { kind: "processing"; message: string }
  | { kind: "manual_review"; message: string }
  | { kind: "unavailable"; message: string };

export function interpretAnalysisResponse(
  status: number,
  value: unknown,
): Exclude<AnalysisProgress, { kind: "requesting" }> {
  const body = value && typeof value === "object"
    ? value as { ok?: unknown; error?: { code?: string } }
    : {};
  if (status >= 200 && status < 300 && body.ok === true) {
    return {
      kind: "review_ready",
      message: "AI observations were saved. They remain provisional until an authorized human reviews them.",
    };
  }

  const code = body.error?.code;
  if (status === 409 && (code === "IN_PROGRESS" || code === "STATE_TRANSITION_FAILED")) {
    return {
      kind: "processing",
      message: "Analysis is already processing. Open the report to see its current status.",
    };
  }
  if (["MANUAL_REVIEW", "RETRY_CAP_REACHED", "SCHEMA_INVALID", "NO_DERIVATIVE", "PERMANENT_ERROR"].includes(code ?? "")) {
    return {
      kind: "manual_review",
      message: "Automated analysis could not produce a verified-format result. The saved report needs reviewer attention.",
    };
  }

  return {
    kind: "unavailable",
    message: "The photo and report were saved, but automated analysis did not complete. Check the report for its latest status.",
  };
}
