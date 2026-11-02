"use client";

// src/components/report/KeyboardShortcutsDock.tsx
//
// Persistent floating Keyboard Shortcuts footer tip + expandable
// dialog on the dashboard. Dynamically reflects available actions
// based on the user's role (`reporter` vs `reviewer` vs `admin`).
//
// Keyboard bindings:
//   - F1: Upload a photo (/reports/new)
//   - F2: Review queue (/review) for reviewer/admin; All reports (/reports) for reporter
//   - F3: Incident map (/map)
//   - F4: Audit & Spend (/audit) for reviewer/admin; Profile (/profile) for reporter
//   - ? : Toggle the full Keyboard Shortcuts dialog
//   - Escape: Close the dialog when open

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keyboard, X, ChevronUp, ChevronDown, ShieldCheck } from "lucide-react";

export interface KeyboardShortcutsDockProps {
  role: string;
  pendingReviewCount?: number;
}

interface ShortcutItem {
  key: string;
  label: string;
  description: string;
  href?: string;
  roles: string[];
}

export function KeyboardShortcutsDock({
  role,
  pendingReviewCount = 0,
}: KeyboardShortcutsDockProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeKeyFlash, setActiveKeyFlash] = useState<string | null>(null);

  const normalizedRole = role.toLowerCase();
  const canReview = normalizedRole === "reviewer" || normalizedRole === "admin";
  const isAdmin = normalizedRole === "admin";

  const primaryShortcuts: ShortcutItem[] = [
    {
      key: "F1",
      label: "Upload Photo",
      description: "Submit a new field disaster photo with EXIF or map pin",
      href: "/reports/new",
      roles: ["reporter", "reviewer", "admin"],
    },
    canReview
      ? {
          key: "F2",
          label: pendingReviewCount > 0 ? `Review Queue (${pendingReviewCount})` : "Review Queue",
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
      label: "Incident Map",
      description: "Explore geospatial pins, hazard layers, and timeline",
      href: "/map",
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

  const workbenchShortcuts: Array<{ key: string; label: string; detail: string }> = canReview
    ? [
        { key: "J / K", label: "Next / Previous Row", detail: "Move selection up or down in the Review Queue" },
        { key: "Enter", label: "Open Workbench", detail: "Open the selected report in the Review Workbench" },
        { key: "C", label: "Confirm Observation", detail: "Resolve the Verification Seal as human-confirmed" },
        { key: "E", label: "Edit & Correct", detail: "Open correction drawer to override incident type or severity" },
        { key: "F", label: "Flag for Escalation", detail: "Mark ambiguous evidence for secondary inspection" },
        { key: "R", label: "Reject Report", detail: "Reject invalid or duplicate submission with reason" },
      ]
    : [
        { key: "Tab", label: "Focus Navigation", detail: "Move between interactive cards and controls" },
        { key: "Enter", label: "Inspect Report", detail: "Open the focused report card for full details" },
      ];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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
        setDialogOpen((v) => !v);
        return;
      }

      const matched = primaryShortcuts.find((s) => s.key === e.key);
      if (matched && matched.href) {
        e.preventDefault();
        setActiveKeyFlash(matched.key);
        router.push(matched.href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const roleBadgeLabel =
    normalizedRole === "admin"
      ? "Admin Shortcuts"
      : normalizedRole === "reviewer"
      ? "Reviewer Shortcuts"
      : "Contributor Shortcuts";

  return (
    <aside
      className="shortcuts-dock"
      aria-label="Keyboard shortcuts assistant"
    >
      {/* Expanded Floating Dialog */}
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="shortcuts-dialog-title"
          className="shortcuts-dialog"
        >
          <div className="shortcuts-dialog__head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Keyboard size={16} aria-hidden="true" style={{ color: "var(--tide)" }} />
              <h3 id="shortcuts-dialog-title" style={{ fontSize: "var(--step-0)", margin: 0 }}>
                Keyboard Shortcuts
              </h3>
              <span
                className="t-meta"
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "var(--tide-wash)",
                  color: "var(--tide)",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                }}
              >
                {roleBadgeLabel}
              </span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setDialogOpen(false)}
              aria-label="Close keyboard shortcuts dialog"
              style={{ width: 32, height: 32 }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="shortcuts-dialog__body">
            <div>
              <div className="t-label" style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 8 }}>
                Dashboard &amp; Workspace Navigation
              </div>
              <ul className="shortcuts-dialog__list">
                {primaryShortcuts.map((item) => (
                  <li key={item.key} className="shortcuts-dialog__row">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "var(--step--1)" }}>{item.label}</div>
                      <div className="t-meta" style={{ fontSize: "0.76rem" }}>{item.description}</div>
                    </div>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="shortcuts-kbd-pill"
                        onClick={() => setDialogOpen(false)}
                      >
                        {item.key}
                      </Link>
                    ) : (
                      <kbd className="shortcuts-kbd-pill">{item.key}</kbd>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ paddingTop: "var(--s-3)", borderTop: "1px solid var(--rule)" }}>
              <div className="t-label" style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 8 }}>
                {canReview ? "Review Queue & Workbench Actions" : "Report Inspection Controls"}
              </div>
              <ul className="shortcuts-dialog__list">
                {workbenchShortcuts.map((item) => (
                  <li key={item.key} className="shortcuts-dialog__row">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "var(--step--1)" }}>{item.label}</div>
                      <div className="t-meta" style={{ fontSize: "0.76rem" }}>{item.detail}</div>
                    </div>
                    <kbd className="shortcuts-kbd-pill">{item.key}</kbd>
                  </li>
                ))}
              </ul>
            </div>

            {!canReview && (
              <div
                className="t-meta"
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--r-ctl)",
                  background: "var(--sheet-sunk)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.76rem",
                }}
              >
                <ShieldCheck size={14} aria-hidden="true" style={{ color: "var(--tide)", flexShrink: 0 }} />
                <span>
                  Reviewer shortcuts (F2 Review Queue, C/E/F/R resolve keys) activate automatically when your account is granted Reviewer or Admin access.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent Footer Tip Bar */}
      <div className="shortcuts-bar">
        <div className="shortcuts-bar__left">
          <Keyboard size={15} aria-hidden="true" style={{ color: "var(--tide)", flexShrink: 0 }} />
          <span className="shortcuts-bar__role">{roleBadgeLabel}:</span>
        </div>

        <div className="shortcuts-bar__pills" role="list" aria-label="Role keyboard shortcuts">
          {primaryShortcuts.map((s) => (
            <Link
              key={s.key}
              href={s.href ?? "#"}
              role="listitem"
              className="shortcuts-bar__pill"
              data-active={activeKeyFlash === s.key ? "true" : undefined}
              title={s.description}
            >
              <kbd className="shortcuts-bar__kbd">{s.key}</kbd>
              <span>{s.label}</span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          className="shortcuts-bar__toggle"
          aria-expanded={dialogOpen}
          onClick={() => setDialogOpen((v) => !v)}
        >
          <span>{dialogOpen ? "Hide" : "All shortcuts"}</span>
          <kbd className="shortcuts-bar__kbd">?</kbd>
          {dialogOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}
