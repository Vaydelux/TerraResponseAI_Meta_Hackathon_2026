import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("supported evidence image MIME types", () => {
  it("keeps database CHECK compatible with server upload validation", () => {
    const sql = read("supabase/migrations/0009_support_webp_report_uploads.sql");
    const route = read("src/app/api/reports/route.ts");
    const validator = read("src/lib/storage/image-validate.ts");
    expect(sql).toMatch(/image_mime_type in \('image\/jpeg', 'image\/png', 'image\/webp'\)/);
    expect(route).toContain('"image/webp": "webp"');
    expect(validator).toContain('"image/webp"');
  });
  it("keeps a forward-only migration that does not modify stored reports", () => {
    const sql = read("supabase/migrations/0009_support_webp_report_uploads.sql");
    expect(sql).toContain("reports_image_mime_type_check");
    expect(sql).not.toMatch(/\btruncate\b|\bdelete from\b|\bdrop table\b/i);
  });
});
