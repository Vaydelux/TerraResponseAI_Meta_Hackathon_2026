"use client";

// src/components/report/KeyboardShortcutsDock.tsx
//
// Desktop/Laptop-only Keyboard Shortcuts Dock & Modal Overlay on the dashboard.
// Dynamically reflects available actions based on the user's role (`reporter` vs `reviewer` vs `admin`).
//
// Keyboard bindings (Desktop / Laptop only):
//   - F1: Incident Map (/map)
//   - F2: Review Queue (/review) for reviewer/admin; All Reports (/reports) for reporter
//   - F3: New Upload (/reports/new)
//   - F4: Audit & Spend (/audit) for reviewer/admin; Profile (/profile) for reporter
//   - ? : Toggle the full Keyboard Shortcuts Modal
//   - Escape: Close the modal when open

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Keyboard } from "lucide-react";
import {
  KeyboardShortcutsDialog,
  buildDashboardShortcuts,
  type KeyboardShortcutsDialogProps,
} from "./KeyboardShortcutsDialog";

export { KeyboardShortcutsDialog, type KeyboardShortcutsDialogProps };

export interface KeyboardShortcutsDockProps {
  role: string;
  pendingReviewCount?: number;
}

export function KeyboardShortcutsDock({
  role,
  pendingReviewCount = 0,
}: KeyboardShortcutsDockProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeKeyFlash, setActiveKeyFlash] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const normalizedRole = role.toLowerCase();

  const primaryShortcuts = useMemo(
    () => buildDashboardShortcuts(role, pendingReviewCount),
    [role, pendingReviewCount]
  );

  const roleBadgeLabel =
    normalizedRole === "admin"
      ? "Admin Shortcuts"
      : normalizedRole === "reviewer"
      ? "Reviewer Shortcuts"
      : "Contributor Shortcuts";

  return (
    <aside
      className="shortcuts-dock hidden lg:flex"
      aria-label="Desktop keyboard shortcuts assistant"
      data-desktop-only="true"
    >
      {/* Shadcn / Material 3 Keyboard Shortcuts Modal Dialog (Desktop/Laptop only) */}
      <KeyboardShortcutsDialog
        role={role}
        pendingReviewCount={pendingReviewCount}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            toggleRef.current?.focus();
          }
        }}
        enableGlobalHotkeys={true}
        onKeyActivated={setActiveKeyFlash}
      />

      {/* Persistent Desktop Footer Tip Bar */}
      <div className="shortcuts-bar">
        <div className="shortcuts-bar__left">
          <Keyboard
            size={15}
            aria-hidden="true"
            style={{ color: "var(--tide)", flexShrink: 0 }}
          />
          <span className="shortcuts-bar__role">{roleBadgeLabel}:</span>
        </div>

        <div
          className="shortcuts-bar__pills"
          role="list"
          aria-label="Role keyboard shortcuts"
        >
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
          ref={toggleRef}
          type="button"
          className="shortcuts-bar__toggle"
          aria-expanded={dialogOpen}
          aria-controls="shortcuts-dialog"
          onClick={() => setDialogOpen((v) => !v)}
        >
          <span>{dialogOpen ? "Hide" : "Keyboard Shortcuts"}</span>
          <kbd className="shortcuts-bar__kbd">?</kbd>
        </button>
      </div>
    </aside>
  );
}
