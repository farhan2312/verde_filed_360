"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { RecCard } from "@/lib/visit-types";
import { VisitReviewSection } from "./VisitReviewSection";

export interface VisitDetailData {
  vid: string;
  date: string;
  followUpDate: string; // next-visit date the officer scheduled (display), or ""
  purpose: string;
  notes: string;
  officer: string;
  recordedBy: string; // audit — "Name (UA123) · 16 Jul 2026, 4:32 pm"
  // Review / sign-off layer
  visitId: number;
  reviewed: boolean;
  reviewNote: string;
  reviewedBy: string; // "Name (UA123) · Regional Manager · 20 Aug 2026"
  canReview: boolean;
  village: string;
  district: string;
  crop: string;
  land: string;
  segment: string;
  storeName: string;
  typeColor: string;
  storeColor: string;
  followup: string;
  followupBg: string;
  followupColor: string;
  segBg: string;
  segColor: string;
  farmerName: string;
  farmerMobile: string;
  init: string;
  avatarBg: string;
  farmerId: number | null;
  recs: RecCard[];
  gps: string;
  gpsVerified: boolean;
  // Captured wizard data
  mainCrop: string;
  crops: string[];
  otherCrops: string;
  soilType: string;
  soilTesting: string;
  waterSource: string[];
  season: string;
  cropInsured: boolean;
  landHolding: string;
  products: string[];
  productRequired: string[];
  currentProblem: string[];
  cropRisk: string[];
  dangerZone: string[];
  annualExpense: string;
  purchaseFreq: string;
  otherShops: string;
  fpoMember: boolean;
  fpoName: string;
  contractFarming: boolean;
  contractDetail: string;
  dairyServices: boolean;
  dairyDetail: string;
  whatsappAvail: boolean;
  whatsappNumber: string;
  photos: string[];
  voiceNotes: string[];
  visitMode: string;
  justCreated: boolean;
}

const CARD =
  "bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[#9E9E9E] font-semibold uppercase">{label}</div>
      <div className="text-[13px] font-semibold text-[#1A1C1A] mt-[3px]">{children}</div>
    </div>
  );
}

/** A label with a wrapping chip list (for the multi-select captured arrays). */
function ChipField({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] text-[#9E9E9E] font-semibold uppercase">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span
            key={i}
            className="rounded-full bg-[#F5F7F5] px-2.5 py-[3px] text-[11.5px] text-[#424242]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 text-[15px] font-bold text-[#1A1C1A]">{children}</div>
  );
}

export function VisitDetailView({ data }: { data: VisitDetailData }) {
  const hasLandCrops =
    !!(data.soilType || data.soilTesting || data.season || data.otherCrops) ||
    data.waterSource.length > 0 ||
    data.crops.length > 0 ||
    data.cropInsured;
  const hasProductsIssues =
    data.products.length > 0 ||
    data.productRequired.length > 0 ||
    data.currentProblem.length > 0 ||
    data.cropRisk.length > 0 ||
    data.dangerZone.length > 0;
  const hasCommercial =
    !!(data.annualExpense || data.purchaseFreq || data.otherShops) ||
    data.fpoMember ||
    data.contractFarming ||
    data.dairyServices ||
    data.whatsappAvail;

  // In-page photo lightbox (no new tab). The thumbnails are already decoded, so it opens instantly.
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const nPhotos = data.photos.length;
  const stepPhoto = useCallback((d: number) => setPhotoIdx((i) => (i == null ? i : (i + d + nPhotos) % nPhotos)), [nPhotos]);
  useEffect(() => {
    if (photoIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoIdx(null);
      else if (e.key === "ArrowRight") stepPhoto(1);
      else if (e.key === "ArrowLeft") stepPhoto(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [photoIdx, stepPhoto]);

  return (
    <div className="motion-safe:animate-[fadeUp_0.4s_ease-out]">
      {/* Success banner (shown right after a submission) */}
      {data.justCreated && (
        <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-[#DBE9B4] bg-[#F5F9EA] px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="#7DA02E">
            <path d="M10 1a9 9 0 100 18 9 9 0 000-18zm4.2 6.7l-5 5a.75.75 0 01-1.06 0l-2.3-2.3a.75.75 0 011.06-1.06l1.77 1.77 4.47-4.47a.75.75 0 011.06 1.06z" />
          </svg>
          <span className="text-[13.5px] font-semibold text-[#7DA02E]">
            Visit logged successfully.
          </span>
          <Link
            href="/visits/new"
            className="ml-auto rounded-[10px] bg-[#7DA02E] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#66852A]"
          >
            Log another visit
          </Link>
        </div>
      )}

      {/* Back nav */}
      <Link
        href="/visits"
        className="inline-flex items-center gap-[6px] text-[13px] text-[#757575] cursor-pointer mb-5 hover:text-[#7DA02E]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 2L4 7l5 5" />
        </svg>
        Back to Visit Repository
      </Link>

      <div className="mb-[18px]">
        <VisitReviewSection visitId={data.visitId} reviewed={data.reviewed} reviewNote={data.reviewNote} reviewedBy={data.reviewedBy} canReview={data.canReview} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-[18px]">
        {/* LEFT column */}
        <div className="flex flex-col gap-[14px]">
          {/* Visit header card */}
          <div className={`${CARD} p-[22px]`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10.5px] font-bold text-[#9E9E9E] uppercase tracking-[0.7px] mb-1">
                  Visit ID{data.date ? ` · ${data.date}` : ""}
                </div>
                <div className="text-[18px] font-bold text-[#1A1C1A]">{data.vid}</div>
              </div>
              <div
                className="px-[14px] py-1 rounded-[20px] text-[11px] font-bold whitespace-nowrap"
                style={{ background: data.followupBg, color: data.followupColor }}
              >
                Follow-up: {data.followup}
              </div>
            </div>

            {/* Visit-type badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#F5F7F5] mb-4">
              <div className="w-[10px] h-[10px] rounded-full" style={{ background: data.typeColor }} />
              <span className="text-[13px] font-semibold text-[#1A1C1A]">
                {data.purpose || "Visit"}
              </span>
              {data.visitMode && (
                <span className="text-[11px] font-semibold text-[#9E9E9E]">
                  · {data.visitMode === "store" ? "At Store" : "Field Visit"}
                </span>
              )}
            </div>

            {/* Field rows */}
            <div className="flex flex-col border border-[#F0F0F0] rounded-[10px] overflow-hidden">
              <div className="grid grid-cols-2 px-[14px] py-[9px] bg-[#FAFAFA] border-b border-[#F5F5F5]">
                <Field label="Officer">{data.officer || "—"}</Field>
                <Field label="Recorded by">{data.recordedBy || "—"}</Field>
                <Field label="Date">{data.date || "—"}</Field>
                {data.followUpDate && <Field label="Follow-up date">📅 {data.followUpDate}</Field>}
              </div>
              <div className="grid grid-cols-2 px-[14px] py-[9px] border-b border-[#F5F5F5]">
                <Field label="Village">{data.village || "—"}</Field>
                <Field label="District">{data.district || "—"}</Field>
              </div>
              <div className="grid grid-cols-2 px-[14px] py-[9px] bg-[#FAFAFA] border-b border-[#F5F5F5]">
                <Field label="Crop">{data.crop || "—"}</Field>
                <Field label="Land">{data.land || "—"}</Field>
              </div>
              <div className="grid grid-cols-2 px-[14px] py-[9px]">
                <div>
                  <div className="text-[10px] text-[#9E9E9E] font-semibold uppercase">Store</div>
                  <div className="flex items-center gap-[5px] mt-[3px]">
                    <div
                      className="w-2 h-2 rounded-[2px] shrink-0"
                      style={{ background: data.storeColor }}
                    />
                    <div className="text-[13px] font-semibold text-[#1A1C1A]">
                      {data.storeName || "—"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9E9E9E] font-semibold uppercase">Segment</div>
                  <div className="mt-1">
                    {data.segment ? (
                      <span
                        className="inline-block px-[9px] py-[2px] rounded-[20px] text-[10px] font-semibold"
                        style={{ background: data.segBg, color: data.segColor }}
                      >
                        {data.segment}
                      </span>
                    ) : (
                      <span className="text-[13px] font-semibold text-[#1A1C1A]">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Farmer mini card */}
          <div className={`${CARD} p-[18px]`}>
            <div className="text-[11px] font-bold text-[#9E9E9E] uppercase tracking-[0.6px] mb-3">
              Farmer
            </div>
            <div className="flex items-center gap-3 mb-[14px]">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] text-white shrink-0"
                style={{ background: data.avatarBg }}
              >
                {data.init}
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#1A1C1A]">{data.farmerName || "—"}</div>
                <div className="text-[11.5px] text-[#9E9E9E] mt-[2px]">
                  {data.farmerMobile || "No mobile on record"}
                </div>
              </div>
            </div>
            {data.farmerId != null ? (
              <Link
                href={`/farmers/${data.farmerId}`}
                className="p-[10px] rounded-[10px] bg-[#F5F7F5] text-[#7DA02E] text-[12.5px] font-semibold cursor-pointer text-center flex items-center justify-center gap-[6px] hover:bg-[#F5F9EA]"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#7DA02E" strokeWidth="2" strokeLinecap="round">
                  <circle cx="7" cy="4" r="3" />
                  <path d="M1 13c0-3 2.7-5 6-5s6 2 6 5" />
                </svg>
                View Full Farmer Profile
              </Link>
            ) : (
              <div className="p-[10px] rounded-[10px] bg-[#F5F7F5] text-[#9E9E9E] text-[12.5px] font-semibold text-center flex items-center justify-center gap-[6px]">
                No linked farmer profile
              </div>
            )}
          </div>
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-[14px]">
          {/* Field Notes */}
          <div className={`${CARD} p-[22px]`}>
            <div className="flex items-center gap-2 mb-[14px] text-[15px] font-bold text-[#1A1C1A]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#7DA02E" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M5 6h6M5 9h4" />
              </svg>
              Field Notes
            </div>
            <div className="text-[13.5px] text-[#424242] leading-[1.75] p-4 bg-[#FAFFF9] rounded-[10px] border-[1.5px] border-[#F5F9EA]">
              {data.notes || "No field notes recorded for this visit."}
            </div>
          </div>

          {/* Recommendations & Actions */}
          <div className={`${CARD} p-[22px]`}>
            <div className="flex items-center gap-2 mb-[14px] text-[15px] font-bold text-[#1A1C1A]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1565C0" strokeWidth="2" strokeLinecap="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v4M8 11v1" />
              </svg>
              Recommendations &amp; Actions
            </div>
            <div className="flex flex-col gap-[10px]">
              {data.recs.map((rec, i) => (
                <div
                  key={i}
                  className="flex items-start gap-[10px] px-[14px] py-3 bg-[#F5F7F5] rounded-[10px]"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0 mt-[5px]"
                    style={{ background: rec.c }}
                  />
                  <div className="text-[12.5px] text-[#424242] leading-[1.65]">{rec.t}</div>
                </div>
              ))}
            </div>
          </div>

          {/* GPS + Meta */}
          <div className={`${CARD} py-[18px] px-[22px] flex items-center justify-between`}>
            <div className="flex items-center gap-[10px]">
              <div className="w-[34px] h-[34px] rounded-[8px] bg-[#F5F9EA] flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#7DA02E" strokeWidth="2">
                  <circle cx="7" cy="6" r="2" />
                  <path d="M7 1C4.2 1 2 3.2 2 6c0 3.8 5 9 5 9s5-5.2 5-9c0-2.8-2.2-5-5-5z" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#9E9E9E] uppercase">GPS Location</div>
                <div className="text-[12.5px] font-semibold text-[#7DA02E] mt-[2px]">{data.gps}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-[#9E9E9E] uppercase">Logged by</div>
              <div className="text-[12.5px] font-semibold text-[#1A1C1A] mt-[2px]">
                {data.officer || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Captured detail sections (full width) ── */}
      {hasLandCrops && (
        <div className={`${CARD} p-[22px] mt-[14px]`}>
          <SectionTitle>Land &amp; Crop Details</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
            {data.soilType && <Field label="Soil Type">{data.soilType}</Field>}
            {data.soilTesting && <Field label="Soil Testing">{data.soilTesting}</Field>}
            {data.season && <Field label="Season">{data.season}</Field>}
            <Field label="Crop Insured">{data.cropInsured ? "Yes" : "No"}</Field>
            {data.otherCrops && <Field label="Other Crops">{data.otherCrops}</Field>}
          </div>
          {(data.waterSource.length > 0 || data.crops.length > 0) && (
            <div className="mt-4 flex flex-col gap-4">
              <ChipField label="Water Source" items={data.waterSource} />
              <ChipField label="Crops Grown" items={data.crops} />
            </div>
          )}
        </div>
      )}

      {hasProductsIssues && (
        <div className={`${CARD} p-[22px] mt-[14px]`}>
          <SectionTitle>Products &amp; Issues</SectionTitle>
          <div className="flex flex-col gap-4">
            <ChipField label="Products Currently Using" items={data.products} />
            <ChipField label="Products Required" items={data.productRequired} />
            <ChipField label="Current Problems" items={data.currentProblem} />
            <ChipField label="Crop Risks" items={data.cropRisk} />
            <ChipField label="Danger Zone" items={data.dangerZone} />
          </div>
        </div>
      )}

      {hasCommercial && (
        <div className={`${CARD} p-[22px] mt-[14px]`}>
          <SectionTitle>Commercial &amp; Services</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
            {data.annualExpense && <Field label="Annual Expense">{data.annualExpense}</Field>}
            {data.purchaseFreq && <Field label="Purchase Frequency">{data.purchaseFreq}</Field>}
            {data.otherShops && <Field label="Other Shops">{data.otherShops}</Field>}
            {data.fpoMember && <Field label="FPO Member">{data.fpoName || "Yes"}</Field>}
            {data.contractFarming && (
              <Field label="Contract Farming">{data.contractDetail || "Yes"}</Field>
            )}
            {data.dairyServices && (
              <Field label="Dairy Services">{data.dairyDetail || "Yes"}</Field>
            )}
            {data.whatsappAvail && (
              <Field label="WhatsApp Number">{data.whatsappNumber || "—"}</Field>
            )}
          </div>
        </div>
      )}

      {/* Photos */}
      {data.photos.length > 0 && (
        <div className={`${CARD} p-[22px] mt-[14px]`}>
          <SectionTitle>Photos ({data.photos.length})</SectionTitle>
          <div className="flex flex-wrap gap-2.5">
            {data.photos.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPhotoIdx(i)}
                className="block h-24 w-24 overflow-hidden rounded-[10px] border border-[#E0E0E0] transition-transform hover:scale-[1.03]"
                aria-label={`Open photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Visit photo ${i + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Voice Notes */}
      {data.voiceNotes.length > 0 && (
        <div className={`${CARD} p-[22px] mt-[14px]`}>
          <SectionTitle>Voice Notes ({data.voiceNotes.length})</SectionTitle>
          <div className="flex flex-col gap-2.5">
            {data.voiceNotes.map((src, i) => (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio key={i} src={src} controls className="w-full" />
            ))}
          </div>
        </div>
      )}

      {/* Photo lightbox — in-page popup, blurred backdrop, X to close, arrows for multiple */}
      {photoIdx != null && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPhotoIdx(null)}
        >
          <button
            type="button"
            onClick={() => setPhotoIdx(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-[22px] leading-none text-white hover:bg-white/30"
            aria-label="Close"
          >
            ×
          </button>
          {nPhotos > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); stepPhoto(-1); }}
                className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-[26px] text-white hover:bg-white/30 sm:left-6"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); stepPhoto(1); }}
                className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-[26px] text-white hover:bg-white/30 sm:right-6"
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.photos[photoIdx]}
            alt={`Visit photo ${photoIdx + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[86vh] max-w-[92vw] rounded-[12px] object-contain shadow-2xl"
          />
          {nPhotos > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[12px] font-semibold text-white">
              {photoIdx + 1} / {nPhotos}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
