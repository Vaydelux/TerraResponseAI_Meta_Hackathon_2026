"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { signOutAction } from "@/lib/auth/actions";
import type { UserProfile } from "@/lib/auth/profile";

const ROLE_LABEL: Record<string, string> = { reporter: "Reporter", reviewer: "Reviewer", admin: "Admin" };
export interface UserMenuProps { user: UserProfile }

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}
      className="flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none">
      <LogOut size={16} aria-hidden="true" /><span aria-live="polite">{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

/** Portaled popup keeps the account menu clear of header overflow and restores focus on close. */
export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const displayName = user.name?.trim() || user.email.trim() || "Your account";
  const initials = Array.from(displayName)[0].toUpperCase();
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-ctl border border-rule bg-sheet p-1.5 text-ink transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] data-[state=open]:border-tide data-[state=open]:bg-[var(--tide-wash)] motion-reduce:transition-none" aria-label={`Account: ${user.email}`}>
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-tide text-sm font-bold text-[var(--on-tide)]">{initials}</span>
        <span className="hidden max-w-32 truncate text-sm min-[1700px]:inline">{displayName}</span><ChevronDown className="hidden size-3.5 min-[1700px]:block" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} aria-label="Account menu" className="grid max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[calc(100vw-24px)] gap-2 overflow-y-auto overscroll-contain border-rule bg-sheet p-3 text-ink motion-reduce:animate-none">
      <div className="grid min-w-0 gap-1 border-b border-rule p-2 pb-3"><strong className="break-words text-sm [overflow-wrap:anywhere]">{user.name || "Your account"}</strong><span className="break-all text-xs text-[var(--ink-3)]">{user.email}</span><span className="text-xs text-[var(--ink-2)]">Role · {ROLE_LABEL[user.role] ?? user.role}</span></div>
      <Link className="flex min-h-11 items-center gap-2 rounded-ctl px-2 text-sm font-semibold text-ink transition-colors hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)] motion-reduce:transition-none" href="/profile" onClick={() => setOpen(false)}><UserIcon size={16} aria-hidden="true" />Profile</Link>
      <form action={signOutAction}><SignOutButton /></form>
    </PopoverContent>
  </Popover>;
}
