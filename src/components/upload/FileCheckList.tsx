// src/components/upload/FileCheckList.tsx
//
// The file validation list (components.css §7.8). Each file is a
// `.filecheck__item` with a state attribute:
//
//   - wait (data-s="wait"): the server hasn't validated yet — a
//     graphite spinner.
//   - ok (data-s="ok"): the server confirmed valid — a green check.
//   - fail (data-s="fail"): the server rejected — a brick X + the
//     reason.
//
// Per the brief: "Never claims a file is valid before the server
// says so." The list is purely server-driven — the client just
// renders the state the server returned.
//
// Client component — the list re-renders as the server validates
// each file.

"use client";

import { cn } from "@/lib/utils";

export interface FileCheckItem {
  /** The file name. */
  name: string;
  /** The validation state. */
  state: "wait" | "ok" | "fail";
  /** Optional message (the reason for fail, or "Valid image" for ok). */
  message?: string;
  /** Optional size in bytes; shown on the right. */
  size?: number;
}

export interface FileCheckListProps {
  items: FileCheckItem[];
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileCheckList({ items, className }: FileCheckListProps) {
  return (
    <ul className={cn("filecheck", className)}>
      {items.map((item, i) => (
        <li key={i} className="filecheck__item" data-s={item.state}>
          <span className="filecheck__icon" aria-hidden="true">
            {item.state === "ok" && (
              <svg width={16} height={16} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 9.2 7.2 12.7 14.4 5.4" />
              </svg>
            )}
            {item.state === "fail" && (
              <svg width={16} height={16} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4.5 4.5 13.5 13.5M13.5 4.5 4.5 13.5" />
              </svg>
            )}
            {item.state === "wait" && (
              <svg width={14} height={14} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ animation: "spin 1s linear infinite", transformOrigin: "center" }}>
                <path d="M9 2a7 7 0 1 0 7 7" />
              </svg>
            )}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
            {item.message && <span className="t-meta"> · {item.message}</span>}
          </span>
          {item.size != null && <span className="t-meta num">{formatBytes(item.size)}</span>}
        </li>
      ))}
    </ul>
  );
}
