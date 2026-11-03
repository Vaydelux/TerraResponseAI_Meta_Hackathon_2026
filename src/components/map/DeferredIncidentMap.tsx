"use client";

import dynamic from "next/dynamic";
import type { IncidentMapProps } from "./IncidentMap";
import { Skeleton } from "@/components/ui-tr";

// MapLibre, D3 and map controls form a large interactive bundle.
// Do not load them while the server renders the navigation shell.
const ClientMap = dynamic(
  () => import("./IncidentMap").then((mod) => mod.IncidentMap),
  {
    ssr: false,
    loading: () => (
      <section className="panel" aria-label="Preparing incident map" role="status" aria-busy="true"
        style={{ minHeight: 420, padding: "var(--s-4)", display: "grid", gap: "var(--s-3)" }}>
        <Skeleton width="230px" height="22px" />
        <Skeleton width="100%" height="min(55vh, 400px)" />
        <span className="t-meta">Loading interactive map…</span>
      </section>
    ),
  },
);

export function DeferredIncidentMap(props: IncidentMapProps) {
  return <ClientMap {...props} />;
}
