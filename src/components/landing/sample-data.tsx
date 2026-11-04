export interface LandingSampleIncident {
  id: string;
  label: string;
  hazard: string;
  position: { x: number; y: number };
  summary: string;
  uncertainty: string;
  hasImage?: boolean;
}

interface LandingPreviewSnapshot {
  source: "synthetic-illustration";
  incidents: readonly [LandingSampleIncident, ...LandingSampleIncident[]];
}

export const SAMPLE_IMAGE = {
  src: "/demo/flood-aerial.png",
  alt: "AI-generated flood illustration showing water across a residential road; not actual incident evidence",
  provenance: "Synthetic illustration only. It does not establish conditions at any real location.",
} as const;

export const SAMPLE_OBSERVATIONS = [
  "Water appears to cover a roadway in this synthetic image.",
  "Vehicles appear stopped; occupancy cannot be established.",
] as const;

export const SAMPLE_UNCERTAINTIES = [
  "Water depth and road passability cannot be established from a photograph.",
  "Building stability and vehicle occupancy are unknown.",
] as const;

// A bounded adapter for public illustrations, isolated from real report loaders.
// This interface can be replaced without changing the map's selection UI.
const LANDING_PREVIEW: LandingPreviewSnapshot = {
  source: "synthetic-illustration",
  incidents: [
    {
      id: "sample-flood",
      label: "Flooded corridor",
      hazard: "Flood",
      position: { x: 24, y: 38 },
      summary: "Example report: water appears to cover a residential roadway. A reviewer would check location and visible evidence before confirming an observation.",
      uncertainty: "Water depth, vehicle occupancy, and road passability are unknown.",
      hasImage: true,
    },
    {
      id: "sample-debris",
      label: "Debris near an access road",
      hazard: "Debris",
      position: { x: 70, y: 30 },
      summary: "Example report: material may obstruct an access road. A reviewer would inspect the original image and compare nearby reports.",
      uncertainty: "The extent of obstruction and current access conditions are unknown.",
    },
    {
      id: "sample-structure",
      label: "Possible structural damage",
      hazard: "Structural",
      position: { x: 57, y: 73 },
      summary: "Example report: a contributor flags possible damage to a building. The queue keeps this separate from a verified safety assessment.",
      uncertainty: "Building stability cannot be established from a photograph.",
    },
  ],
};

export function getLandingPreviewSnapshot(): LandingPreviewSnapshot {
  return LANDING_PREVIEW;
}
