"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { applyMode, readInitialTheme } from "@/components/layout/ThemeToggle";

/**
 * Client-side providers shared across the whole app.
 * - ThemeProvider (next-themes) + synchronized TerraResponse `data-theme`
 *   ("day" | "night" | "auto") so every page honors the user's saved
 *   Day / Night Ops choice immediately on hydration.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyMode(readInitialTheme());
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
