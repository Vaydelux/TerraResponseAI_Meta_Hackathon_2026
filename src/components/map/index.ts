// src/components/map/index.ts
//
// Re-exports for the map module. IncidentMap is the map shell;
// IncidentPin + ClusterPin + IncidentPanel + MapLegend are the
// pieces composed by it.

export { IncidentMap, type IncidentMapProps, type IncidentMapReport } from "./IncidentMap";
export { IncidentPin, type IncidentPinProps } from "./IncidentPin";
export { MapLegend, type MapLegendProps } from "./MapLegend";
export { IncidentPanel, type IncidentPanelProps, type IncidentPanelData } from "./IncidentPanel";
export { ClusterPin, type ClusterPinProps } from "./ClusterPin";
