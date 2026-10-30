import type { Role } from "@/lib/types";

/**
 * Pure authorization rules — no server-side imports (no `next/headers`,
 * no `@supabase/ssr`, no DB client). Safe to unit-test in Vitest
 * without any Next.js context or DB connection.
 *
 * The session-requiring helpers (`getAuthContext`, `requireServerUser`)
 * live in `src/lib/auth/profile.ts` and `src/lib/supabase/server.ts` and
 * compose these rules.
 */

/** Minimal report shape for authz (replaces the old Prisma Report type). */
interface ReportShape {
  reporterId: string;
  status: string;
}

export interface AuthSession {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
}

// --- Report-level access -----------------------------------------------------

export function canAccessReport(
  user: AuthSession,
  report: Pick<ReportShape, "reporterId">,
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "REVIEWER") return true;
  return report.reporterId === user.id;
}

export function canMutateReport(
  user: AuthSession,
  report: Pick<ReportShape, "reporterId" | "status">,
): boolean {
  if (user.role === "ADMIN") return true;
  // Reporters can edit/delete only their own UPLOADED/ANALYZING reports
  // (once a report enters human review, only reviewers/admins can act on it).
  // For the MVP the rule is the same for EDIT and DELETE; if they diverge
  // later (e.g. REPORTER can DELETE but not EDIT), split into two functions.
  if (user.role === "REPORTER" && report.reporterId === user.id) {
    return ["UPLOADED", "ANALYZING"].includes(report.status);
  }
  return false;
}

export function canActOnReview(user: AuthSession): boolean {
  return user.role === "ADMIN" || user.role === "REVIEWER";
}

/**
 * Returns a Prisma `where` clause that limits Report reads to what `user` is
 * allowed to see. Equivalent to a Supabase RLS policy on the `reports` table.
 */
export function reportReadWhere(user: AuthSession) {
  if (user.role === "ADMIN" || user.role === "REVIEWER") {
    return {}; // all rows
  }
  return { reporterId: user.id }; // reporter-only
}

/**
 * Can the user see a given view in the SPA? Mirrors `NAV_ITEMS` role filters.
 */
export function canSeeView(
  user: AuthSession,
  viewRoles: Role[],
): boolean {
  return viewRoles.includes(user.role);
}
