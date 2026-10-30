import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/0008_fix_geospatial_observation_projection.sql", "utf8");

describe("PostGIS incident type projection migration", () => {
  it("extracts incident_type directly from the aggregated observation JSON", () => {
    expect(sql.match(/ra_agg\.report_analyses -> 0 ->> 'incident_type'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/ra_agg\.report_analyses -> 0 -> 'structured_observation'/);
  });

  it("preserves security-invoker and event membership checks for both functions", () => {
    for (const name of ["nearby_reports", "viewport_reports"]) {
      const start = sql.indexOf("create or replace function public." + name + "(");
      const end = sql.indexOf("$$;", start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const body = sql.slice(start, end);
      expect(body).toContain("security invoker");
      expect(body).toContain("public.is_event_member(p_event_id)");
      expect(body).toContain("r.retention_state = 'active'");
    }
  });

  it("retains antimeridian support and avoids destructive DDL", () => {
    expect(sql).toContain("p_sw_lon <= p_ne_lon");
    expect(sql).toContain("ST_MakeEnvelope(-180, p_sw_lat, p_ne_lon, p_ne_lat, 4326)");
    expect(sql).not.toMatch(/\b(drop|truncate|delete from)\b\s+public\./i);
  });
});
