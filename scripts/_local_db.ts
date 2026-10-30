// scripts/_local_db.ts
//
// Local PostgreSQL test harness using PGlite (PostgreSQL 16 in WASM,
// running in-process). Used to replay migrations 0001-0006 from
// scratch and run real RLS / trigger / retention tests.
//
// What PGlite supports:
//   - SQL (PostgreSQL 16 dialect)
//   - RLS policies (USING + WITH CHECK)
//   - SECURITY DEFINER / SECURITY INVOKER functions
//   - Triggers (BEFORE / AFTER, INSERT / UPDATE / DELETE)
//   - CHECK constraints, foreign keys, unique, GiST (via builtin)
//   - gen_random_uuid() builtin (PG 13+)
//   - plpgsql, sql languages
//
// What PGlite does NOT support:
//   - The PostGIS extension (no `extensions.postgis` available)
//   - The Supabase auth schema (auth.users, auth.uid(), auth.jwt())
//   - The Supabase storage schema (storage.buckets, storage.objects)
//   - The PostgREST HTTP API (no `supabase.from(...).select(...)`)
//
// How we handle the gaps:
//   - We STUB `auth.uid()` / `auth.jwt()` as PG functions that read
//     a GUC (`request.jwt.claim.sub` / `request.jwt.claims`). Tests
//     set the GUC via `set local request.jwt.claim.sub = '<uuid>'`
//     before running queries — the same convention used by the
//     supabase/tests/test_rls.sql file.
//   - We STUB `auth.users` as a regular table so the trigger from
//     0001 compiles. The trigger body (`handle_new_user`) inserts
//     into `public.profiles` — we exercise that directly.
//   - We DO NOT install the PostGIS migration (0005) in PGlite.
//     PostGIS-specific behavior is validated two other ways:
//       1. Static parse via the SQL splitter (the SQL is syntactically
//          valid; the schema-qualified `extensions.ST_*` calls are
//          well-formed).
//       2. The user runs `supabase db push` + the SQL tests in
//          supabase/tests/test_rls.sql against a real local Supabase
//          with PostGIS enabled. The PGlite test harness explicitly
//          marks the PostGIS-related tests as SKIPPED.
//
// This harness is DISPOSABLE: the dataDir is removed and recreated
// on every run. No persistent state. No remote connections.

import { PGlite } from "@electric-sql/pglite";
import { splitSql } from "./_sql_split";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface StatementResult {
  index: number;
  statement: string;
  ok: boolean;
  error?: string;
  durationMs?: number;
}

export interface MigrationResult {
  file: string;
  total: number;
  applied: number;
  failed: number;
  results: StatementResult[];
  durationMs: number;
}

export async function newLocalDb(dataDir: string): Promise<PGlite> {
  // PGlite takes a dataDir; the harness caller is responsible for
  // cleaning it between runs.
  const pg = new PGlite({ dataDir });
  await setupStubs(pg);
  return pg;
}

async function setupStubs(pg: PGlite): Promise<void> {
  // Roles — match the Supabase role names used in the migrations.
  // Plain `create role` with try/catch (PGlite handles IF NOT EXISTS
  // differently for roles — the DO block version doesn't always
  // persist across connections in PGlite's WASM backend).
  for (const role of ["authenticated", "anon", "service_role"]) {
    try {
      await pg.query(`create role ${role}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Role already exists — fine.
      if (!msg.includes("already exists")) {
        // ignore other errors
      }
    }
  }

  // Schema USAGE grants — the `public` schema gets USAGE for public
  // by default in PostgreSQL. The `auth` and `storage` schemas do
  // NOT (they're owned by the superuser). Supabase grants USAGE to
  // authenticated + anon on these schemas. We replicate that here
  // so the RLS policies can be exercised by the test roles.
  await pg.query("create schema if not exists auth");
  await pg.query("create schema if not exists storage");
  try {
    await pg.query("grant usage on schema public to authenticated, anon");
    await pg.query("grant usage on schema storage to authenticated, anon");
    await pg.query("grant usage on schema auth to authenticated, anon");
  } catch (e) {
    // ignore — may already be granted
  }

  // auth schema + auth.uid() / auth.jwt() stubs.
  await pg.query(`
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  await pg.query(`
    create or replace function auth.jwt()
    returns json
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claims', true), '')::json
    $$;
  `);

  // auth.users — required by the trg_handle_new_user trigger.
  await pg.query(`
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      role text default 'authenticated',
      aud text default 'authenticated',
      instance_id uuid default '00000000-0000-0000-0000-000000000000'
    );
  `);

  // storage schema + storage.foldername(text) stub.
  await pg.query(`
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await pg.query(`
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text not null,
      owner uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      metadata jsonb
    );
  `);
  // storage.foldername(text) — splits a path on '/' and returns text[].
  await pg.query(`
    create or replace function storage.foldername(p_name text)
    returns text[]
    language sql
    immutable
    as $$
      select string_to_array(p_name, '/')
    $$;
  `);
  // Enable RLS on storage.objects (Supabase does this by default on every
  // project; PGlite doesn't). Without this, the storage policies in
  // 0003_storage.sql would have no effect in the test environment.
  try {
    await pg.query("alter table storage.objects enable row level security");
  } catch (e) {
    // ignore — may already be enabled or no permission
  }
  // Grant SELECT on storage.objects to authenticated + anon (the
  // RLS policies gate which rows they can see). The Supabase default
  // grants this; we replicate it.
  try {
    await pg.query("grant select on storage.objects to authenticated, anon");
    await pg.query("grant select on storage.buckets to authenticated, anon");
  } catch (e) {
    // ignore
  }
}

export async function applyMigration(
  pg: PGlite,
  file: string,
  options: { skipPostgis?: boolean } = {},
): Promise<MigrationResult> {
  const path = resolve(process.cwd(), "supabase/migrations", file);
  let sql = readFileSync(path, "utf-8");

  // Strip the pgcrypto extension line — PG 13+ has gen_random_uuid()
  // builtin and PGlite doesn't have the extension.
  sql = sql.replace(/create extension if not exists pgcrypto;\s*\n/g, "");

  // For migrations that include PostGIS-specific SQL (0005_postgis.sql
  // and 0006_security_fixes.sql § 11/16), we can't actually run the
  // extensions.ST_* calls — PGlite doesn't have PostGIS. We stub:
  //   - The `extensions` schema becomes a regular schema.
  //   - `extensions.geography(POINT, 4326)` becomes `text` (a
  //     placeholder column type; the geo column is null in tests).
  //   - `extensions.ST_SetSRID(x, 4326)` becomes `x` (passthrough).
  //   - `extensions.ST_MakePoint(lon, lat)` becomes a JSON string
  //     ('{"lon": ..., "lat": ...}') so the column has *something*.
  //   - `extensions.ST_DWithin(a, b, r)` becomes `true` (all rows
  //     match — the function-level membership check still gates
  //     access; the radius is not actually applied in PGlite).
  //   - `extensions.ST_Distance(a, b)` becomes `0` (placeholder).
  //   - `extensions.ST_Intersects(a, b)` becomes `true` (all rows
  //     match — the antimeridian OR is still evaluated as a no-op).
  //   - `extensions.ST_MakeEnvelope(...)` becomes `null` (placeholder).
  //
  // The PostGIS tests in supabase/tests/phase18_security_tests.sql
  // are SKIPPED in PGlite. They MUST be re-run against a real
  // Supabase project with PostGIS enabled to validate the actual
  // spatial behavior. The PGlite run only validates that the SQL
  // COMPILES + the non-spatial policies + triggers work.
  if (options.skipPostgis) {
    sql = sql.replace(
      /create extension if not exists postgis with schema extensions;\s*\n/g,
      "-- (skipped: postgis extension not available in PGlite)\n",
    );
    sql = sql.replace(
      /create schema if not exists extensions;\s*\n/g,
      "-- (skipped: extensions schema not needed in PGlite)\n",
    );
    // Stub the extensions schema + functions
    await pg.query("create schema if not exists extensions");
    try {
      await pg.query("create domain if not exists extensions.geography_point_4326 as text");
    } catch (e) { /* ignore */ }
    sql = sql.replace(
      /extensions\.geography\(POINT, 4326\)/g,
      "text",
    );
    sql = sql.replace(
      /extensions\.geography/g,
      "text",
    );
    // Stub the PostGIS functions
    for (const stub of [
      `create or replace function extensions.st_setsrid(geom anyelement, srid int)
        returns anyelement language sql immutable as $$ select geom $$`,
      `create or replace function extensions.st_makepoint(x double precision, y double precision)
        returns text language sql immutable as $$ select '(' || x || ',' || y || ')'::text $$`,
      `create or replace function extensions.st_distance(a anyelement, b anyelement)
        returns double precision language sql immutable as $$ select 0::double precision $$`,
      `create or replace function extensions.st_dwithin(a anyelement, b anyelement, r double precision)
        returns boolean language sql immutable as $$ select true $$`,
      `create or replace function extensions.st_intersects(a anyelement, b anyelement)
        returns boolean language sql immutable as $$ select true $$`,
      `create or replace function extensions.st_makeenvelope(
        minx double precision, miny double precision,
        maxx double precision, maxy double precision,
        srid int default 4326)
        returns text language sql immutable as $$ select null::text $$`,
    ]) {
      try {
        await pg.query(stub);
      } catch (e) {
        // ignore if exists
      }
    }
    // The GiST index on the geo column fails because we stubbed `geo`
    // as `text` (which has no GiST operator class). Skip the index
    // creation in PGlite — it's a PGlite-stub limitation, not a real
    // migration bug. On real PostgreSQL with PostGIS, the geography
    // type has a GiST operator class.
    sql = sql.replace(
      /create index if not exists idx_reports_geo_gist[^;]*;/g,
      "-- (skipped: GiST index on text column not supported in PGlite stub)\n",
    );
  }

  const stmts = splitSql(sql);
  const results: StatementResult[] = [];
  let applied = 0;
  let failed = 0;
  const start = Date.now();

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const t0 = Date.now();
    try {
      await pg.query(stmt);
      applied++;
      results.push({ index: i, statement: stmt, ok: true, durationMs: Date.now() - t0 });
    } catch (e) {
      failed++;
      results.push({
        index: i,
        statement: stmt,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - t0,
      });
    }
  }

  return {
    file,
    total: stmts.length,
    applied,
    failed,
    results,
    durationMs: Date.now() - start,
  };
}

/**
 * Set the current authenticated user (via JWT sub claim) for the
 * current transaction. Use inside a `begin`/`commit` block:
 *   await pg.query("begin");
 *   await setLocalUser(pg, "11111111-...");
 *   // ... queries run as that user ...
 *   await pg.query("commit");
 */
export async function setLocalUser(pg: PGlite, userId: string): Promise<void> {
  await pg.query(`set local role authenticated`);
  await pg.query(`set local request.jwt.claim.sub = '${userId}'`);
  await pg.query(`set local request.jwt.claims = '{"sub":"${userId}"}'`);
}

export async function setAnon(pg: PGlite): Promise<void> {
  await pg.query("set local role anon");
  await pg.query("set local request.jwt.claim.sub = ''");
  await pg.query("set local request.jwt.claims = '{}'");
}

export async function setServiceRole(pg: PGlite): Promise<void> {
  // The service_role bypasses RLS on Supabase. In PGlite, the
  // equivalent is the table owner / superuser — we reset role to
  // the default and use the unprivileged "postgres" superuser.
  await pg.query("reset role");
  await pg.query("set local request.jwt.claim.sub = ''");
  await pg.query("set local request.jwt.claims = '{}'");
}
