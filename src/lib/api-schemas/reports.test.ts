// src/lib/api-schemas/reports.test.ts
//
// Pure-function Zod schema tests for the report upload metadata.

import { describe, it, expect } from "vitest";
import { reportUploadMetaSchema } from "@/lib/api-schemas/reports";

// A valid v4 UUID (Zod v4's .uuid() enforces RFC 4122 v1-8; the
// 3rd group's first hex must be 1-8, the 4th group's first hex
// must be 8/9/a/b). All-zeros or all-ones UUIDs are accepted but
// look fake; a v4 UUID is realistic.
const VALID_EVENT_ID = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const VALID_REPORT_ID = "12345678-4abc-4def-8abc-1234567890ab";

describe("reportUploadMetaSchema", () => {
  it("accepts a minimal valid metadata (eventId only)", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.eventId).toBe(VALID_EVENT_ID);
      expect(r.data.title).toBeUndefined();
      expect(r.data.locationSource).toBeUndefined();
    }
  });

  it("accepts a fully populated metadata", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      title: "Flooding on Main Street",
      description: "Heavy rain caused flooding up to 2 feet deep.",
      latitude: 35.595,
      longitude: -82.555,
      locationSource: "manual",
      locationLabel: "Main Street, Asheville",
      linkToReportId: VALID_REPORT_ID,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID eventId", () => {
    const r = reportUploadMetaSchema.safeParse({ eventId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing eventId", () => {
    const r = reportUploadMetaSchema.safeParse({ title: "Missing event" });
    expect(r.success).toBe(false);
  });

  it("rejects title over 200 chars", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      title: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("rejects description over 5000 chars", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      description: "x".repeat(5001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects latitude out of range", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      latitude: 91,
    });
    expect(r.success).toBe(false);
  });

  it("rejects latitude < -90", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      latitude: -91,
    });
    expect(r.success).toBe(false);
  });

  it("rejects longitude > 180", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      longitude: 181,
    });
    expect(r.success).toBe(false);
  });

  it("rejects longitude < -180", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      longitude: -181,
    });
    expect(r.success).toBe(false);
  });

  it("accepts boundary lat/lng values (-90, 90, -180, 180)", () => {
    const r1 = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      latitude: -90, longitude: -180,
    });
    const r2 = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      latitude: 90, longitude: 180,
    });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it("rejects an invalid locationSource enum value", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      locationSource: "approximate",
    });
    expect(r.success).toBe(false);
  });

  it("accepts each locationSource enum value", () => {
    for (const s of ["gps", "manual", "unknown"] as const) {
      const r = reportUploadMetaSchema.safeParse({
        eventId: VALID_EVENT_ID,
        locationSource: s,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects linkToReportId that's not a UUID", () => {
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      linkToReportId: "not-a-uuid",
    });
    expect(r.success).toBe(false);
  });

  it("ignores unknown extra keys (strips them via zod default behavior)", () => {
    // Zod's .object() default is to strip unknown keys. The route handler
    // doesn't see them, so a malicious client can't inject extra fields
    // into the meta object.
    const r = reportUploadMetaSchema.safeParse({
      eventId: VALID_EVENT_ID,
      maliciousField: "should be stripped",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).maliciousField).toBeUndefined();
    }
  });
});
