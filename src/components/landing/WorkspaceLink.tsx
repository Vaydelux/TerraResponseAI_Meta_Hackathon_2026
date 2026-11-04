import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceLink({ signedIn = false, className }: { signedIn?: boolean; className?: string }) {
  return (
    <a href={signedIn ? "/dashboard" : "/login"} className={cn("inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-[var(--r-ctl)] bg-[var(--tide)] px-4 py-3 text-center text-sm font-semibold text-[var(--on-tide)] transition-colors hover:bg-[var(--tide-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tide)] active:bg-[var(--tide-press)] motion-reduce:transition-none", className)}>
      <span>{signedIn ? "Open workspace" : "Sign in to workspace"}</span>
      <ArrowUpRight size={16} className="shrink-0" aria-hidden="true" />
    </a>
  );
}
