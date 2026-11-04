"use client";

import type { Ref } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";
import type { AuthContext } from "@/lib/auth/profile";

/**
 * Persistent compact command header. Primary route navigation now lives in
 * WorkspaceSidebar; keep account and appearance actions available here.
 */
export interface TopBarProps {
  ctx: AuthContext;
  mobileOpen?: boolean;
  onToggleNavigation?: () => void;
  menuToggleRef?: Ref<HTMLButtonElement>;
  className?: string;
}

export function TopBar({
  ctx,
  mobileOpen = false,
  onToggleNavigation,
  menuToggleRef,
  className,
}: TopBarProps) {
  const pathname = usePathname() ?? "";
  return (
    <header className={cn(
      "sticky top-0 z-50 flex h-16 min-w-0 items-center gap-2 border-b border-rule bg-sheet px-3 sm:gap-3 sm:px-5 lg:px-6",
      className,
    )}>
      <button
        ref={menuToggleRef}
        type="button"
        className="grid size-11 shrink-0 place-items-center rounded-ctl border border-rule text-ink transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] lg:hidden motion-reduce:transition-none"
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-controls="workspace-mobile-sidebar"
        aria-expanded={mobileOpen}
        onClick={onToggleNavigation}
      >
        {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      <Wordmark
        href="/dashboard"
        className="min-h-11 min-w-0 rounded-ctl px-1 transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] motion-reduce:transition-none [&_.wordmark__name]:text-sm max-[379px]:[&_.wordmark__name]:text-[12px] max-[379px]:[&_.wordmark__mark]:size-6"
      />

      <div className="hidden min-w-0 items-center gap-2 border-l border-rule pl-4 lg:flex">
        <span className="size-2 shrink-0 rounded-full bg-tide" aria-hidden="true" />
        <span className="truncate text-xs font-semibold text-[var(--ink-2)]">Command center</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="hidden sm:block"><ThemeToggle /></div>
        <UserMenu key={`${ctx.user.id}:${pathname}`} user={ctx.user} />
      </div>
    </header>
  );
}
