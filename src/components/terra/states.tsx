"use client";

import { Loader2, Inbox, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-screen loading for initial session check. */
export function FullScreenLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Inline loading skeleton for view content. */
export function ViewLoading({ label = "Loading data…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Empty state with optional CTA. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-base font-medium">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/** Inline error state with retry. */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <AlertCircle className="h-6 w-6 text-destructive" />
      <div>
        <h3 className="text-base font-medium text-destructive">{title}</h3>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

/** Generic skeleton block with shimmer animation. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("terra-skeleton rounded-md", className)} aria-hidden="true" />;
}

/** A row of skeleton lines (for list items). */
export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3" aria-hidden="true">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-3/4" : "w-1/2")} />
        ))}
      </div>
      <Skeleton className="h-6 w-12" />
    </div>
  );
}
