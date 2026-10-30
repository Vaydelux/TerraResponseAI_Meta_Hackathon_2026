// src/components/layout/PageHeader.tsx
//
// The page header: an h1 + optional subtitle on the left, optional
// actions on the right. Server-component friendly. Used by every
// workbench page (reports, review, audit) at the top of the `.tr-page`.
//
// The header is a simple flex row; the right side is reserved for
// primary CTAs + filter toggles. The h1 uses the base typography
// (Bricolage Grotesque via the `h1` element selector in base.css).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-side actions (a primary button, filter toggles, etc.). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("page-header", className)}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions tr-cluster">{actions}</div>}
    </header>
  );
}
