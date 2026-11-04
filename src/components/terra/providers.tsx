// src/components/terra/providers.tsx
//
// Application-wide ThemeProvider & Client Providers.
// Integrates with shadcn/ui (class-based .dark attribute) and provides
// seamless toggling between "system", "light", and "dark" modes across all pages
// with a smooth cross-fade animation when switching between light and dark modes.

"use client";

import "@/lib/utils/patch-fetch";
import React, { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  applyMode,
  readInitialTheme,
  resolveIsNight,
  type ThemeMode,
} from "@/components/layout/ThemeToggle";

export interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  resolvedTheme: "light" | "dark";
  systemTheme?: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "dark",
});

/**
 * Access the active theme ("system" | "light" | "dark"), resolved theme,
 * and updater function anywhere in the client component tree.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  storageKey?: string;
  attribute?: React.ComponentProps<typeof NextThemesProvider>["attribute"];
  enableSystem?: boolean;
}

const CROSSFADE_STYLE_ID = "tr-theme-crossfade-style";

/**
 * First-class ThemeProvider integrating shadcn/ui with TerraResponse AI.
 * Includes smooth cross-fade animation when transitioning between light and dark modes.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "tr-theme",
  attribute = "class",
  enableSystem = true,
}: ThemeProviderProps) {
  const [, startTransition] = useTransition();
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      return readInitialTheme();
    }
    return defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return resolveIsNight(readInitialTheme()) ? "dark" : "light";
    }
    return "dark";
  });

  // Inject Material 3 cross-fade transition styles into document head on client mount
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (!document.getElementById(CROSSFADE_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = CROSSFADE_STYLE_ID;
      style.textContent = `
        /* Material 3 Motion & Surface Cross-Fade Tokens */
        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation-duration: 350ms;
          animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
        }
        ::view-transition-old(root) {
          animation-name: tr-m3-fade-out;
        }
        ::view-transition-new(root) {
          animation-name: tr-m3-fade-in;
        }
        @keyframes tr-m3-fade-out {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(0.996);
          }
        }
        @keyframes tr-m3-fade-in {
          0% {
            opacity: 0;
            transform: scale(1.004);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        /* Material 3 CSS Cross-Fade Transition across all surfaces */
        html.tr-theme-crossfade,
        html.tr-theme-crossfade body,
        html.tr-theme-crossfade header,
        html.tr-theme-crossfade nav,
        html.tr-theme-crossfade main,
        html.tr-theme-crossfade aside,
        html.tr-theme-crossfade footer,
        html.tr-theme-crossfade section,
        html.tr-theme-crossfade article,
        html.tr-theme-crossfade .panel,
        html.tr-theme-crossfade .topbar,
        html.tr-theme-crossfade .card,
        html.tr-theme-crossfade .feed-hazard-filter-bar,
        html.tr-theme-crossfade [data-slot],
        html.tr-theme-crossfade [role="dialog"],
        html.tr-theme-crossfade button,
        html.tr-theme-crossfade input,
        html.tr-theme-crossfade select,
        html.tr-theme-crossfade textarea,
        html.tr-theme-crossfade h1,
        html.tr-theme-crossfade h2,
        html.tr-theme-crossfade h3,
        html.tr-theme-crossfade h4,
        html.tr-theme-crossfade p,
        html.tr-theme-crossfade span,
        html.tr-theme-crossfade svg,
        html.tr-theme-crossfade a {
          transition: background-color 350ms cubic-bezier(0.2, 0, 0, 1),
                      border-color 350ms cubic-bezier(0.2, 0, 0, 1),
                      color 260ms cubic-bezier(0.2, 0, 0, 1),
                      box-shadow 350ms cubic-bezier(0.2, 0, 0, 1),
                      fill 350ms cubic-bezier(0.2, 0, 0, 1),
                      stroke 350ms cubic-bezier(0.2, 0, 0, 1) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          ::view-transition-old(root),
          ::view-transition-new(root) {
            animation: none !important;
          }
          html.tr-theme-crossfade,
          html.tr-theme-crossfade * {
            transition: none !important;
            animation: none !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Synchronize on external theme events, requests, or system changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __tr_has_theme_provider__?: boolean }).__tr_has_theme_provider__ = true;
    }

    applyMode(theme);
    const isNight = resolveIsNight(theme);
    startTransition(() => {
      setResolvedTheme(isNight ? "dark" : "light");
    });

    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode; isNight: boolean }>;
      if (custom.detail?.mode && custom.detail.mode !== theme) {
        startTransition(() => {
          setThemeState(custom.detail.mode);
          setResolvedTheme(custom.detail.isNight ? "dark" : "light");
        });
      }
    };

    const onThemeRequest = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode }>;
      if (custom.detail?.mode) {
        applyThemeWithCrossFade(custom.detail.mode);
      }
    };

    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (theme === "system") {
        applyThemeWithCrossFade("system");
      }
    };

    window.addEventListener("tr-theme-change", onThemeChange);
    window.addEventListener("tr-theme-request", onThemeRequest);
    mql?.addEventListener?.("change", onMediaChange);

    return () => {
      if (typeof window !== "undefined") {
        (window as unknown as { __tr_has_theme_provider__?: boolean }).__tr_has_theme_provider__ = false;
      }
      window.removeEventListener("tr-theme-change", onThemeChange);
      window.removeEventListener("tr-theme-request", onThemeRequest);
      mql?.removeEventListener?.("change", onMediaChange);
    };
  }, [theme]);

  function triggerCrossFadeTransition(applyChanges: () => void) {
    if (typeof document === "undefined") {
      applyChanges();
      return;
    }

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (prefersReducedMotion) {
      applyChanges();
      return;
    }

    // Use native View Transitions if supported for full-canvas cross-fade
    const doc = document as unknown as {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(() => {
        applyChanges();
      });
      return;
    }

    // Fallback: apply smooth Material 3 CSS cross-fade class on <html>
    const root = document.documentElement;
    root.classList.add("tr-theme-crossfade");

    applyChanges();

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      root.classList.remove("tr-theme-crossfade");
    }, 400);
  }

  function applyThemeWithCrossFade(next: ThemeMode) {
    triggerCrossFadeTransition(() => {
      startTransition(() => {
        setThemeState(next);
        setResolvedTheme(resolveIsNight(next) ? "dark" : "light");
      });
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // storage unavailable
      }
      applyMode(next);
    });
  }

  function setTheme(next: ThemeMode) {
    applyThemeWithCrossFade(next);
  }

  const contextValue: ThemeContextValue = {
    theme,
    setTheme,
    resolvedTheme,
    systemTheme:
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
  };

  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
    >
      <ThemeContext.Provider value={contextValue}>
        {children}
      </ThemeContext.Provider>
    </NextThemesProvider>
  );
}

/**
 * Root Client Providers wrapper for layout.tsx.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
