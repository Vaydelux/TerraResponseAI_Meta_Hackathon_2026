// src/components/layout/ThemeToggle.tsx
//
// Cycles day → night → auto. Persists to localStorage; sets
// `data-theme` AND `.dark` class on `<html>`, and dispatches a
// `tr-theme-change` window event so WebGL canvases (IncidentMap)
// and any other listeners stay in sync immediately.

"use client";

import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui-tr/Segmented";

export type ThemeMode = "day" | "night" | "auto";

const STORAGE_KEY = "tr-theme";

export function resolveIsNight(mode: ThemeMode): boolean {
  if (typeof window === "undefined") return false;
  if (mode === "night") return true;
  if (mode === "day") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function applyMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  const isNight = resolveIsNight(mode);
  root.classList.toggle("dark", isNight);
  root.style.colorScheme = isNight ? "dark" : "light";
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("tr-theme-change", { detail: { mode, isNight } }),
    );
  }
}

export function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "day" || stored === "night" || stored === "auto") return stored;
  } catch {
    // ignore storage errors
  }
  return "auto";
}

const SunIcon = (
  <svg width={14} height={14} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <circle cx={9} cy={9} r={3.4} />
    <path strokeLinecap="round" d="M9 1.5v2.2M9 14.3v2.2M1.5 9h2.2M14.3 9h2.2M3.5 3.5l1.6 1.6M12.9 12.9l1.6 1.6M3.5 14.5l1.6-1.6M12.9 5.1l1.6-1.6" />
  </svg>
);
const MoonIcon = (
  <svg width={14} height={14} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path d="M14 11.5A5.5 5.5 0 0 1 6.5 4a5 5 0 1 0 7.5 7.5Z" />
  </svg>
);
const AutoIcon = (
  <svg width={14} height={14} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path d="M3 9a6 6 0 0 1 12 0Z" fill="currentColor" stroke="none" />
    <path d="M3 9a6 6 0 0 0 12 0Z" />
  </svg>
);

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");

  useEffect(() => {
    const initial = readInitialTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(initial);
    applyMode(initial);

    const onExternalChange = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode; isNight: boolean }>;
      if (custom.detail?.mode) {
        setMode(custom.detail.mode);
      }
    };
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      const current = readInitialTheme();
      if (current === "auto") applyMode("auto");
    };

    window.addEventListener("tr-theme-change", onExternalChange);
    mql?.addEventListener?.("change", onMediaChange);
    return () => {
      window.removeEventListener("tr-theme-change", onExternalChange);
      mql?.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  function change(next: ThemeMode) {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — skip persistence
    }
    applyMode(next);
  }

  return (
    <Segmented<ThemeMode>
      aria-label="Theme"
      value={mode}
      onChange={change}
      options={[
        { value: "day", label: "Day", icon: SunIcon },
        { value: "night", label: "Night Ops", icon: MoonIcon },
        { value: "auto", label: "Auto", icon: AutoIcon },
      ]}
    />
  );
}
