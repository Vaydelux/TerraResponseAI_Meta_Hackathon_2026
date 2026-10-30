"use client";

import { ThemeProvider } from "next-themes";

/**
 * Client-side providers shared across the whole app.
 * - ThemeProvider (next-themes) — drives light/dark mode via `class`
 *   strategy. `enableSystem={true}` allows following the OS preference;
 *   the user can override via the theme toggle in the header.
 */
export function Providers({ children }: { children: React.ReactNode }) {
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
