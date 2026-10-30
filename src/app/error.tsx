// src/app/error.tsx
//
// Next.js error boundary — catches unhandled errors in any route
// segment and shows a recoverable error UI instead of a blank page.
// The user can click "Try again" to re-render the segment.

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error server-side (Vercel captures console.error).
    // Do NOT log any user data — only the error message + digest.
    console.error("[error-boundary]", error.message, error.digest ?? "");
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
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          An unexpected error occurred. You can try again — your data is safe.
          If the problem persists, contact your administrator.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/70">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        <RotateCcw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
