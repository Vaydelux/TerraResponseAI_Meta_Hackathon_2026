/** Shared basemap presentation. Report locations always come from authorized data. */
export function buildSurveyStyle(isNight: boolean) {
  return {
    version: 8 as const,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "osm-tiles": {
        type: "raster" as const,
        tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "background", type: "background" as const, paint: { "background-color": isNight ? "#0B141A" : "#E9EDE8" } },
      {
        id: "tiles", type: "raster" as const, source: "osm-tiles",
        paint: {
          "raster-saturation": isNight ? -0.75 : -0.4,
          "raster-contrast": isNight ? 0.25 : 0.05,
          "raster-brightness-max": isNight ? 0.42 : 1,
          "raster-brightness-min": isNight ? 0.04 : 0,
          "raster-opacity": 0.88,
        },
      },
    ],
  };
}
