"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { GeoCanvasProps } from "./GeoCanvas";
import { workspaceMapHeight } from "@/lib/workspace/presentation";

const ClientCanvas = dynamic(() => import("./GeoCanvas").then((module) => module.GeoCanvas), {
  ssr: false,
  loading: () => <div className={`${workspaceMapHeight} flex items-center justify-center rounded-panel border border-rule bg-[var(--sheet-sunk)] p-6 text-sm text-[var(--ink-2)]`} role="status">Loading map controls… The incident queue is available below.</div>,
});

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <div className="grid gap-3 rounded-panel border border-rule bg-[var(--sheet-sunk)] p-6" role="alert">
        <h3>Map unavailable</h3>
        <p className="text-sm text-[var(--ink-2)]">Continue with the incident queue, timeline, and details. No report data has been changed.</p>
        <button type="button" className="min-h-11 rounded-ctl border border-rule bg-sheet px-4 font-semibold hover:bg-[var(--tide-wash)] focus-visible:outline-2 focus-visible:outline-tide active:bg-[var(--sheet-sunk)]" onClick={() => this.setState({ failed: false })}>Retry loading map</button>
      </div>
    );
    return this.props.children;
  }
}

export function DeferredGeoCanvas(props: GeoCanvasProps) {
  return <MapBoundary><ClientCanvas {...props} /></MapBoundary>;
}
