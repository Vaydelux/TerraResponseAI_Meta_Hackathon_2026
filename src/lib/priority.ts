// src/lib/priority.ts
//
// Pure TypeScript priority calculation — completely separate from the
// AI model. Produces a transparent advisory score in [0, 100].
//
// Per the brief's blueprint:
//   visual severity          0–40  (map AI severity 1–5 linearly)
//   critical facility impact 0–20  (verified metadata or reviewer confirm)
//   access disruption        0–15  (visible/accepted road blockage)
//   time recency             0–15  (event/capture/upload timestamps)
//   independent corroboration 0–10 (multiple distinct images)
//
// Per the brief:
//   - "Require verified metadata or reviewer confirmation for facility
//     claims."
//   - "Label unreviewed road blockage as unverified."
//   - "Use trustworthy event/capture/upload timestamps."
//   - "Do not treat same-image duplicates as independent corroboration."
//   - "When evidence is unknown, record the factor as unassessed instead
//     of silently claiming the fact is true."
//   - "Clearly label score as provisional review prioritization, not
//     real-world emergency severity."
//   - "Permit only authorized coordinator/admin to override score with
//     mandatory reason; preserve computed score, override and historical
//     audit record separately."

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Assessment status for each factor. */
export type FactorStatus = "assessed" | "unassessed" | "unverified";

/** A single factor's contribution to the score. */
export interface FactorBreakdown {
  name: string;
  maxPoints: number;
  points: number;
  status: FactorStatus;
  /** Human-readable explanation of the score or why it's unassessed. */
  explanation: string;
}

/** The complete priority calculation result. */
export interface PriorityResult {
  /** The total advisory score [0, 100]. */
  score: number;
  /** Per-factor breakdown for transparent display. */
  factors: FactorBreakdown[];
  /** Any factors that are unassessed or unverified. */
  missingEvidence: string[];
  /** Always "provisional" — this is NOT real-world emergency severity. */
  label: "provisional review prioritization";
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface PriorityInput {
  /** AI preliminary severity 1–5, or null if the model could not determine. */
  visualSeverity: number | null;
  /** True if a reviewer confirmed a critical facility impact (hospital,
   *  school, power station, etc.). False if explicitly denied. Null if
   *  unknown / not assessed. */
  facilityImpactVerified: boolean | null;
  /** True if the AI or reviewer reported a road blockage / access
   *  disruption. False if explicitly denied. Null if unknown. */
  accessDisruptionReported: boolean | null;
  /** True if the access disruption has been confirmed by a reviewer.
   *  False if it was only reported by the AI (unverified). Null if
   *  unknown. */
  accessDisruptionVerified: boolean | null;
  /** The capture timestamp from EXIF (the most trustworthy). Null if
   *  no EXIF date. */
  capturedAt: Date | null;
  /** The upload timestamp (server-set). Always present. */
  uploadedAt: Date;
  /** The event creation timestamp. Null if not available. */
  eventCreatedAt: Date | null;
  /** The SHA-256 digest of this report's image. */
  sha256: string;
  /** All SHA-256 digests of other reports in the same event (for
   *  corroboration counting). Does NOT include this report's own
   *  digest. */
  otherDigestsInEvent: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISUAL_SEVERITY = 40;
const MAX_FACILITY_IMPACT = 20;
const MAX_ACCESS_DISRUPTION = 15;
const MAX_TIME_RECENCY = 15;
const MAX_CORROBORATION = 10;

// Recency scoring: full 15 points if captured in the last 6 hours;
// linearly decays to 0 after 72 hours. If no capture timestamp, use
// the upload timestamp instead (with a small penalty).
const RECENCY_FULL_HOURS = 6;
const RECENCY_ZERO_HOURS = 72;
const RECENCY_NO_CAPTURE_PENALTY = 0.7; // 70% of what upload-based recency would give

// ---------------------------------------------------------------------------
// Factor calculations (pure functions)
// ---------------------------------------------------------------------------

/** Map AI severity 1–5 linearly across 0–40.
 *  1 → 8, 2 → 16, 3 → 24, 4 → 32, 5 → 40.
 *  Null → 0 (unassessed, not silently 0). */
function calcVisualSeverity(severity: number | null): FactorBreakdown {
  if (severity === null) {
    return {
      name: "Visual severity",
      maxPoints: MAX_VISUAL_SEVERITY,
      points: 0,
      status: "unassessed",
      explanation: "The AI model could not determine severity from the image.",
    };
  }
  const points = Math.round((severity / 5) * MAX_VISUAL_SEVERITY);
  return {
    name: "Visual severity",
    maxPoints: MAX_VISUAL_SEVERITY,
    points,
    status: "assessed",
    explanation: `AI severity ${severity}/5 → ${points}/${MAX_VISUAL_SEVERITY} points (linear mapping).`,
  };
}

/** Critical facility impact 0–20.
 *  Requires verified metadata or reviewer confirmation.
 *  Unverified → 0 points, labeled "unverified". */
function calcFacilityImpact(verified: boolean | null): FactorBreakdown {
  if (verified === null) {
    return {
      name: "Critical facility impact",
      maxPoints: MAX_FACILITY_IMPACT,
      points: 0,
      status: "unassessed",
      explanation: "No verified metadata or reviewer confirmation for facility impact.",
    };
  }
  if (verified === false) {
    return {
      name: "Critical facility impact",
      maxPoints: MAX_FACILITY_IMPACT,
      points: 0,
      status: "assessed",
      explanation: "Facility impact explicitly denied by reviewer or metadata.",
    };
  }
  // verified === true
  return {
    name: "Critical facility impact",
    maxPoints: MAX_FACILITY_IMPACT,
    points: MAX_FACILITY_IMPACT,
    status: "assessed",
    explanation: "Critical facility impact confirmed by reviewer or verified metadata.",
  };
}

/** Access disruption 0–15.
 *  If reported but NOT verified by a reviewer → partial points (7),
 *  labeled "unverified".
 *  If verified → full 15 points.
 *  If not reported → 0. */
function calcAccessDisruption(
  reported: boolean | null,
  verified: boolean | null,
): FactorBreakdown {
  if (reported === null) {
    return {
      name: "Access disruption",
      maxPoints: MAX_ACCESS_DISRUPTION,
      points: 0,
      status: "unassessed",
      explanation: "No information about access disruption.",
    };
  }
  if (reported === false) {
    return {
      name: "Access disruption",
      maxPoints: MAX_ACCESS_DISRUPTION,
      points: 0,
      status: "assessed",
      explanation: "Access disruption explicitly denied.",
    };
  }
  // reported === true
  if (verified === true) {
    return {
      name: "Access disruption",
      maxPoints: MAX_ACCESS_DISRUPTION,
      points: MAX_ACCESS_DISRUPTION,
      status: "assessed",
      explanation: "Access disruption confirmed by reviewer.",
    };
  }
  // reported but NOT verified → unverified, partial credit
  return {
    name: "Access disruption",
    maxPoints: MAX_ACCESS_DISRUPTION,
    points: 7,
    status: "unverified",
    explanation: "Access disruption reported by AI but NOT verified by a reviewer. Partial credit (7/15).",
  };
}

/** Time recency 0–15.
 *  Full 15 points if captured in the last 6 hours.
 *  Linearly decays to 0 after 72 hours.
 *  If no capture timestamp, use upload timestamp with a 70% penalty.
 *  Uses the MOST trustworthy timestamp available:
 *    1. capturedAt (EXIF) — most trustworthy
 *    2. uploadedAt (server) — always available
 *  eventCreatedAt is used as a reference for the event's age but does
 *  not directly contribute to recency. */
function calcTimeRecency(
  capturedAt: Date | null,
  uploadedAt: Date,
  now: Date = new Date(),
): FactorBreakdown {
  // Prefer capturedAt (EXIF) over uploadedAt.
  const refDate = capturedAt ?? uploadedAt;
  const hoursAgo = (now.getTime() - refDate.getTime()) / (1000 * 60 * 60);

  if (hoursAgo < 0) {
    // Future timestamp — cap at 0 (shouldn't happen, but defense).
    return {
      name: "Time recency",
      maxPoints: MAX_TIME_RECENCY,
      points: MAX_TIME_RECENCY,
      status: "assessed",
      explanation: "Timestamp is in the future; awarding full recency points.",
    };
  }

  // Linear decay from 15 (at 6h) to 0 (at 72h).
  let rawPoints: number;
  if (hoursAgo <= RECENCY_FULL_HOURS) {
    rawPoints = MAX_TIME_RECENCY;
  } else if (hoursAgo >= RECENCY_ZERO_HOURS) {
    rawPoints = 0;
  } else {
    const fraction = 1 - (hoursAgo - RECENCY_FULL_HOURS) / (RECENCY_ZERO_HOURS - RECENCY_FULL_HOURS);
    rawPoints = Math.round(fraction * MAX_TIME_RECENCY);
  }

  // If we used uploadAt (no capture timestamp), apply the penalty.
  if (capturedAt === null) {
    const penalized = Math.round(rawPoints * RECENCY_NO_CAPTURE_PENALTY);
    return {
      name: "Time recency",
      maxPoints: MAX_TIME_RECENCY,
      points: penalized,
      status: "assessed",
      explanation: `No EXIF capture timestamp; using upload time with ${(RECENCY_NO_CAPTURE_PENALTY * 100).toFixed(0)}% penalty. ${penalized}/${MAX_TIME_RECENCY} points.`,
    };
  }

  return {
    name: "Time recency",
    maxPoints: MAX_TIME_RECENCY,
    points: rawPoints,
    status: "assessed",
    explanation: `Capture time ${hoursAgo.toFixed(1)}h ago → ${rawPoints}/${MAX_TIME_RECENCY} points.`,
  };
}

/** Independent corroboration 0–10.
 *  Each distinct SHA-256 (a different image) contributes.
 *  Same-image duplicates (same SHA-256) do NOT count.
 *  1 distinct other image → 5 points.
 *  2+ distinct other images → 10 points.
 *  0 → 0. */
function calcCorroboration(
  thisDigest: string,
  otherDigestsInEvent: string[],
): FactorBreakdown {
  // Count UNIQUE digests (exclude this report's own digest).
  // Same-image duplicates (same digest) are counted once.
  const uniqueOther = new Set(
    otherDigestsInEvent.filter((d) => d !== thisDigest),
  );
  const count = uniqueOther.size;

  let points: number;
  if (count === 0) {
    points = 0;
  } else if (count === 1) {
    points = 5;
  } else {
    points = 10;
  }

  return {
    name: "Independent corroboration",
    maxPoints: MAX_CORROBORATION,
    points,
    status: "assessed",
    explanation:
      count === 0
        ? "No other distinct images in this event."
        : `${count} distinct image${count > 1 ? "s" : ""} in this event (same-image duplicates excluded). ${points}/${MAX_CORROBORATION} points.`,
  };
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the provisional priority score. Pure function — no side
 * effects, no DB calls, no I/O. Fully deterministic for the same input.
 *
 * Returns a PriorityResult with the total score, per-factor breakdown,
 * missing evidence list, and the "provisional" label.
 *
 * Per the brief: "Clearly label score as provisional review
 * prioritization, not real-world emergency severity."
 */
export function calculatePriority(input: PriorityInput, now: Date = new Date()): PriorityResult {
  const factors: FactorBreakdown[] = [
    calcVisualSeverity(input.visualSeverity),
    calcFacilityImpact(input.facilityImpactVerified),
    calcAccessDisruption(input.accessDisruptionReported, input.accessDisruptionVerified),
    calcTimeRecency(input.capturedAt, input.uploadedAt, now),
    calcCorroboration(input.sha256, input.otherDigestsInEvent),
  ];

  const score = Math.min(
    100,
    Math.max(0, factors.reduce((sum, f) => sum + f.points, 0)),
  );

  const missingEvidence = factors
    .filter((f) => f.status !== "assessed")
    .map((f) => `${f.name}: ${f.explanation}`);

  return {
    score,
    factors,
    missingEvidence,
    label: "provisional review prioritization",
  };
}

// ---------------------------------------------------------------------------
// Override types (for the API route handler)
// ---------------------------------------------------------------------------

export interface PriorityOverride {
  reportId: string;
  overriddenBy: string;
  previousScore: number;
  newScore: number;
  reason: string;
  createdAt: Date;
}

export interface PriorityWithOverride extends PriorityResult {
  /** The computed score (always preserved, even after an override). */
  computedScore: number;
  /** The override record, if any. Null if no override has been applied. */
  override: PriorityOverride | null;
  /** The score to display: the override's newScore if an override
   *  exists, otherwise the computed score. */
  displayedScore: number;
}
