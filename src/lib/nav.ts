import {
  LayoutDashboard,
  Upload,
  ClipboardCheck,
  Map as MapIcon,
  ScrollText,
  User as UserIcon,
  Files,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export type ViewId =
  | "dashboard"
  | "upload"
  | "review"
  | "map"
  | "audit"
  | "profile"
  | "reports";

export interface NavItem {
  id: ViewId;
  /** App Router path. `/login` is not in the nav (it's the auth entry). */
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["REPORTER", "REVIEWER", "ADMIN"],
    description: "Overview of incidents, review backlog, and your activity",
  },
  {
    id: "upload",
    href: "/reports/new",
    label: "Upload Photo",
    icon: Upload,
    roles: ["REPORTER", "REVIEWER", "ADMIN"],
    description: "Submit a disaster photo for AI analysis",
  },
  {
    id: "reports",
    href: "/reports",
    label: "Reports",
    icon: Files,
    roles: ["REPORTER", "REVIEWER", "ADMIN"],
    description: "Browse all reports you are authorized to see",
  },
  {
    id: "review",
    href: "/review",
    label: "Review Queue",
    icon: ClipboardCheck,
    roles: ["REVIEWER", "ADMIN"],
    description: "Confirm, flag, or reject AI-flagged reports",
  },
  {
    id: "map",
    href: "/map",
    label: "Incident Map",
    icon: MapIcon,
    roles: ["REPORTER", "REVIEWER", "ADMIN"],
    description: "Geospatial view of confirmed incidents",
  },
  {
    id: "audit",
    href: "/audit",
    label: "Audit Log",
    icon: ScrollText,
    roles: ["REVIEWER", "ADMIN"],
    description: "Security & compliance audit trail",
  },
  {
    id: "profile",
    href: "/profile",
    label: "Profile",
    icon: UserIcon,
    roles: ["REPORTER", "REVIEWER", "ADMIN"],
    description: "Your account and submission history",
  },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function defaultViewForRole(role: Role): ViewId {
  // First item the role can see. Reporters land on Dashboard; Reviewers land
  // on Dashboard too, but if Review Queue has items it would be more useful —
  // for Phase 1 we keep things simple and default to dashboard for everyone.
  return navForRole(role)[0]?.id ?? "profile";
}

/** Default redirect target for an authenticated user landing on `/`. */
export function defaultHrefForRole(role: Role): string {
  return navForRole(role)[0]?.href ?? "/profile";
}

/**
 * Bridge a Supabase profile role (lowercase text:
 * 'reporter'|'reviewer'|'admin') to the uppercase Role union used by
 * NAV_ITEMS and the Phase 1 view components. The profiles.role column
 * stores lowercase; the UI expects uppercase. This keeps both
 * consistent without a schema change.
 */
export function toNavRole(r: string): Role {
  if (r === "admin") return "ADMIN";
  if (r === "reviewer") return "REVIEWER";
  return "REPORTER";
}
