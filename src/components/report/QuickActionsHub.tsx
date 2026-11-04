"use client";

// src/components/report/QuickActionsHub.tsx
//
// Interactive Quick Actions Hub for the Commander Dashboard with
// live F1–F4 keyboard shortcut bindings (desktop/laptop only).
// Ignores keystrokes when focused inside an input/textarea/select
// or contenteditable element.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, CheckSquare, Map, FileText, Keyboard, Zap } from "lucide-react";

export interface QuickActionsHubProps {
  canReview: boolean;
  disableGlobalHotkeys?: boolean;
}

export function QuickActionsHub({
  canReview,
  disableGlobalHotkeys = false,
}: QuickActionsHubProps) {
  const router = useRouter();
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);

  const actions = [
    {
      key: "F1",
      label: "Incident Map",
      sub: "Geospatial pins & layers",
      href: "/map",
      icon: Map,
    },
    {
      key: "F2",
      label: canReview ? "Review Queue" : "All Reports",
      sub: canReview ? "Verify AI observations" : "Browse submitted reports",
      href: canReview ? "/review" : "/reports",
      icon: CheckSquare,
    },
    {
      key: "F3",
      label: "New Upload",
      sub: "Upload field photo & EXIF",
      href: "/reports/new",
      icon: Upload,
    },
    {
      key: "F4",
      label: canReview ? "Audit & Spend Log" : "Responder Profile",
      sub: canReview ? "Append-only provenance" : "Permissions & submissions",
      href: canReview ? "/audit" : "/profile",
      icon: FileText,
    },
  ];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Desktop / Laptop only check: ignore keybindings on mobile / narrow touch viewports (< 1024px)
      if (typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth < 1024) {
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

      if (e.key === "F1") {
        setLastTriggered("F1");
        if (!disableGlobalHotkeys) {
          e.preventDefault();
          router.push("/map");
        }
      } else if (e.key === "F2") {
        setLastTriggered("F2");
        if (!disableGlobalHotkeys) {
          e.preventDefault();
          router.push(canReview ? "/review" : "/reports");
        }
      } else if (e.key === "F3") {
        setLastTriggered("F3");
        if (!disableGlobalHotkeys) {
          e.preventDefault();
          router.push("/reports/new");
        }
      } else if (e.key === "F4") {
        setLastTriggered("F4");
        if (!disableGlobalHotkeys) {
          e.preventDefault();
          router.push(canReview ? "/audit" : "/profile");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, canReview, disableGlobalHotkeys]);

  return (
    <section className="panel" aria-labelledby="quick-actions-heading" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <Zap size={18} aria-hidden="true" style={{ color: "var(--tide)" }} />
          <h2 id="quick-actions-heading" style={{ fontSize: "var(--step-1)", margin: 0 }}>
            Quick Actions Hub
          </h2>
        </div>
        <p className="t-meta" style={{ marginTop: 4 }}>
          Direct operational triggers. All review and upload actions are logged to the audit trail.
        </p>
      </div>

      <div className="quick-actions-grid">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="quick-action-btn"
              aria-label={`${item.label} (${item.key})`}
            >
              <div className="quick-action-btn__top">
                <Icon size={18} aria-hidden="true" />
                <kbd className="quick-action-btn__kbd hidden lg:inline-block">{item.key}</kbd>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "var(--step-0)" }}>{item.label}</div>
                <div className="t-meta" style={{ fontSize: "var(--step--1)", marginTop: 2 }}>
                  {item.sub}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div
        className="t-meta num hidden lg:flex"
        style={{
          marginTop: "auto",
          paddingTop: "var(--s-3)",
          borderTop: "1px solid var(--rule)",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--s-2)",
        }}
      >
        <span>
          {lastTriggered
            ? `SHORTCUT ${lastTriggered} DISPATCHED`
            : "DESKTOP KEYBOARD SHORTCUTS ENABLED (F1–F4)"}
        </span>
        <Keyboard size={16} aria-hidden="true" />
      </div>
    </section>
  );
}

