"use client";

import { initials } from "@/lib/format";
import { SEGMENT_BGS, SEGMENT_COLORS, type SegmentLabel } from "@/lib/segments";
import type { MapLayerKey } from "@/lib/map-layers";
import type { MapFarmer } from "./types";
import { filterOptsFor } from "./layer-util";

export function ClusterModal({
  layer,
  layerLabel,
  storeName,
  draftName,
  filterValue,
  matchedFarmers,
  onChangeName,
  onChangeFilter,
  onClose,
  onSave,
}: {
  layer: MapLayerKey;
  layerLabel: string;
  storeName: string;
  draftName: string;
  filterValue: string;
  matchedFarmers: MapFarmer[];
  onChangeName: (v: string) => void;
  onChangeFilter: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const opts = filterOptsFor(layer, layerLabel);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[540px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_64px_rgba(0,0,0,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-[#F0F0F0] px-[26px] pb-[18px] pt-[22px]">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[17px] font-extrabold text-[#1A1C1A]">Create Farmer Cluster</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[#F5F5F5] text-[16px] text-[#757575] hover:bg-[#EEEEEE]"
            >
              ✕
            </button>
          </div>
          <div className="text-[12px] text-[#9E9E9E]">
            Current view: <span className="font-semibold text-[#616161]">{layerLabel}</span> ·{" "}
            <span className="font-semibold text-[#616161]">{storeName}</span>
          </div>
        </div>

        {/* Body (name + filter + criteria badge) */}
        <div className="px-[26px] pt-[18px]">
          <div className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E]">
            Cluster Name
          </div>
          <input
            type="text"
            value={draftName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g. High Value Wheat Farmers — June 2026"
            className="box-border w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-[11px] text-[14px] outline-none"
          />

          <div className="mb-[7px] mt-4 text-[11px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E]">
            Narrow by {layerLabel}
          </div>
          <select
            value={filterValue}
            onChange={(e) => onChangeFilter(e.target.value)}
            className="box-border w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none"
          >
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="mt-3.5 flex items-center gap-2 rounded-[10px] border border-[#E4EFC9] bg-[#F0F7F0] px-3.5 py-2.5">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="#678722">
              <circle cx="6.5" cy="6.5" r="6.5" />
              <path d="M4 6.5l1.8 1.8L9.5 4.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div className="text-[12px] font-semibold text-[#678722]">
              {matchedFarmers.length} farmers selected · criteria will be saved with this cluster
            </div>
          </div>
        </div>

        {/* Selected farmers list */}
        <div className="flex-1 overflow-y-auto px-[26px] py-3.5">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.7px] text-[#9E9E9E]">
            Selected Farmers
          </div>
          <div className="flex flex-col gap-2">
            {matchedFarmers.map((mf) => {
              const segBg =
                mf.segment && mf.segment in SEGMENT_BGS
                  ? SEGMENT_BGS[mf.segment as SegmentLabel]
                  : "#F5F5F5";
              const segColor =
                mf.segment && mf.segment in SEGMENT_COLORS
                  ? SEGMENT_COLORS[mf.segment as SegmentLabel]
                  : "#9E9E9E";
              return (
                <div
                  key={mf.id}
                  className="flex items-center gap-2.5 rounded-[10px] border border-[#F0F0F0] bg-[#FAFAFA] px-3 py-[9px]"
                >
                  <div
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: mf.avBg }}
                  >
                    {initials(mf.name)}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#1A1C1A]">{mf.name}</div>
                    <div className="text-[11px] text-[#9E9E9E]">
                      {[mf.village, mf.crop].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div
                    className="rounded-[20px] px-[9px] py-0.5 text-[10px] font-bold"
                    style={{ background: segBg, color: segColor }}
                  >
                    {mf.segment ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 border-t border-[#F0F0F0] px-[26px] py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[10px] border-[1.5px] border-[#E0E0E0] py-[11px] text-center text-[13px] font-semibold text-[#757575] hover:bg-[#F5F5F5]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex flex-[2] items-center justify-center gap-2 rounded-[10px] bg-[#262250] py-[11px] text-center text-[13px] font-bold text-white hover:bg-[#678722]"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M6.5 1v11M1 6.5h11" />
            </svg>
            Save Cluster &amp; Plan Action
          </button>
        </div>
      </div>
    </div>
  );
}
