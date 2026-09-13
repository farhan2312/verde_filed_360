"use client";

import dynamic from "next/dynamic";
import type { LeafletMapProps } from "./LeafletMap";

// Leaflet touches `window`, so the actual map must be client-only (no SSR).
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#E8EFE6] text-[12px] text-ink-muted">
      Loading map…
    </div>
  ),
});

export function MapCanvas(props: LeafletMapProps) {
  return <LeafletMap {...props} />;
}
