"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

/** One heat point: a store location weighted by its farmer count. */
export interface HeatPoint {
  lat: number;
  lng: number;
  /** Pre-scaled intensity (see LeafletMap — sqrt of the farmer count). */
  weight: number;
}

/**
 * Farmer-density heat layer. Renders a Leaflet.heat canvas beneath the store
 * pins whose intensity reflects the number of farmers at each store. Adds the
 * layer on mount / when shown, and removes it on unmount or when toggled off so
 * no orphan canvas leaks.
 */
export function HeatLayer({
  points,
  max,
  show,
  radius = 34,
  blur = 24,
}: {
  points: HeatPoint[];
  max: number;
  show: boolean;
  radius?: number;
  blur?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!show || points.length === 0) return;
    const latlngs = points.map(
      (p) => [p.lat, p.lng, p.weight] as [number, number, number],
    );
    const layer = L.heatLayer(latlngs, {
      max: max > 0 ? max : 1,
      radius,
      blur,
      minOpacity: 0.15,
      // Stops compressed toward the warm end so the busiest stores actually reach
      // orange/red (a single isolated blob peaks well below alpha 1.0).
      gradient: {
        0.15: "#66852A",
        0.3: "#BDD67F",
        0.45: "#D4E157",
        0.55: "#FFB300",
        0.65: "#E53935",
      },
    });
    layer.addTo(map);
    // leaflet.heat scales every point's intensity by 1/2^(maxZoom - currentZoom).
    // Anchoring maxZoom to the CURRENT zoom keeps that factor at 1, so the colour
    // encodes the farmer count instead of collapsing to a flat minOpacity wash at
    // the map's default zoom (7–9). Re-anchor on every zoom change.
    const anchorZoom = () => layer.setOptions({ maxZoom: map.getZoom() });
    anchorZoom();
    map.on("zoomend", anchorZoom);
    return () => {
      map.off("zoomend", anchorZoom);
      map.removeLayer(layer);
    };
  }, [map, show, points, max, radius, blur]);

  return null;
}
