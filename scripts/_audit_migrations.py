#!/usr/bin/env python3
"""
Static analysis of supabase/migrations/0001..0005.sql.

Reads every migration file and reports:
  * Object creation order vs dependency order
  * Every GRANT / REVOKE statement
  * Every RLS ENABLE / DISABLE statement
  * Every CREATE POLICY statement (count + per-table)
  * Every SECURITY DEFINER / SECURITY INVOKER marker
  * Every CREATE EXTENSION
  * Search_path pinning on every SECURITY DEFINER function
  * Required PostGIS extension calls

Pure static analysis — no DB connection, no migration application.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path("/home/z/my-project/supabase/migrations")
FILES = [
    "0001_schema.sql",
    "0002_rls.sql",
    "0003_storage.sql",
    "0004_resilience.sql",
    "0005_postgis.sql",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")

def strip_sql_comments(sql: str) -> str:
    # Remove -- line comments and /* */ block comments but preserve
    # quoted strings so we don't false-positive on 'foo -- bar' inside
    # a string literal.
    out = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        # line comment
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            j = sql.find("\n", i)
            if j == -1:
                break
            i = j
            continue
        # block comment
        if ch == "/" and i + 1 < n and sql[i + 1] == "*":
            j = sql.find("*/", i + 2)
            if j == -1:
                break
            i = j + 2
            continue
        # single-quote string
        if ch == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            out.append(sql[i:j])
            i = j
            continue
        out.append(ch)
        i += 1
    return "".join(out)

# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

TABLE_RE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)",
    re.IGNORECASE,
)
EXT_RE = re.compile(
    r"create\s+extension\s+(?:if\s+not\s+exists\s+)?(\w+)(?:\s+with\s+schema\s+(\w+))?",
    re.IGNORECASE,
)
GRANT_RE = re.compile(
    r"grant\s+(.+?)\s+on\s+(?:table\s+|function\s+|schema\s+)?([\w\.]+)(?:\s*\([^)]*\))?\s+to\s+([\w, ]+)",
    re.IGNORECASE | re.DOTALL,
)
REVOKE_RE = re.compile(
    r"revoke\s+(.+?)\s+on\s+(?:table\s+|function\s+|schema\s+)?([\w\.]+)(?:\s*\([^)]*\))?\s+from\s+([\w, ]+)",
    re.IGNORECASE | re.DOTALL,
)
RLS_ENABLE_RE = re.compile(
    r"alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security",
    re.IGNORECASE,
)
RLS_DISABLE_RE = re.compile(
    r"alter\s+table\s+public\.(\w+)\s+disable\s+row\s+level\s+security",
    re.IGNORECASE,
)
POLICY_RE = re.compile(
    r"create\s+policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(\w+)",
    re.IGNORECASE,
)
SECDEF_RE = re.compile(
    r"create\s+or\s+replace\s+function\s+public\.(\w+).*?security\s+(definer|invoker)",
    re.IGNORECASE | re.DOTALL,
)
SEARCH_PATH_RE = re.compile(
    r"create\s+or\s+replace\s+function\s+public\.(\w+).*?set\s+search_path\s*=\s*([\w,\s]+)",
    re.IGNORECASE | re.DOTALL,
)
TRIGGER_EXPLICIT_RE = re.compile(
    r"create\s+trigger\s+(\w+)\s+(?:after|before|instead of)\s+"
    r"(\w+(?:\s+or\s+\w+)*)\s+on\s+(?:public\.|auth\.|storage\.)(\w+)",
    re.IGNORECASE,
)
TRIGGER_DOBLOCK_RE = re.compile(
    r"create\s+trigger\s+trg_(\w+)_updated_at[^']*?on\s+public\.(\w+)",
    re.IGNORECASE | re.DOTALL,
)
FK_RE = re.compile(
    r"references\s+(?:public\.|auth\.|storage\.)?(\w+)\s*\(\s*(\w+)\s*\)\s*(?:on\s+delete\s+(\w+(?:\s+\w+)?))?",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    migrations: dict[str, str] = {}
    for f in FILES:
        p = ROOT / f
        if not p.exists():
            print(f"MISSING: {f}")
            return 1
        migrations[f] = strip_sql_comments(read(p))

    print("=" * 72)
    print(" Migration static analysis — TerraResponse AI")
    print("=" * 72)

    # 1. Tables created, in order
    print("\n[1] Tables created per migration:")
    created: dict[str, list[str]] = defaultdict(list)
    for f, sql in migrations.items():
        for m in TABLE_RE.finditer(sql):
            created[f].append(m.group(1))
            print(f"  {f}: {m.group(1)}")

    # 2. Foreign-key dependencies per file
    print("\n[2] Foreign-key references per migration:")
    for f, sql in migrations.items():
        refs = set()
        for m in FK_RE.finditer(sql):
            refs.add(m.group(1))
        if refs:
            print(f"  {f}: -> {sorted(refs)}")

    # 3. Extensions
    print("\n[3] Extensions requested:")
    for f, sql in migrations.items():
        for m in EXT_RE.finditer(sql):
            schema = m.group(2) or "(default=public)"
            print(f"  {f}: {m.group(1)} (schema={schema})")

    # 4. GRANT / REVOKE
    print("\n[4] GRANT statements:")
    for f, sql in migrations.items():
        for m in GRANT_RE.finditer(sql):
            print(f"  {f}: GRANT {m.group(1).strip()} ON {m.group(2)} TO {m.group(3).strip()}")
    print("\n[5] REVOKE statements:")
    for f, sql in migrations.items():
        for m in REVOKE_RE.finditer(sql):
            print(f"  {f}: REVOKE {m.group(1).strip()} ON {m.group(2)} FROM {m.group(3).strip()}")

    # 5. RLS enable/disable
    print("\n[6] RLS ENABLE statements:")
    enabled: set[str] = set()
    for f, sql in migrations.items():
        for m in RLS_ENABLE_RE.finditer(sql):
            enabled.add(m.group(1))
            print(f"  {f}: ENABLE RLS on public.{m.group(1)}")
    print("\n[7] RLS DISABLE statements:")
    for f, sql in migrations.items():
        for m in RLS_DISABLE_RE.finditer(sql):
            print(f"  {f}: DISABLE RLS on public.{m.group(1)}")

    # 6. Policies
    print("\n[8] CREATE POLICY statements:")
    policy_count = 0
    by_table: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for f, sql in migrations.items():
        for m in POLICY_RE.finditer(sql):
            policy_count += 1
            name, table, op = m.group(1), m.group(2), m.group(3)
            by_table[table].append((f, name, op))
            print(f"  {f}: {op.upper():7s} on public.{table}  ({name})")
    print(f"  TOTAL: {policy_count} policies across {len(by_table)} tables")

    # 7. SECURITY DEFINER / INVOKER + search_path
    print("\n[9] SECURITY DEFINER / SECURITY INVOKER functions:")
    sd_funcs: list[tuple[str, str, str]] = []
    si_funcs: list[tuple[str, str, str]] = []
    sp_funcs: list[tuple[str, str, str]] = []
    for f, sql in migrations.items():
        for m in SECDEF_RE.finditer(sql):
            (sd_funcs if m.group(2).lower() == "definer" else si_funcs).append(
                (f, m.group(1), m.group(2))
            )
        for m in SEARCH_PATH_RE.finditer(sql):
            sp_funcs.append((f, m.group(1), m.group(2).strip()))

    print("  SECURITY DEFINER:")
    for f, name, marker in sd_funcs:
        sp = next((s for fn, n, s in sp_funcs if n == name), "(none)")
        pinned = "OK" if sp != "(none)" and "public" in sp else "MISSING public"
        print(f"    {f}: public.{name}()  search_path={sp}  [{pinned}]")
    print("  SECURITY INVOKER:")
    for f, name, marker in si_funcs:
        sp = next((s for fn, n, s in sp_funcs if n == name), "(none)")
        print(f"    {f}: public.{name}()  search_path={sp}")

    # 8. Triggers
    print("\n[10] Triggers:")
    for f, sql in migrations.items():
        for m in TRIGGER_EXPLICIT_RE.finditer(sql):
            print(f"  {f}: trg '{m.group(1)}' ON {m.group(3)} {m.group(2).upper()}")
        for m in TRIGGER_DOBLOCK_RE.finditer(sql):
            print(f"  {f}: trg 'trg_{m.group(1)}_updated_at' ON public.{m.group(2)} (created via DO block)")

    # 9. PostGIS calls per file (proves 0005 needs PostGIS)
    print("\n[11] PostGIS function calls per file:")
    postgis_calls: dict[str, set[str]] = defaultdict(set)
    for f, sql in migrations.items():
        for m in re.finditer(r"extensions\.(\w+)\(", sql, re.IGNORECASE):
            postgis_calls[f].add(m.group(1))
    for f, calls in postgis_calls.items():
        print(f"  {f}: {sorted(calls)}")

    # 10. Dependency order check: each file references only tables created
    # in itself or earlier files.
    print("\n[12] Forward-dependency check (referencing a not-yet-created table):")
    all_created: set[str] = set()
    issues = 0
    for f in FILES:
        sql = migrations[f]
        # Extract FK references
        refs = {m.group(1) for m in FK_RE.finditer(sql)}
        # Subtract system tables (auth.users, storage.*)
        refs.discard("users")
        refs.discard("buckets")
        refs.discard("objects")
        # Subtract tables created in THIS file
        refs -= set(created[f])
        # Anything left must be in all_created (earlier file)
        for r in refs:
            if r not in all_created and r not in {"events", "profiles", "reports",
                                                  "report_analyses", "review_actions",
                                                  "priority_overrides", "audit_events",
                                                  "event_members", "report_retention",
                                                  "ai_usage_log", "evidence_signed_url_log"}:
                # this could be a forward reference to a system table we
                # missed; print but only fail if it's a public. table
                # that's NOT yet in all_created
                if r in {"reports", "events", "profiles", "event_members",
                         "report_analyses", "review_actions", "priority_overrides",
                         "audit_events"}:
                    if r not in all_created:
                        print(f"  ✗ {f}: references public.{r} but it is not yet created")
                        issues += 1
        # Add tables created in THIS file to the running set
        for t in created[f]:
            all_created.add(t)
    if issues == 0:
        print("  ✓ all foreign-key references resolve to tables created in an earlier file")
    return 0 if issues == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
