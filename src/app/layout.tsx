import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/terra/providers";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { ToastRegion } from "@/components/ui-tr/Toast";
import { isDemoMode } from "@/lib/demo-mode";

// TerraResponse AI design system fonts (per docs/DESIGN.md §4):
//   - Bricolage Grotesque: headings, numerals, the wordmark. A
//     variable-width grotesque with character at large sizes.
//   - Public Sans: all UI + body. Designed for government interfaces,
//     excellent legibility + tabular figures.
// The CSS variables --font-bricolage + --font-public are consumed by
// src/app/styles/tokens.css (--font-display, --font-ui).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz", "wdth"],
  display: "swap",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public",
  display: "swap",
});

// Legacy shadcn fonts — kept so existing shadcn/ui components still
// resolve their --font-geist-* variables during the migration.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TerraResponse AI — Disaster-Photo Intelligence",
    template: "%s · TerraResponse AI",
  },
  description:
    "Authenticated disaster-photo upload, AI image analysis, schema-validated human review, explainable prioritization, and an incident map. Built for the Meta Global AI Developer Hackathon.",
  keywords: [
    "TerraResponse",
    "disaster response",
    "AI image understanding",
    "human review",
    "Supabase Auth",
    "Prisma",
    "hackathon",
  ],
  authors: [{ name: "TerraResponse Team" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "TerraResponse AI",
    description:
      "Disaster-photo intelligence & human review for emergency response teams.",
    siteName: "TerraResponse AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TerraResponse AI",
    description:
      "Disaster-photo intelligence & human review for emergency response teams.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Phase 14: render the demo banner at the top of EVERY page (login,
  // dashboard, map, etc.) when DEMO_MODE=1. The banner is the first
  // element in the body so it's impossible to miss. Per the brief:
  // "Any simulation must be visibly identified as demonstration data,
  // not a live disaster report."
  //
  // The demo-mode check is in the (app) layout too (for the
  // authenticated routes) — the root layout's banner covers the
  // /login page (which is outside the (app) route group).
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bricolage.variable} ${publicSans.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {/* Skip-to-content link for keyboard + screen-reader users (a11y).
              Visible only when focused; jumps to #main-content. */}
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          {isDemoMode() && <DemoBanner />}
          {children}
          <SonnerToaster position="top-right" richColors closeButton />
          <ToastRegion />
        </Providers>
      </body>
    </html>
  );
}
