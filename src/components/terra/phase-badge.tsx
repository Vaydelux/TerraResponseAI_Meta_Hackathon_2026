"use client";

import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Visual marker placed on views whose full functionality lands in a later
 * phase. The Phase 1 shell wires the navigation, role gating, loading/empty/
 * error states, and audit hooks; the data-heavy features arrive in Phases 2-6.
 */
export function PhaseBadge({
  phase,
  label,
}: {
  phase: string;
  label: string;
}) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-400/60 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
    >
      <Construction className="h-3 w-3" />
      {phase}: {label}
    </Badge>
  );
}

export function ViewHeading({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
