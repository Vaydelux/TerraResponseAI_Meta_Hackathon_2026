"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteError({
  title = "This workspace section is unavailable",
  error,
  reset,
}: {
  title?: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The rest of TerraResponse is still available. Retry this section or return to the dashboard.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" onClick={reset} className="min-h-12">
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Retry
        </Button>
        <Button asChild variant="ghost" className="min-h-12">
          <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Dashboard</Link>
        </Button>
      </div>
    </section>
  );
}
