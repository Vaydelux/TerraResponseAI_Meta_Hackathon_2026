// src/components/ui-tr/Toast.tsx
//
// Toast region + Toast component. The `.toast-region` is a fixed
// bottom-right stack; each `.toast` is a card with a 22px icon column
// (the kind indicator), the message column, and an optional action
// column. The CSS lives in components.css §7.9.
//
// The toast system uses a tiny event emitter (no Zustand dependency
// for the toast case — keeps the bundle light). Components call
// `toast.push({ kind, message, action })` to add a toast; the
// `<ToastRegion />` mounted once in the (app) layout subscribes.
//
// Client component — the region listens for window events.

"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastKind = "default" | "confirmed" | "error";

export interface ToastItem {
  id: string;
  kind?: ToastKind;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss after ms; default 5000. Set 0 to keep until dismissed. */
  ttl?: number;
}

const TOAST_EVENT = "ui-tr:toast";

type ToastListener = (item: ToastItem) => void;
const listeners = new Set<ToastListener>();

function emit(item: ToastItem) {
  for (const l of listeners) l(item);
}

export const toast = {
  push(item: Omit<ToastItem, "id">) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    emit({ id, ttl: 5000, kind: "default", ...item });
  },
  success(message: ReactNode, action?: ToastItem["action"]) {
    this.push({ kind: "confirmed", message, action });
  },
  error(message: ReactNode, action?: ToastItem["action"]) {
    this.push({ kind: "error", message, action, ttl: 0 });
  },
};

const KIND_ICON: Record<ToastKind, ReactNode> = {
  default: null,
  confirmed: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 9.2 7.2 12.7 14.4 5.4" />
    </svg>
  ),
  error: (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4.5 4.5 13.5 13.5" />
      <path d="M13.5 4.5 4.5 13.5" />
    </svg>
  ),
};

export function ToastRegion() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onItem(item: ToastItem) {
      setItems((prev) => [...prev, item]);
      if (item.ttl && item.ttl > 0) {
        window.setTimeout(() => {
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        }, item.ttl);
      }
    }
    listeners.add(onItem);
    return () => {
      listeners.delete(onItem);
    };
  }, []);

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div key={item.id} className="toast" data-kind={item.kind ?? "default"}>
          <span className="filecheck__icon" aria-hidden="true">
            {KIND_ICON[item.kind ?? "default"]}
          </span>
          <span>{item.message}</span>
          {item.action && (
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => {
                item.action?.onClick();
                setItems((prev) => prev.filter((i) => i.id !== item.id));
              }}
            >
              {item.action.label}
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label="Dismiss"
            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
              <path d="M3 3 11 11M11 3 3 11" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToastHost({ className }: { className?: string }) {
  return <ToastRegion />;
}

export function ToastInline({ item }: { item: ToastItem }) {
  return (
    <div className={cn("toast", `toast--${item.kind ?? "default"}`)}>
      <span>{item.message}</span>
    </div>
  );
}
