// src/components/layout/EventSwitcher.tsx
//
// A popover showing the active event + the user's full event list.
// Selecting an event sets a cookie (`tr-active-event`) so the
// selection survives navigations; the route handlers read it via
// getAuthContext (which falls back to the user's first event when
// the cookie is absent).
//
// Client component — needs DOM access to write the cookie + manage
// the popover state. Uses the `ui-tr-popover` CSS surface.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CalendarDays, Check } from "lucide-react";
import type { UserEventMembership } from "@/lib/auth/profile";

const ACTIVE_EVENT_COOKIE = "tr-active-event";

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_EVENT_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(eventId: string) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${ACTIVE_EVENT_COOKIE}=${encodeURIComponent(eventId)}; expires=${expires}; path=/; samesite=lax`;
}

export interface EventSwitcherProps {
  events: UserEventMembership[];
  /** Called when the user picks an event; receives the new event id. */
  onSelect?: (eventId: string) => void;
}

export function EventSwitcher({ events, onSelect }: EventSwitcherProps) {
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Mount-read the cookie; default to the first event. We read on
  // the client only (the cookie isn't available during SSR); the
  // initial state is null and we update after mount. This is the
  // standard pattern for client-only external state — the lint
  // rule's "no setState in effect" warning is overly aggressive for
  // this case.
  useEffect(() => {
    const stored = readCookie();
    if (stored && events.some((e) => e.event_id === stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(stored);
    } else if (events.length > 0) {
      setActiveId(events[0].event_id);
      writeCookie(events[0].event_id);
    }
  }, [events]);

  // Restore predictable dismiss behavior without trapping keyboard focus
  // in this lightweight popover.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !popoverRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When the user picks an event, write the cookie + notify.
  function handleSelect(id: string) {
    setActiveId(id);
    writeCookie(id);
    setOpen(false);
    onSelect?.(id);
    // Pages and server components read the active-event cookie; refresh
    // to avoid showing a previous event\'s queue or map after switching.
    router.refresh();
  }

  const active = events.find((e) => e.event_id === activeId) ?? null;

  return (
    <div ref={popoverRef} className="ui-tr-popover" data-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-tr-popover__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Switch active event"
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={14} aria-hidden="true" />
        <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active ? active.event_name : "Select event"}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="ui-tr-popover__body ui-tr-popover__body--bottom-right" role="group" aria-label="Select active event">
          <div className="field__label" style={{ padding: "8px 10px 4px" }}>
            Your events
          </div>
          {events.length === 0 && (
            <div style={{ padding: "8px 10px", color: "var(--ink-3)" }}>
              You are not a member of any event yet.
            </div>
          )}
          {events.map((e) => (
            <button
              key={e.event_id}
              type="button"
              className="ui-tr-popover__item"
              aria-current={e.event_id === activeId || undefined}
              onClick={() => handleSelect(e.event_id)}
            >
              <span style={{ flex: 1, display: "grid", gap: 2, textAlign: "left" }}>
                <span style={{ fontWeight: 600 }}>{e.event_name}</span>
                <span className="t-meta">
                  {e.role} · {e.event_status.replace(/_/g, " ")}
                </span>
              </span>
              {e.event_id === activeId && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
