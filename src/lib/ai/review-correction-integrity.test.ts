import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { observationSchema } from "@/lib/ai/observation-schema";

const sql = readFileSync(
  "supabase/migrations/20261103151000_review_correction_strict_observation.sql", "utf8",
);

const modelOutput = {
  incident_type: "flooding" as const,
  visible_evidence: ["Standing water is visible on the road"],
  preliminary_severity: 3 as const,
  uncertainties: ["Water depth cannot be confirmed from the photo"],
  summary_en: "Flooded road observed",
  summary_tl: "May baha sa kalsada",
  needs_review: true as const,
  segmentation_target: "standing water",
};

describe("review correction preserves strict Meta observation", () => {
  it("retains valid image observation fields when a reviewer corrects severity", () => {
    const corrected = { ...modelOutput, preliminary_severity: 4 };
    expect(observationSchema.safeParse(corrected).success).toBe(true);
    expect(observationSchema.safeParse({ ...corrected, _corrected_by: "reviewer" }).success).toBe(false);
  });
  it("keeps original source and reviewer provenance outside model JSON", () => {
    expect(sql).toContain("v_after := v_before || p_corrections;");
    expect(sql).toContain("raw_usage_metadata =");
    expect(sql).toContain("'_original_model_output', v_original");
    expect(sql).toContain("'_corrected_by', v_actor");
    expect(sql).toContain("previous_observation, new_observation");
    expect(sql).not.toContain("v_after := v_before || p_corrections ||");
  });
  it("keeps authorization, atomic review and narrow RPC grants intact", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("where r.id = p_report_id for update");
    expect(sql).toContain("from public, anon;");
    expect(sql).toContain("to authenticated;");
  });
});
