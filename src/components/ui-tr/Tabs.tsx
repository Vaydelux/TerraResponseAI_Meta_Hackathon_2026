// src/components/ui-tr/Tabs.tsx
//
// Tabs built on `.segmented` — same CSS surface, slightly different
// semantics (the segmented control surfaces a value, Tabs surfaces
// a panel). Used by the audit page's admin tabs. Controlled-only;
// the parent owns the active tab.

import type { ReactNode } from "react";
import { Segmented, type SegmentedOption } from "./Segmented";

export interface TabItem {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  "aria-label": string;
}

export function Tabs({ tabs, active, onChange, "aria-label": ariaLabel }: TabsProps) {
  const options: SegmentedOption<string>[] = tabs.map((t) => ({
    value: t.id,
    label: t.label,
  }));
  return (
    <Segmented
      options={options}
      value={active}
      onChange={onChange}
      aria-label={ariaLabel}
      block
    />
  );
}
