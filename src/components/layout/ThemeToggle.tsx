// src/components/layout/ThemeToggle.tsx
//
// Offers System, Light, and Dark mode via a clean, accessible DropdownMenu.
// Persists selection to localStorage, synchronizes .dark class and data-theme
// on <html>, and dispatches a tr-theme-change event for WebGL canvases (IncidentMap).

"use client";

import { useEffect, useSyncExternalStore } from "react";
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

/**
 * The persisted preference is the external store, so the initial client
 * render matches SSR ("system") and hydration never sets React state from
 * a synchronous effect. Subscriptions also cover a second tab/provider.
 */
function subscribeToTheme(notify: () => void): () => void {
  const onThemeChange = (event: Event) => {
    const mode = (event as CustomEvent<{ mode?: ThemeMode }>).detail?.mode;
    if (mode === "system" || mode === "light" || mode === "dark") {
      try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* private browsing */ }
    }
    notify();
  };
  const onPreferenceChange = () => notify();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    applyMode(readInitialTheme());
    notify();
  };
  window.addEventListener("tr-theme-change", onThemeChange);
  window.addEventListener("tr-theme-preference", onPreferenceChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("tr-theme-change", onThemeChange);
    window.removeEventListener("tr-theme-preference", onPreferenceChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribeToTheme, readInitialTheme, () => "system");

  useEffect(() => {
    applyMode(readInitialTheme());
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (readInitialTheme() === "system") applyMode("system");
    };
    mql?.addEventListener?.("change", onMediaChange);
    return () => mql?.removeEventListener?.("change", onMediaChange);
  }, []);

  function change(next: ThemeMode) {
    try { window.localStorage.setItem(STORAGE_KEY, next); }
    catch { /* Storage is unavailable; the DOM still responds. */ }
    window.dispatchEvent(new Event("tr-theme-preference"));
    if ((window as unknown as { __tr_has_theme_provider__?: boolean }).__tr_has_theme_provider__) {
      window.dispatchEvent(new CustomEvent("tr-theme-request", { detail: { mode: next } }));
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
