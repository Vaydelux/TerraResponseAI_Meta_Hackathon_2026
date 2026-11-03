// src/components/layout/UserMenu.tsx
//
// Avatar + email popover with links to /profile and sign-out.
// Uses the native popover CSS surface (.ui-tr-popover). Sign-out
// calls the existing `signOutAction` server action.

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import type { UserProfile } from "@/lib/auth/profile";

const ROLE_LABEL: Record<string, string> = {
  reporter: "Reporter",
  reviewer: "Reviewer",
  admin: "Admin",
};

export interface UserMenuProps {
  user: UserProfile;
}

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  const initials = (user.name || user.email).slice(0, 1).toUpperCase();
  return (
    <div className="ui-tr-popover" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-tr-popover__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account: ${user.email}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: "var(--r-pill)",
            background: "var(--tide)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {initials}
        </span>
        <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.name || user.email}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="ui-tr-popover__body ui-tr-popover__body--bottom-right"
          role="dialog"
          aria-modal="false"
          aria-label="Account menu"
        >
          <div style={{ padding: "8px 10px 6px", display: "grid", gap: 2 }}>
            <span style={{ fontWeight: 700 }}>{user.name || "User"}</span>
            <span className="t-meta" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.email}
            </span>
            <span className="t-meta">Role · {ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
          <div className="ui-tr-popover__sep" />
          <a className="ui-tr-popover__item" href="/profile" onClick={() => setOpen(false)}>
            <UserIcon size={14} aria-hidden="true" />
            <span>Profile</span>
          </a>
          <button
            type="button"
            className="ui-tr-popover__item"
            onClick={() => {
              setOpen(false);
              void signOutAction();
            }}
          >
            <LogOut size={14} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
