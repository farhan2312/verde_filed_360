"use client";

import Link from "next/link";
import { initials } from "@/lib/format";
import { SEGMENT_COLORS, type SegmentLabel } from "@/lib/segments";
import type { MapFarmer } from "./types";

function Row({
  label,
  value,
  valueColor,
  bold,
  shaded,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  bold?: boolean;
  shaded?: boolean;
}) {
  return (
    <div
      className="flex justify-between border-b border-[#F8F8F8] px-3 py-[9px] last:border-b-0"
      style={shaded ? { background: "#FAFAFA" } : undefined}
    >
      <span className="text-[11.5px] text-[#9E9E9E]">{label}</span>
      <span
        className="text-[11.5px]"
        style={{
          fontWeight: bold ? 700 : 600,
          color: valueColor ?? "#1A1C1A",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function FarmerDetailPanel({
  farmer,
  layerLabel,
  layerValue,
  layerColor,
  onClose,
}: {
  farmer: MapFarmer;
  layerLabel: string;
  layerValue: string;
  layerColor: string;
  onClose: () => void;
}) {
  const segColor =
    farmer.segment && farmer.segment in SEGMENT_COLORS
      ? SEGMENT_COLORS[farmer.segment as SegmentLabel]
      : "#9E9E9E";

  return (
    <div className="absolute inset-0 z-[1200] flex w-full flex-col overflow-y-auto border-l border-[#F0F0F0] bg-white lg:static lg:inset-auto lg:z-auto lg:h-[564px] lg:w-[284px] lg:flex-none">
      {/* Header */}
      <div className="flex flex-none items-center justify-between border-b border-[#F5F5F5] px-[18px] py-4">
        <div className="text-[13.5px] font-bold text-[#1A1C1A]">Farmer Details</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#F5F5F5] hover:bg-[#EEEEEE]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#757575" strokeWidth="1.8">
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>

      {/* Profile */}
      <div className="flex-1 p-[18px]">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[15px] font-bold text-white"
            style={{ background: farmer.avBg }}
          >
            {initials(farmer.name)}
          </div>
          <div>
            <div className="text-[14.5px] font-bold text-[#1A1C1A]">{farmer.name}</div>
            <div className="mt-0.5 text-[11px] text-[#9E9E9E]">
              {[farmer.village, farmer.district].filter(Boolean).join(", ") || "—"}
            </div>
          </div>
        </div>

        {/* Field rows */}
        <div className="mb-3.5 overflow-hidden rounded-[10px] border border-[#F0F0F0]">
          <Row label="Mobile" value={farmer.mobile ?? "—"} shaded />
          <Row label="Crop" value={farmer.crop ?? "—"} />
          <Row label="Land" value={farmer.land != null ? `${farmer.land} acres` : "—"} shaded />
          <Row label="Segment" value={farmer.segment ?? "—"} valueColor={segColor} bold />
          <Row label="Status" value={farmer.status ?? "—"} valueColor="#678722" shaded />
          <Row label="Last Visit" value={farmer.lastVisit} />
        </div>

        {/* Active layer value highlight */}
        <div className="mb-3.5 rounded-[10px] bg-[#F5F7F5] px-3.5 py-3">
          <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E]">
            {layerLabel}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 flex-none rounded-[4px]" style={{ background: layerColor }} />
            <div className="text-[13.5px] font-bold text-[#1A1C1A]">{layerValue}</div>
          </div>
        </div>

        {/* CTA */}
        <Link
          href={`/farmers/${farmer.id}`}
          className="block rounded-[10px] bg-[#678722] py-[11px] text-center text-[12.5px] font-semibold text-white transition-colors hover:bg-[#516A1B] active:scale-[0.97]"
        >
          View Full Profile →
        </Link>
      </div>
    </div>
  );
}
