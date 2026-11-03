"use client";

import { useLinkStatus } from "next/link";

// A tiny per-link hint while prefetch/route transition is not ready yet.
// This does not fetch data or interfere with native Next.js Link behavior.
export function NavPendingIndicator() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`tr-nav-pending${pending ? " is-pending" : ""}`} />;
}
