import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_PROMPT } from "./prompt";

describe("visual evidence prompt", () => {
  it("uses the versioned civic evidence-extraction contract", () => {
    expect(PROMPT_VERSION).toBe("v2");
    expect(SYSTEM_PROMPT).toContain("Do not assume the image depicts a disaster");
    expect(SYSTEM_PROMPT).toContain("2–8 concrete visible_evidence observations");
    expect(SYSTEM_PROMPT).toContain('classify it as "other"');
    expect(SYSTEM_PROMPT).toContain('set incident_type to "unclear"');
    expect(SYSTEM_PROMPT).toContain("needs_review must ALWAYS be true");
    expect(USER_PROMPT).toContain("Never invent facts");
  });
});
