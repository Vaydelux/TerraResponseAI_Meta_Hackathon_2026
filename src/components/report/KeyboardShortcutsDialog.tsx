"use client";

// src/components/report/KeyboardShortcutsDialog.tsx
//
// Desktop/Laptop-only Keyboard Shortcuts Dialog built with shadcn/ui Dialog.
// Displays available navigation and action keys (F1, F2, F3, F4, ?, J/K, Enter, C/E/F/R)
// for the dashboard, ensuring it is only accessible and functional on desktop/laptop viewports (>= 1024px).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keyboard, ShieldCheck, Command, ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface ShortcutItem {
  key: string;
  label: string;
  description: string;
  href?: string;
  roles: string[];
}

export interface KeyboardShortcutsDialogProps {
  role?: string;
  pendingReviewCount?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  enableGlobalHotkeys?: boolean;
  showTrigger?: boolean;
  onKeyActivated?: (key: string) => void;
}

export function buildDashboardShortcuts(
  role: string,
  pendingReviewCount = 0
): ShortcutItem[] {
  const normalizedRole = role.toLowerCase();
  const canReview = normalizedRole === "reviewer" || normalizedRole === "admin";
  const isAdmin = normalizedRole === "admin";

  return [
    {
      key: "F1",
      label: "Incident Map",
      description: "Explore geospatial pins, hazard layers, and timeline",
      href: "/map",
      roles: ["reporter", "reviewer", "admin"],
    },
    canReview
      ? {
          key: "F2",
          label:
            pendingReviewCount > 0
              ? `Review Queue (${pendingReviewCount})`
              : "Review Queue",
          description: "Inspect and ratify pending AI observations",
          href: "/review",
          roles: ["reviewer", "admin"],
        }
      : {
          key: "F2",
          label: "All Reports",
          description: "Browse submitted reports in your active event",
          href: "/reports",
          roles: ["reporter"],
        },
    {
      key: "F3",
      label: "New Upload",
      description: "Submit a new field disaster photo with EXIF or map pin",
      href: "/reports/new",
      roles: ["reporter", "reviewer", "admin"],
    },
    canReview
      ? {
          key: "F4",
          label: isAdmin ? "Audit, Events & Spend" : "Audit Log",
          description: isAdmin
            ? "Inspect append-only audit trail, manage events, and view AI spend ceilings"
            : "Read the append-only verification audit log",
          href: "/audit",
          roles: ["reviewer", "admin"],
        }
      : {
          key: "F4",
          label: "My Profile",
          description: "View your contributor permissions and submission history",
          href: "/profile",
          roles: ["reporter"],
        },
  ];
}

export function KeyboardShortcutsDialog({
  role = "reviewer",
  pendingReviewCount = 0,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  enableGlobalHotkeys = false,
  showTrigger = false,
  onKeyActivated,
}: KeyboardShortcutsDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const dialogOpen = isControlled ? controlledOpen : internalOpen;
  const setDialogOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    controlledOnOpenChange?.(next);
  };

  const normalizedRole = role.toLowerCase();
  const canReview = normalizedRole === "reviewer" || normalizedRole === "admin";

  const primaryShortcuts = useMemo(
    () => buildDashboardShortcuts(role, pendingReviewCount),
    [role, pendingReviewCount]
  );

  const workbenchShortcuts: Array<{ key: string; label: string; detail: string }> =
    canReview
      ? [
          {
            key: "J / K",
            label: "Next / Previous Row",
            detail: "Move selection up or down in the Review Queue",
          },
          {
            key: "Enter",
            label: "Open Workbench",
            detail: "Open the selected report in the Review Workbench",
          },
          {
            key: "C",
            label: "Confirm Observation",
            detail: "Resolve the Verification Seal as human-confirmed",
          },
          {
            key: "E",
            label: "Edit & Correct",
            detail: "Open correction drawer to override incident type or severity",
          },
          {
            key: "F",
            label: "Flag for Escalation",
            detail: "Mark ambiguous evidence for secondary inspection",
          },
          {
            key: "R",
            label: "Reject Report",
            detail: "Reject invalid or duplicate submission with reason",
          },
        ]
      : [
          {
            key: "Tab",
            label: "Focus Navigation",
            detail: "Move between interactive cards and controls",
          },
          {
            key: "Enter",
            label: "Inspect Report",
            detail: "Open the focused report card for full details",
          },
        ];

  useEffect(() => {
    if (!enableGlobalHotkeys) return;

    function onKeyDown(e: KeyboardEvent) {
      // Strictly desktop/laptop only (>= 1024px)
      if (
        typeof window !== "undefined" &&
        window.innerWidth > 0 &&
        window.innerWidth < 1024
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape" && dialogOpen) {
        e.preventDefault();
        setDialogOpen(false);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setDialogOpen(!dialogOpen);
        return;
      }

      const matched = primaryShortcuts.find((s) => s.key === e.key);
      if (matched && matched.href) {
        e.preventDefault();
        onKeyActivated?.(matched.key);
        router.push(matched.href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableGlobalHotkeys, dialogOpen, primaryShortcuts, router, onKeyActivated]);

  const roleBadgeLabel =
    normalizedRole === "admin"
      ? "Admin Shortcuts"
      : normalizedRole === "reviewer"
      ? "Reviewer Shortcuts"
      : "Contributor Shortcuts";

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button
            type="button"
            className="shortcuts-bar__toggle hidden lg:inline-flex"
            data-desktop-only="true"
            aria-label="Open keyboard shortcuts dialog"
          >
            <span>All shortcuts</span>
            <kbd className="shortcuts-bar__kbd">?</kbd>
          </button>
        </DialogTrigger>
      )}
      <DialogContent
        id="shortcuts-dialog"
        data-desktop-only="true"
        className="hidden lg:grid sm:max-w-lg border-slate-700/80 bg-slate-950 text-slate-100 shadow-2xl rounded-2xl p-0 gap-0 overflow-hidden"
      >
        <div className="p-5 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md">
          <DialogHeader className="text-left gap-1.5">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
                  <Keyboard className="w-4 h-4" />
                </div>
                <DialogTitle className="text-lg font-bold tracking-tight text-white">
                  Keyboard Shortcuts
                </DialogTitle>
              </div>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-800/60 text-cyan-300">
                {roleBadgeLabel}
              </span>
            </div>
            <DialogDescription className="text-xs text-slate-400">
              Desktop &amp; laptop hotkeys for rapid command navigation and incident
              triage. Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[11px]">
                ?
              </kbd>{" "}
              anytime to toggle.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 mb-2.5 flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5" />
              <span>Dashboard &amp; Workspace Actions (F1–F4)</span>
            </div>
            <ul className="space-y-2">
              {primaryShortcuts.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-slate-700 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      <span>{item.label}</span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {item.description}
                    </div>
                  </div>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => setDialogOpen(false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold text-xs transition-colors shrink-0"
                    >
                      <span>{item.key}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-75" />
                    </Link>
                  ) : (
                    <kbd className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-cyan-300 font-mono font-bold text-xs shrink-0">
                      {item.key}
                    </kbd>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              {canReview
                ? "Review Queue & Workbench Keys"
                : "Report Inspection Keys"}
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {workbenchShortcuts.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/70"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {item.detail}
                    </div>
                  </div>
                  <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[11px] font-semibold shrink-0">
                    {item.key}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex items-center gap-2.5 text-xs text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Role-scoped for <strong>{normalizedRole}</strong> · Desktop/laptop
              keybindings only (disabled on mobile touch screens &amp; inside form
              inputs).
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
