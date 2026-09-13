"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { MapLayerKey } from "@/lib/map-layers";
import { initials } from "@/lib/format";
import type { MapFarmer, MapStore } from "./types";
import { colorFor } from "./layer-util";
import { HeatLayer, type HeatPoint } from "./HeatLayer";

// Center on Uttar Pradesh (covers Barabanki / Amethi / Raebareli / Lakhimpur Kheri).
const UP_CENTER: [number, number] = [27.3, 81.3];
const UP_ZOOM = 7;

function farmerIcon(f: MapFarmer, color: string, selected: boolean, dimmed: boolean): L.DivIcon {
  const size = selected ? 40 : 30;
  const border = selected ? 3.5 : 2.5;
  const shadow = selected ? "0 4px 12px rgba(0,0,0,0.35)" : "0 2px 5px rgba(0,0,0,0.25)";
  const font = selected ? 12 : 10;
  const html = `
    <div style="transform:translate(-50%,-100%);opacity:${dimmed ? 0.18 : 1};">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid #fff;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">
        <span style="font-size:${font}px;font-weight:700;color:#fff;line-height:1;">${initials(f.name)}</span>
      </div>
      <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${color};margin:0 auto;opacity:0.9;"></div>
    </div>`;
  return L.divIcon({ html, className: "ua-pin", iconSize: [size, size], iconAnchor: [0, 0] });
}

function storeIcon(s: MapStore, selected: boolean, dimmed: boolean): L.DivIcon {
  const bg = dimmed ? "#9E9E9E" : s.color;
  const size = selected ? 16 : dimmed ? 11 : 13;
  const border = selected ? 3 : 2;
  const ring = selected ? `0 0 0 3px ${s.color}55, ` : "";
  const opacity = dimmed ? 0.5 : 1;
  // Small unnamed dot so the heatmap shows through. The 5px transparent padding
  // enlarges the tap target; hover reveals the store name + code (see Tooltip).
  const html = `
    <div style="transform:translate(-50%,-50%);padding:5px;opacity:${opacity};transition:opacity .2s;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${border}px solid #fff;box-shadow:${ring}0 1px 4px rgba(0,0,0,0.4);"></div>
    </div>`;
  return L.divIcon({ html, className: "ua-store-pin", iconSize: undefined, iconAnchor: [0, 0] });
}

/** Pans/zooms the map to fit the selected stores (or all when none) when `fitNonce` changes. */
function MapController({
  stores,
  selectedStoreIds,
  fitNonce,
}: {
  stores: MapStore[];
  selectedStoreIds: number[];
  fitNonce: number;
}) {
  const map = useMap();

  useEffect(() => {
    const focus =
      selectedStoreIds.length > 0
        ? stores.filter((s) => selectedStoreIds.includes(s.id))
        : stores;
    if (focus.length === 0) {
      map.flyTo(UP_CENTER, UP_ZOOM, { duration: 0.6 });
      return;
    }
    if (focus.length === 1) {
      map.flyTo([focus[0].lat, focus[0].lng], 13, { duration: 0.8 });
      return;
    }
    const bounds = L.latLngBounds(focus.map((s) => [s.lat, s.lng] as [number, number]));
    map.flyToBounds(bounds, {
      padding: [60, 60],
      maxZoom: selectedStoreIds.length > 0 ? 12 : 9,
      duration: 0.7,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  return null;
}

export interface LeafletMapProps {
  farmers: MapFarmer[];
  stores: MapStore[];
  layer: MapLayerKey;
  selectedStoreIds: number[];
  showStorePins: boolean;
  showHeat: boolean;
  selectedFarmerId: number | null;
  fitNonce: number;
  onSelectFarmer: (f: MapFarmer) => void;
  onToggleStore: (id: number) => void;
}

export default function LeafletMap({
  farmers,
  stores,
  layer,
  selectedStoreIds,
  fitNonce,
  showStorePins,
  showHeat,
  selectedFarmerId,
  onSelectFarmer,
  onToggleStore,
}: LeafletMapProps) {
  const hasSelection = selectedStoreIds.length > 0;
  const selSet = useMemo(() => new Set(selectedStoreIds), [selectedStoreIds]);

  // Farmer-density heat points: sqrt-scaled so a few very large stores don't
  // wash out the rest (counts range ~0–6.5k, median ~560).
  const heatPoints = useMemo<HeatPoint[]>(
    () =>
      stores
        .filter((s) => s.farmerCount > 0)
        .map((s) => ({ lat: s.lat, lng: s.lng, weight: Math.sqrt(s.farmerCount) })),
    [stores],
  );
  const heatMax = useMemo(
    () => heatPoints.reduce((m, p) => Math.max(m, p.weight), 0),
    [heatPoints],
  );

  const farmerMarkers = useMemo(
    () =>
      farmers.map((f) => {
        const inFilter = !hasSelection || (f.storeId != null && selSet.has(f.storeId));
        const selected = f.id === selectedFarmerId;
        const color = colorFor(layer, f);
        return (
          <Marker
            key={`f-${f.id}`}
            position={[f.lat, f.lng]}
            icon={farmerIcon(f, color, selected, !inFilter)}
            zIndexOffset={selected ? 1000 : 0}
            opacity={inFilter ? 1 : 0.18}
            eventHandlers={{ click: () => inFilter && onSelectFarmer(f) }}
          />
        );
      }),
    [farmers, layer, hasSelection, selSet, selectedFarmerId, onSelectFarmer],
  );

  // Always render every store; selected are highlighted, the rest dimmed (not hidden).
  const storeMarkers = useMemo(
    () =>
      stores.map((s) => {
        const selected = selSet.has(s.id);
        return (
          <Marker
            key={`s-${s.id}`}
            position={[s.lat, s.lng]}
            icon={storeIcon(s, selected, hasSelection && !selected)}
            zIndexOffset={selected ? 600 : 400}
            eventHandlers={{ click: () => onToggleStore(s.id) }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div style={{ textAlign: "center", lineHeight: 1.25 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1C1A" }}>
                  {s.name}
                  {selected ? " ✓" : ""}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "#9E9E9E", marginTop: 2 }}>
                  {s.code}
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      }),
    [stores, hasSelection, selSet, onToggleStore],
  );

  return (
    <MapContainer center={UP_CENTER} zoom={UP_ZOOM} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController stores={stores} selectedStoreIds={selectedStoreIds} fitNonce={fitNonce} />
      <HeatLayer points={heatPoints} max={heatMax} show={showHeat} />
      {farmerMarkers}
      {showStorePins && storeMarkers}
    </MapContainer>
  );
}
