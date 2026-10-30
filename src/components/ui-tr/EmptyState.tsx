// src/components/ui-tr/EmptyState.tsx
//
// Renders `.empty` (components.css §7.9): a bordered dashed panel
// with a heading, optional description, and optional action. Used
// by ReportList + the review queue when there's nothing to show.
//
// Server-component friendly.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional action rendered below the description (a Button, a link). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty", className)} role="status">
      <h3 className="empty__title">{title}</h3>
      {description && <p className="empty__desc">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
