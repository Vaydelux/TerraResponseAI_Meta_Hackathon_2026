// src/components/layout/ThemeToggle.tsx
//
// Offers System, Light, and Dark mode via a clean, accessible DropdownMenu.
// Persists selection to localStorage, synchronizes .dark class and data-theme
// on <html>, and dispatches a tr-theme-change event for WebGL canvases (IncidentMap).

"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "tr-theme";

export function resolveIsNight(mode: ThemeMode | string): boolean {
  if (typeof window === "undefined") return false;
  if (mode === "dark" || mode === "night") return true;
  if (mode === "light" || mode === "day" || mode === "mist") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function applyMode(mode: ThemeMode | string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isNight = resolveIsNight(mode);

  if (mode === "system" || mode === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", isNight ? "dark" : "light");
  }

  root.classList.toggle("dark", isNight);
  root.style.colorScheme = isNight ? "dark" : "light";

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("tr-theme-change", { detail: { mode, isNight } }),
    );
  }
}

export function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "system" || stored === "light" || stored === "dark") return stored;
    // Map legacy options if present in client storage
    if (stored === "day" || stored === "mist") return "light";
    if (stored === "night") return "dark";
    if (stored === "auto") return "system";
  } catch {
    // ignore storage errors
  }
  return "system";
}

export function ThemeToggle() {
  // The initial markup must match server rendering; storage is synchronized after mount.
  const [mode, setMode] = useState<ThemeMode>("system");
  const modeRef = useRef<ThemeMode>("system");

  useEffect(() => {
    const initial = readInitialTheme();
    modeRef.current = initial;
    setMode(initial);
    applyMode(initial);

    const onExternalChange = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode; isNight: boolean }>;
      if (custom.detail?.mode) {
        const nextMode = custom.detail.mode;
        if (nextMode === "system" || nextMode === "light" || nextMode === "dark") {
          modeRef.current = nextMode;
          setMode(nextMode);
        }
      }
    };

    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      const current = modeRef.current;
      if (current === "system") applyMode("system");
    };

    window.addEventListener("tr-theme-change", onExternalChange);
    mql?.addEventListener?.("change", onMediaChange);
    return () => {
      window.removeEventListener("tr-theme-change", onExternalChange);
      mql?.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  function change(next: ThemeMode) {
    modeRef.current = next;
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable
    }
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __tr_has_theme_provider__?: boolean }).__tr_has_theme_provider__
    ) {
      window.dispatchEvent(
        new CustomEvent("tr-theme-request", { detail: { mode: next } })
      );
    } else {
      applyMode(next);
    }
  }

  // Display icon corresponding to current setting
  const ActiveIcon =
    mode === "system"
      ? Monitor
      : mode === "light"
      ? Sun
      : Moon;

  const activeLabel =
    mode === "system" ? "System" : mode === "light" ? "Light" : "Dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 min-w-11 gap-2 rounded-ctl border-rule bg-sheet px-3 text-ink transition-colors hover:bg-[var(--tide-wash)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] motion-reduce:transition-none" aria-label={`Select theme. Current: ${activeLabel}`}>
          <ActiveIcon className="size-4 shrink-0 text-tide" aria-hidden="true" /><span className="hidden sm:inline">{activeLabel}</span><ChevronDown className="hidden size-3 shrink-0 sm:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 max-w-[calc(100vw-24px)] rounded-panel border-rule bg-sheet p-1 text-ink shadow-md motion-reduce:animate-none">
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => change(value as ThemeMode)}>
          {([{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }] as const).map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="min-h-11 cursor-pointer gap-2 rounded-ctl pr-3 text-sm text-ink data-[state=checked]:bg-[var(--tide-wash)] data-[state=checked]:font-semibold data-[highlighted]:bg-[var(--sheet-sunk)] data-[highlighted]:text-ink focus-visible:outline-2 focus-visible:outline-tide active:bg-[var(--tide-wash)]"><Icon className="size-4 text-tide" aria-hidden="true" />{label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
