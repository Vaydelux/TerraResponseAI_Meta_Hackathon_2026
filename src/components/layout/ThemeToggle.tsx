// src/components/layout/ThemeToggle.tsx
//
// Cycles day → night → auto. Persists to localStorage; sets
// `data-theme` on `<html>`. The auto state falls back to the
// `prefers-color-scheme` media query (the tokens.css handles the
// actual variable swap).
//
// Client component — needs DOM access to write localStorage + the
// `data-theme` attribute. We mount-read once to set the initial
// state (no flash of wrong theme — the CSS prefers-color-scheme
// fallback handles SSR).

"use client";

import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui-tr/Segmented";

type ThemeMode = "day" | "night" | "auto";

const STORAGE_KEY = "tr-theme";

function applyMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
}

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "day" || stored === "night" || stored === "auto") return stored;
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

  // Mount-read — runs after hydration (the localStorage isn't
  // available during SSR). The initial state is "auto" so the SSR
  // markup matches the first client paint; we update to the stored
  // value (or auto) after mount. The setState-in-effect pattern is
  // standard for client-only external state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(readInitial());
  }, []);

  function change(next: ThemeMode) {
    setMode(next);
    applyMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — skip persistence
    }
  }

  return (
    <Segmented<ThemeMode>
      aria-label="Theme"
      value={mode}
      onChange={change}
      options={[
        { value: "day", label: "Day", icon: SunIcon },
        { value: "night", label: "Night", icon: MoonIcon },
        { value: "auto", label: "Auto", icon: AutoIcon },
      ]}
    />
  );
}
