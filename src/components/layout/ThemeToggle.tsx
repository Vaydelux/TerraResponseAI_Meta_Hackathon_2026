// src/components/layout/ThemeToggle.tsx
//
// Offers System, Light, and Dark mode via a clean, accessible DropdownMenu.
// Persists selection to localStorage, synchronizes .dark class and data-theme
// on <html>, and dispatches a tr-theme-change event for WebGL canvases (IncidentMap).

"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return readInitialTheme();
  });

  useEffect(() => {
    applyMode(mode);

    const onExternalChange = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode; isNight: boolean }>;
      if (custom.detail?.mode) {
        const nextMode = custom.detail.mode;
        if (nextMode === "system" || nextMode === "light" || nextMode === "dark") {
          setMode(nextMode);
        }
      }
    };

    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      const current = readInitialTheme();
      if (current === "system") applyMode("system");
    };

    window.addEventListener("tr-theme-change", onExternalChange);
    mql?.addEventListener?.("change", onMediaChange);
    return () => {
      window.removeEventListener("tr-theme-change", onExternalChange);
      mql?.removeEventListener?.("change", onMediaChange);
    };
  }, [mode]);

  function change(next: ThemeMode) {
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
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-2 border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white rounded-lg transition-colors font-medium text-xs focus-visible:ring-1 focus-visible:ring-cyan-500"
          aria-label="Select theme"
        >
          <ActiveIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="hidden sm:inline capitalize">{activeLabel}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-36 bg-slate-950/95 border-slate-800 text-slate-200 shadow-xl backdrop-blur-md rounded-xl p-1"
      >
        <DropdownMenuItem
          onClick={() => change("light")}
          className={`flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer ${
            mode === "light"
              ? "bg-cyan-950/60 text-cyan-300 font-semibold"
              : "hover:bg-slate-800/80 text-slate-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            Light
          </span>
          {mode === "light" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => change("dark")}
          className={`flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer ${
            mode === "dark"
              ? "bg-cyan-950/60 text-cyan-300 font-semibold"
              : "hover:bg-slate-800/80 text-slate-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <Moon className="w-3.5 h-3.5 text-cyan-400" />
            Dark
          </span>
          {mode === "dark" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => change("system")}
          className={`flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer ${
            mode === "system"
              ? "bg-cyan-950/60 text-cyan-300 font-semibold"
              : "hover:bg-slate-800/80 text-slate-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5 text-slate-400" />
            System
          </span>
          {mode === "system" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
