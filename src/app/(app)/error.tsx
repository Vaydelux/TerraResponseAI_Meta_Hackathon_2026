// src/app/(app)/error.tsx
//
// Error boundary for the authenticated (app) route group. Catches
// errors in any authenticated page (dashboard, reports, map, etc.)
// and shows a recoverable error UI with a "Back to dashboard" link.

"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error-boundary]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Page error</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This page encountered an error. You can try again or return to the dashboard.
          Your data is safe — no reports or reviews were affected.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/70">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="outline" size="sm">
          <RotateCcw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
