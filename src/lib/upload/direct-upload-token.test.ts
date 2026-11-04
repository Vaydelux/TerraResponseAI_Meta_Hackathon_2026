import { describe, expect, it, beforeEach } from "vitest";
import { createDirectUploadGrant, verifyDirectUploadGrant } from "./direct-upload-token";

describe("direct upload grants", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-signing-secret";
  });

  it("binds a short-lived grant to the authenticated user and object path", () => {
    const token = createDirectUploadGrant({ userId: "user-1", eventId: "event-1", reportId: "report-1", path: "event-1/report-1.jpg" });
    expect(verifyDirectUploadGrant(token)).toMatchObject({ userId: "user-1", eventId: "event-1", reportId: "report-1" });
    expect(verifyDirectUploadGrant(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"))).toBeNull();
  });

  it("rejects expired grants", () => {
    const token = createDirectUploadGrant({ userId: "user-1", eventId: "event-1", reportId: "report-1", path: "event-1/report-1.jpg" }, -1);
    expect(verifyDirectUploadGrant(token)).toBeNull();
  });
});
