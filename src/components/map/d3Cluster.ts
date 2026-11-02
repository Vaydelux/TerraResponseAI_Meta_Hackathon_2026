// src/components/map/d3Cluster.ts
//
// D3-powered spatial clustering for IncidentMap pins.
// Uses `d3.quadtree`, `d3.scalePow`, `d3.mean`, and `d3.max` to
// consolidate overlapping incident pins at lower zoom levels and
// expand them into individual pins at street-level zoom.

import * as d3 from "d3";
import { stateFromReport } from "@/lib/design/status";
import { toSeverityLevel } from "@/lib/design/severity";
import type { IncidentMapReport } from "./IncidentMap";

export interface SinglePinNode {
  kind: "single";
  id: string;
  latitude: number;
  longitude: number;
  report: IncidentMapReport;
}

export interface ClusterPinNode {
  kind: "cluster";
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  confirmedCount: number;
  pendingCount: number;
  maxSeverity: 1 | 2 | 3 | 4 | 5;
  locationContext: string;
  reports: IncidentMapReport[];
}

export type MapPinOrClusterNode = SinglePinNode | ClusterPinNode;

/**
 * Computes the spatial clustering radius (in degrees of lat/lon)
 * for a given MapLibre zoom level using a D3 power scale.
 * Above zoom 14.5, clustering is disabled so every report is individual.
 */
export function getClusterRadiusDegrees(zoom: number): number {
  if (zoom >= 14.5) return 0;
  // ~45px screen-space radius translated to degrees across zoom levels
  return (44 / 256) * (360 / Math.pow(2, Math.max(2, zoom)));
}

/**
 * Consolidates overlapping `IncidentMapReport` items using `d3.quadtree`.
 */
export function clusterIncidentsWithD3(
  reports: IncidentMapReport[],
  zoom: number,
): MapPinOrClusterNode[] {
  if (reports.length === 0) return [];

  const radius = getClusterRadiusDegrees(zoom);
  if (radius <= 0 || reports.length === 1) {
    return reports.map((r) => ({
      kind: "single",
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      report: r,
    }));
  }

  // Build a D3 quadtree indexed by [longitude, latitude]
  const tree = d3
    .quadtree<IncidentMapReport>()
    .x((d) => d.longitude)
    .y((d) => d.latitude)
    .addAll(reports);

  const visited = new Set<string>();
  const nodes: MapPinOrClusterNode[] = [];

  // Process higher-priority reports first as cluster seeds
  const sortedSeeds = [...reports].sort(
    (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0),
  );

  for (const seed of sortedSeeds) {
    if (visited.has(seed.id)) continue;

    const neighbors: IncidentMapReport[] = [];
    const x0 = seed.longitude - radius;
    const x3 = seed.longitude + radius;
    const y0 = seed.latitude - radius;
    const y3 = seed.latitude + radius;

    tree.visit((node, x1, y1, x2, y2) => {
      if (!node.length) {
        let leaf: d3.QuadtreeLeaf<IncidentMapReport> | undefined = node;
        while (leaf) {
          const item = leaf.data;
          if (!visited.has(item.id)) {
            const dx = item.longitude - seed.longitude;
            const dy = item.latitude - seed.latitude;
            if (dx * dx + dy * dy <= radius * radius) {
              neighbors.push(item);
            }
          }
          leaf = leaf.next;
        }
      }
      return x1 > x3 || x2 < x0 || y1 > y3 || y2 < y0;
    });

    if (neighbors.length <= 1) {
      visited.add(seed.id);
      nodes.push({
        kind: "single",
        id: seed.id,
        latitude: seed.latitude,
        longitude: seed.longitude,
        report: seed,
      });
    } else {
      for (const n of neighbors) {
        visited.add(n.id);
      }

      const centroidLat = d3.mean(neighbors, (d) => d.latitude) ?? seed.latitude;
      const centroidLon = d3.mean(neighbors, (d) => d.longitude) ?? seed.longitude;
      const maxSev = (d3.max(neighbors, (d) => toSeverityLevel(d.severity)) ?? 3) as
        | 1
        | 2
        | 3
        | 4
        | 5;

      let confirmedCount = 0;
      let pendingCount = 0;
      for (const n of neighbors) {
        const st = stateFromReport({ status: n.status, reviewOutcome: n.review_outcome });
        if (st === "confirmed" || st === "corrected") {
          confirmedCount += 1;
        } else {
          pendingCount += 1;
        }
      }

      const primaryLabel =
        neighbors.find((n) => n.location_label)?.location_label ||
        `${centroidLat.toFixed(3)}° N, ${centroidLon.toFixed(3)}° E`;

      nodes.push({
        kind: "cluster",
        id: `cluster-${seed.id}`,
        latitude: centroidLat,
        longitude: centroidLon,
        count: neighbors.length,
        confirmedCount,
        pendingCount,
        maxSeverity: maxSev,
        locationContext: `${primaryLabel} · ${neighbors.length} reports`,
        reports: neighbors,
      });
    }
  }

  return nodes;
}
