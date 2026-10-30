"use client";

// src/app/(app)/audit/AdminTabs.tsx
//
// The three admin tabs (audit log, events, AI spend ceilings).
// Uses the Segmented control + a state-managed tab panel.

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui-tr/Segmented";

type Tab = "audit" | "events" | "spend";

export function AdminTabs({
  audit,
  events,
  spend,
}: {
  audit: ReactNode;
  events: ReactNode;
  spend: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("audit");
  return (
    <div style={{ display: "grid", gap: "var(--s-4)" }}>
      <Segmented<Tab>
        aria-label="Admin tabs"
        block
        options={[
          { value: "audit", label: "Audit log" },
          { value: "events", label: "Events" },
          { value: "spend", label: "AI spend ceilings" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div>
        {tab === "audit" && audit}
        {tab === "events" && events}
        {tab === "spend" && spend}
      </div>
    </div>
  );
}
