// src/lib/ai/observation-schema.ts
//
// The strict observation schema the Meta Model API response is parsed
// against. This is the SECOND validation layer (after the model's own
// JSON-schema-constrained output). Per the brief:
//
//   "Prefer a JSON-schema-constrained response with a second Zod
//    validation layer."
//
// Per the brief, the schema includes:
//   - incident_type: flooding | blocked_road | debris |
//     visible_structural_damage | other | unclear
//   - visible_evidence: short factual observations (array of strings)
//   - preliminary_severity: 1–5 or null
//   - uncertainties: array of strings
//   - summary_en: English summary
//   - summary_tl: draft Tagalog summary
//   - needs_review: always true (the AI never marks itself verified)
//   - segmentation_target: one concrete noun phrase or null (optional)
//
// The schema does NOT include:
//   - coordinates (the AI is explicitly told NOT to predict them)
//   - identities or victims
//   - dispatch actions
//   - precise infrastructure safety assessments
//
// Per the brief: "Do NOT ask Muse Spark to predict exact coordinates,
// identities, victims, dispatch actions, or precise infrastructure
// safety. Use 'cannot determine' when evidence is insufficient."

import { z } from "zod";

export const INCIDENT_TYPES = [
  "flooding",
  "blocked_road",
  "debris",
  "visible_structural_damage",
  "other",
  "unclear",
] as const;

export const observationSchema = z.object({
  incident_type: z.enum(INCIDENT_TYPES),
  visible_evidence: z
    .array(z.string().max(500))
    .min(1)
    .max(20)
    .describe("Short factual observations of what is visible in the image"),
  preliminary_severity: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .describe("1–5 or null if cannot determine"),
  uncertainties: z
    .array(z.string().max(300))
    .max(10)
    .describe("What the model is uncertain about"),
  summary_en: z
    .string()
    .min(1)
    .max(1000)
    .describe("English summary of the visible evidence"),
  summary_tl: z
    .string()
    .min(1)
    .max(1000)
    .describe("Draft Tagalog summary"),
  needs_review: z
    .literal(true)
    .describe("Always true — the AI never marks itself verified"),
  segmentation_target: z
    .string()
    .max(100)
    .nullable()
    .describe("One concrete noun phrase for the segmentation target, or null"),
}).strict();

export type Observation = z.infer<typeof observationSchema>;

/**
 * The JSON schema sent to the Meta Model API as the
 * `response_format.json_schema` constraint. This is the FIRST
 * validation layer (the model's own structured-output enforcement).
 * The Zod schema above is the SECOND layer.
 *
 * Per the brief: "Prefer a JSON-schema-constrained response with a
 * second Zod validation layer."
 */
export const jsonSchemaForModel = {
  type: "object" as const,
  properties: {
    incident_type: {
      type: "string" as const,
      enum: [...INCIDENT_TYPES],
    },
    visible_evidence: {
      type: "array" as const,
      items: { type: "string" as const, maxLength: 500 },
      minItems: 1,
      maxItems: 20,
    },
    preliminary_severity: {
      type: ["integer", "null"] as const,
      minimum: 1,
      maximum: 5,
    },
    uncertainties: {
      type: "array" as const,
      items: { type: "string" as const, maxLength: 300 },
      maxItems: 10,
    },
    summary_en: {
      type: "string" as const,
      maxLength: 1000,
    },
    summary_tl: {
      type: "string" as const,
      maxLength: 1000,
    },
    needs_review: {
      type: "boolean" as const,
      const: true,
    },
    segmentation_target: {
      type: ["string", "null"] as const,
      maxLength: 100,
    },
  },
  required: [
    "incident_type",
    "visible_evidence",
    "preliminary_severity",
    "uncertainties",
    "summary_en",
    "summary_tl",
    "needs_review",
    "segmentation_target",
  ],
  additionalProperties: false,
} as const;

export const OBSERVATION_SCHEMA_VERSION = "v1";
