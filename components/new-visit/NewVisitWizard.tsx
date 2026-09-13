"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { Toggle } from "@/components/interactive";
import { initials, avatarColor } from "@/lib/format";
import {
  SEGMENT_BGS,
  SEGMENT_COLORS,
  type SegmentLabel,
} from "@/lib/segments";
import { ChipGroup } from "./ChipGroup";
import { ChipGroupWithOther } from "./ChipGroupWithOther";
import { CropSelector } from "./CropSelector";
import { BucketSlider } from "./BucketSlider";
import { OtherReveal } from "./OtherReveal";
import { PhotoCapture } from "./PhotoCapture";
import { VoiceRecorder } from "./VoiceRecorder";
import type { WizardOptions } from "./field-options";
import { INITIAL_FORM, type VisitForm, type FarmerLookup } from "./types";
import { submitVisitAction, lookupFarmerByMobile } from "@/app/actions/new-visit";

const STEP_LABELS = [
  "Farmer & Location",
  "Land & Crops",
  "Products & Issues",
  "Commercial & Services",
  "Review & Submit",
];

/* ── Local field-label helper (shared across step panels) ── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[12px] font-semibold text-[#616161]">{children}</div>
  );
}

/* ── Small inline SVGs (screen-specific) ── */
function PlusBadge() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5.5" fill="#7DA02E" />
      <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function CheckBadge() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="#7DA02E">
      <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm2.3 3.7l-2.6 2.6-1-1a.5.5 0 00-.7.7l1.4 1.4a.5.5 0 00.7 0l3-3a.5.5 0 00-.8-.7z" />
    </svg>
  );
}
function WarnTriangle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12 3l9 16H3L12 3z"
        stroke="#EDA942"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="#FFFDE7"
      />
      <path d="M12 9v4" stroke="#EDA942" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="#EDA942" />
    </svg>
  );
}

/* ── Products & Issues step: grouped section scaffolding ── */
function BoxIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Macro-group heading (icon badge + title) for the Products & Issues step. */
function GroupHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#F5F9EA] text-[#7DA02E]">
        {icon}
      </span>
      <div className="text-[13.5px] font-extrabold tracking-[0.2px] text-[#1A1C1A]">{title}</div>
    </div>
  );
}

/** A titled, bordered card that visually separates one chip group from the next. */
function SectionCard({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[14px] border border-[#ECEFEC] bg-[#FAFBFA] p-4 ${className}`}>
      <div className="mb-2.5 text-[12px] font-bold text-[#3A3A3A]">{title}</div>
      {children}
    </div>
  );
}

export function NewVisitWizard({
  options,
  districts,
  villages,
  visitReasons,
  stores = [],
  optInQr = null,
  primaryIdLabel = "Mobile Number",
  visitReasonRequired = true,
}: {
  options: WizardOptions;
  districts: string[];
  villages: string[];
  visitReasons: string[];
  stores?: { id: number; name: string }[];
  /** WhatsApp opt-in QR (PNG data URL) shown on the last step; null = not configured. */
  optInQr?: string | null;
  primaryIdLabel?: string;
  visitReasonRequired?: boolean;
}) {
  const [step, setStep] = useState(0);
  // One store → auto-select and lock it. Several (RM / admin) → a mandatory manual pick.
  const storeLocked = stores.length === 1;
  const [form, setForm] = useState<VisitForm>(() => ({
    ...INITIAL_FORM,
    storeId: storeLocked ? stores[0].id : null,
  }));
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof VisitForm>(key: K, value: VisitForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const onText =
    (key: keyof VisitForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      set(key, e.target.value as VisitForm[typeof key]);

  /* ── "Other" specify boxes (R6) + service detail boxes (R5) ── */
  type ServiceKey = "fpoMember" | "contractFarming" | "dairyServices" | "whatsappAvail";

  const setOtherText = (k: string, v: string) =>
    setForm((f) => ({ ...f, otherText: { ...f.otherText, [k]: v } }));

  const setServiceDetail = (k: string, v: string) =>
    setForm((f) => ({ ...f, serviceDetail: { ...f.serviceDetail, [k]: v } }));

  // Toggle a service on/off; clear its detail when off; seed WhatsApp from the
  // entered mobile the first time it's turned on.
  const setService = (key: ServiceKey, on: boolean) =>
    setForm((f) => {
      const serviceDetail = { ...f.serviceDetail };
      // Clear the detail when a service is switched off. Never auto-fill the
      // WhatsApp number from the mobile — the officer confirms it explicitly
      // (a "Same as mobile" shortcut is offered on the field).
      if (!on) serviceDetail[key] = "";
      return { ...f, [key]: on, serviceDetail } as VisitForm;
    });

  // Chip onChange wrapper that also drops the "Other" text when "Other" leaves
  // the selection, so abandoned detail is never persisted.
  const setChip =
    (key: keyof VisitForm, fieldKey: string) =>
    (v: string | string[]) =>
      setForm((f) => {
        const stillOther = Array.isArray(v) ? v.includes("Other") : v === "Other";
        return {
          ...f,
          [key]: v,
          otherText: stillOther ? f.otherText : { ...f.otherText, [fieldKey]: "" },
        } as VisitForm;
      });

  /* ── Server-side mobile lookup → autofill + edit mode ── */
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "found" | "notfound">("idle");
  const [foundFarmer, setFoundFarmer] = useState<FarmerLookup | null>(null);
  const [editingFarmerId, setEditingFarmerId] = useState<number | null>(null);
  const [, startLookup] = useTransition();
  const lastQueried = useRef<string>("");

  useEffect(() => {
    const m = form.mobile.trim();
    if (m.length < 10) {
      setLookupStatus("idle");
      setFoundFarmer(null);
      setEditingFarmerId(null);
      lastQueried.current = "";
      return;
    }
    if (m === lastQueried.current) return;
    setLookupStatus("loading");
    const t = setTimeout(() => {
      lastQueried.current = m;
      startLookup(async () => {
        const res = await lookupFarmerByMobile(m);
        if (res.found && res.farmer) {
          const fa = res.farmer;
          setFoundFarmer(fa);
          setEditingFarmerId(fa.id);
          setLookupStatus("found");
          // Autofill identity + the last visit's descriptive fields (all editable). Media,
          // follow-up and visit purpose are left blank — they belong to this new visit.
          const p = res.prefill ?? {};
          setForm((prev) => {
            const merged = { ...prev, ...p };
            const nextMain = fa.mainCrop || p.mainCrop || prev.mainCrop;
            return {
              ...merged,
              name: fa.name || prev.name,
              village: fa.village || prev.village,
              district: fa.district || prev.district,
              mainCrop: nextMain,
              // Keep the CropSelector invariant: main is never also an "other".
              crop: (p.crop ?? prev.crop).filter((c) => c !== nextMain),
              leadStatus: fa.leadStatusLabel || prev.leadStatus,
              serviceDetail: { ...prev.serviceDetail, ...(p.serviceDetail ?? {}) },
              // Never carry event-only fields between visits.
              visitPurpose: prev.visitPurpose,
              photos: prev.photos,
              voiceNotes: prev.voiceNotes,
              followUpDate: prev.followUpDate,
              followUpReason: prev.followUpReason,
            };
          });
        } else {
          setFoundFarmer(null);
          setEditingFarmerId(null);
          setLookupStatus("notfound");
        }
      });
    }, 450);
    return () => clearTimeout(t);
  }, [form.mobile]);

  /* ── Device geolocation — captured only for a field visit ── */
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "done" | "error">("idle");
  const geoMounted = useRef(true);
  useEffect(() => () => {
    geoMounted.current = false;
  }, []);

  // Best-effort reverse geocode (no API key). Fills Village/District from GPS when
  // they're still empty — the officer can always edit. Silently no-ops offline.
  async function fillPlaceFromGps(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      );
      if (!res.ok) return;
      const j = (await res.json()) as {
        locality?: string;
        city?: string;
        principalSubdivision?: string;
        localityInfo?: {
          administrative?: { name?: string; description?: string; adminLevel?: number }[];
        };
      };
      if (!geoMounted.current) return;
      const admin = j.localityInfo?.administrative ?? [];
      const distEntry =
        admin.find((a) => /district/i.test(a.description ?? "")) ??
        admin.find((a) => a.adminLevel === 5);
      const rawDistrict = (distEntry?.name ?? j.principalSubdivision ?? "").trim();
      const matched = districts.find(
        (d) => d.trim().toLowerCase() === rawDistrict.toLowerCase(),
      );
      const locality = (j.locality || j.city || "").trim();
      setForm((f) => ({
        ...f,
        village: f.village.trim() ? f.village : locality,
        district: f.district.trim() ? f.district : matched ?? f.district,
      }));
    } catch {
      /* best-effort — ignore reverse-geocode failures */
    }
  }

  useEffect(() => {
    if (form.visitMode !== "field") {
      // At-store: never record the farmer's location.
      setGeoStatus("idle");
      setForm((f) =>
        f.gpsLat === null && f.gpsLng === null ? f : { ...f, gpsLat: null, gpsLng: null },
      );
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!geoMounted.current) return;
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setForm((f) => ({ ...f, gpsLat: lat, gpsLng: lng }));
        setGeoStatus("done");
        void fillPlaceFromGps(lat, lng);
      },
      () => {
        if (geoMounted.current) setGeoStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.visitMode]);

  const visitReasonStar = visitReasonRequired ? " *" : "";

  // Indian mobile: exactly 10 digits, first digit 6–9 (rejects 0000000000, 1234567890, etc.)
  const mobileValid = /^[6-9]\d{9}$/.test(form.mobile);
  const step0Valid =
    mobileValid &&
    form.storeId != null &&
    form.name.trim() !== "" &&
    form.village.trim() !== "" &&
    (!visitReasonRequired || form.visitPurpose.trim() !== "");
  // Land & Crops step: at least one crop is mandatory (main crop or a crop chip).
  const step1Valid = form.mainCrop.trim() !== "" || form.crop.length > 0;
  // Review step: if a follow-up date is set, the reason + comment are mandatory (they drive the action).
  const followUpSet = form.followUpDate.trim() !== "";
  const followUpValid = !followUpSet || (form.followUpReason.trim() !== "" && form.followUpComment.trim() !== "");

  const next = () => setStep((s) => Math.min(s + 1, 4));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const submit = () => {
    // Fold each selected "Other" into "Other: <specified text>" so the typed
    // detail is persisted in the existing columns (no schema change for R6).
    const foldOne = (v: string, t?: string) =>
      v === "Other" && t?.trim() ? `Other: ${t.trim()}` : v;
    const foldArr = (a: string[], t?: string) => a.map((v) => foldOne(v, t));
    const ot = form.otherText;
    const payload: VisitForm = {
      ...form,
      soil: foldOne(form.soil, ot.soil),
      waterSource: foldArr(form.waterSource, ot.waterSource),
      mainCrop: foldOne(form.mainCrop, ot.crop),
      crop: foldArr(form.crop, ot.crop),
      pests: foldArr(form.pests, ot.pests),
      product: foldArr(form.product, ot.product),
      productRequired: foldArr(form.productRequired, ot.productRequired),
      currentProblem: foldArr(form.currentProblem, ot.currentProblem),
      cropRisk: foldArr(form.cropRisk, ot.cropRisk),
    };
    // Guard the attachment payload against the server-action body limit (12MB).
    // Data-URL string length ≈ byte size; block early with a clear message
    // rather than letting an oversize POST fail silently and lose the visit.
    const mediaBytes = [...form.photos, ...form.voiceNotes].reduce((n, s) => n + s.length, 0);
    if (mediaBytes > 10 * 1024 * 1024) {
      setSubmitError(
        `Attachments are too large (~${Math.round(mediaBytes / (1024 * 1024))} MB). ` +
          `Remove some photos or voice notes and try again.`,
      );
      return;
    }
    if (form.followUpDate.trim() && (!form.followUpReason.trim() || !form.followUpComment.trim())) {
      setSubmitError("Add a follow-up reason and comment — they're required when a follow-up date is set.");
      return;
    }
    setSubmitError(null);
    startTransition(() => void submitVisitAction(payload, editingFarmerId));
  };

  return (
    <div className="mx-auto max-w-[800px] animate-fadeUp">
      {/* A. Progress steps */}
      <div className="mb-7 flex items-center gap-1">
        {STEP_LABELS.map((label, i) => {
          const circleBg = i === step ? "#7DA02E" : step > i ? "#BDD67F" : "#E0E0E0";
          const circleColor = step >= i ? "#FFFFFF" : "#9E9E9E";
          const textColor = i === step ? "#7DA02E" : step > i ? "#93B93C" : "#BDBDBD";
          const lineBg = step > i ? "#BDD67F" : "#E8E8E8";
          return (
            <div key={label} className="flex flex-1 items-center gap-1">
              <div
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[12px] font-bold"
                style={{ background: circleBg, color: circleColor }}
              >
                {i + 1}
              </div>
              <div
                className="hidden whitespace-nowrap text-[11.5px] sm:block"
                style={{ color: textColor, fontWeight: i === step ? 600 : 400 }}
              >
                {label}
              </div>
              <div className="mx-1 h-[2px] flex-1" style={{ background: lineBg }} />
            </div>
          );
        })}
      </div>

      {/* B. Form card */}
      <div className="rounded-2xl border border-black/[0.03] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-8">
        {/* ── STEP 0 ── */}
        {step === 0 && (
          <div>
            <div className="mb-5 text-[18px] font-bold text-[#1A1C1A]">Farmer & Location</div>

            {/* Visit type (controls GPS capture) + the store this visit is recorded against */}
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Visit Type</FieldLabel>
                <div className="inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
                  {(
                    [
                      ["field", "🚜 Field Visit"],
                      ["store", "🏪 At Store"],
                    ] as const
                  ).map(([mode, label]) => {
                    const active = form.visitMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => set("visitMode", mode)}
                        className="rounded-[8px] px-4 py-2 text-[12.5px] font-semibold transition-colors"
                        style={{
                          background: active ? "#FFFFFF" : "transparent",
                          color: active ? "#7DA02E" : "#9E9E9E",
                          boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel>Store *</FieldLabel>
                {storeLocked ? (
                  <div className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-[#E9F2CF] bg-[#F1F8F1] px-3.5 py-[11px] text-[14px] font-semibold text-[#7DA02E]">
                    🏪 {stores[0].name}
                  </div>
                ) : (
                  <select
                    value={form.storeId ?? ""}
                    onChange={(e) => set("storeId", e.target.value ? Number(e.target.value) : null)}
                    className={`w-full rounded-[10px] border-[1.5px] bg-white px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E] ${
                      form.storeId == null ? "border-[#EF9A9A]" : "border-[#E0E0E0]"
                    }`}
                  >
                    <option value="">Select store…</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
                {!storeLocked && form.storeId == null && (
                  <div className="mt-[7px] text-[11px] text-[#C62828]">Pick the store this visit belongs to.</div>
                )}
              </div>
            </div>

            {/* Primary ID hero */}
            <div className="mb-5 rounded-[13px] border-[1.5px] border-[#DBE9B4] bg-gradient-to-br from-[#F1F8F1] to-[#F5F9EA] p-5">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.7px] text-[#7DA02E]">
                <PlusBadge />
                {primaryIdLabel} *
              </div>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="Enter 10-digit mobile number"
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                className={`w-full rounded-[10px] border-2 bg-white px-4 py-[13px] text-[16px] tracking-[1px] outline-none focus:ring-[3px] focus:ring-[#7DA02E]/[0.12] ${
                  form.mobile && !mobileValid
                    ? "border-[#EF9A9A] focus:border-[#C62828]"
                    : "border-[#E9F2CF] focus:border-[#7DA02E]"
                }`}
              />
              <div
                className="mt-[7px] text-[11px]"
                style={{ color: form.mobile && !mobileValid ? "#C62828" : "#757575" }}
              >
                {form.mobile && !mobileValid
                  ? "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
                  : lookupStatus === "loading"
                    ? "Looking up farmer…"
                    : "Enter a registered number to pull up and edit that farmer's details."}
              </div>
            </div>

            {/* Returning farmer card — details autofilled below, editable */}
            {lookupStatus === "found" && foundFarmer && (
              <div className="mb-[18px] rounded-xl border-[1.5px] border-[#DBE9B4] bg-[#F5F9EA] px-4 py-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.7px] text-[#7DA02E]">
                  <CheckBadge />
                  Returning farmer — editing existing record
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar
                    size={40}
                    initials={initials(foundFarmer.name)}
                    background={avatarColor(foundFarmer.id)}
                  />
                  <div className="flex-1">
                    <div className="text-[14.5px] font-bold text-[#1A1C1A]">
                      {foundFarmer.name}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[#616161]">
                      {[foundFarmer.village, foundFarmer.district]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                  </div>
                  {foundFarmer.segmentLabel && (
                    <span
                      className="rounded-full px-2.5 py-[3px] text-[10.5px] font-bold"
                      style={{
                        background: SEGMENT_BGS[foundFarmer.segmentLabel as SegmentLabel] ?? "#F5F5F5",
                        color: SEGMENT_COLORS[foundFarmer.segmentLabel as SegmentLabel] ?? "#9E9E9E",
                      }}
                    >
                      {foundFarmer.segmentLabel}
                    </span>
                  )}
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {[
                    { label: "Crop", value: foundFarmer.mainCrop || "—", green: false },
                    { label: "Last Visit", value: foundFarmer.lastVisit, green: false },
                    { label: "Lifetime Value", value: foundFarmer.ltv, green: true },
                  ].map((cell) => (
                    <div key={cell.label} className="rounded-lg bg-white px-2.5 py-2">
                      <div className="text-[9px] font-semibold uppercase text-[#9E9E9E]">
                        {cell.label}
                      </div>
                      <div
                        className="mt-0.5 text-[12.5px] font-semibold"
                        style={{ color: cell.green ? "#7DA02E" : "#1A1C1A" }}
                      >
                        {cell.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-2.5 text-[11px] text-[#7DA02E]">
                  Details are autofilled below — edit any field and submit to update this farmer&apos;s
                  record.
                </div>
                <Link
                  href={`/farmers/${foundFarmer.id}`}
                  className="block rounded-lg bg-[#7DA02E] py-[9px] text-center text-[12px] font-semibold text-white hover:bg-[#66852A]"
                >
                  View Full Profile →
                </Link>
              </div>
            )}

            {/* New farmer banner */}
            {lookupStatus === "notfound" && (
              <div className="mb-[18px] flex items-center gap-2 rounded-[10px] border-[1.5px] border-[#F8D9A3] bg-[#FEF6E9] px-3.5 py-[11px]">
                <WarnTriangle />
                <span className="text-[12px] font-medium text-[#795548]">
                  New farmer — no existing record for this mobile. Continuing as new registration.
                </span>
              </div>
            )}

            {/* Farmer details grid */}
            <div className="mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Farmer Name *</FieldLabel>
                <input
                  type="text"
                  placeholder="Enter farmer name"
                  value={form.name}
                  onChange={onText("name")}
                  className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E]"
                />
              </div>
              <div>
                <FieldLabel>Father/Husband Name</FieldLabel>
                <input
                  type="text"
                  placeholder="Enter name"
                  value={form.father}
                  onChange={onText("father")}
                  className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E]"
                />
              </div>
              <div>
                <FieldLabel>Village *</FieldLabel>
                <input
                  type="text"
                  list="nv-villages"
                  placeholder="Village"
                  value={form.village}
                  onChange={onText("village")}
                  className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E]"
                />
                <datalist id="nv-villages">
                  {villages.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
              <div>
                <FieldLabel>District</FieldLabel>
                <select
                  value={form.district}
                  onChange={onText("district")}
                  className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] bg-white px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E]"
                >
                  <option value="">Select district…</option>
                  {form.district && !districts.includes(form.district) && (
                    <option value={form.district}>{form.district}</option>
                  )}
                  {districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <FieldLabel>Visit Reason{visitReasonStar}</FieldLabel>
              <select
                value={form.visitPurpose}
                onChange={onText("visitPurpose")}
                className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] bg-white px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E]"
              >
                <option value="">Select a reason…</option>
                {form.visitPurpose && !visitReasons.includes(form.visitPurpose) && (
                  <option value={form.visitPurpose}>{form.visitPurpose}</option>
                )}
                {visitReasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {form.visitMode === "field" ? (
              <div className="flex items-center gap-2.5 rounded-[10px] bg-[#F5F7F5] px-[18px] py-3.5">
                <div
                  className="h-2 w-2 flex-none rounded-full"
                  style={{
                    background:
                      geoStatus === "done"
                        ? "#7DA02E"
                        : geoStatus === "error"
                          ? "#C62828"
                          : "#EDA942",
                  }}
                />
                <div className="text-[12px] text-[#616161]">
                  {geoStatus === "locating" && "Getting your location…"}
                  {geoStatus === "idle" && "Preparing location…"}
                  {geoStatus === "error" &&
                    "Location unavailable — enable GPS / location permission to record it."}
                  {geoStatus === "done" && form.gpsLat != null && form.gpsLng != null && (
                    <>
                      GPS Location:{" "}
                      <span className="font-semibold text-[#7DA02E]">
                        {form.gpsLat.toFixed(4)}° N, {form.gpsLng.toFixed(4)}° E
                      </span>{" "}
                      — Confirmed
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-[10px] border border-[#F8D9A3] bg-[#FEF6E9] px-[18px] py-3.5">
                <div className="h-2 w-2 flex-none rounded-full bg-[#EDA942]" />
                <div className="text-[12px] text-[#795548]">
                  Filling in from the store — the farmer&apos;s location won&apos;t be recorded.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div>
            <div className="mb-5 text-[18px] font-bold text-[#1A1C1A]">Land & Crops</div>

            <div className="mb-5">
              <FieldLabel>Land Holding *</FieldLabel>
              <ChipGroup
                options={options.landHolding}
                value={form.landHolding}
                onChange={(v) => set("landHolding", v)}
              />
            </div>

            <div className="mb-5">
              <FieldLabel>Soil Type</FieldLabel>
              <ChipGroupWithOther
                size="sm"
                fieldKey="soil"
                options={options.soilType}
                value={form.soil}
                onChange={setChip("soil", "soil")}
                detail={form.otherText.soil ?? ""}
                onDetail={(t) => setOtherText("soil", t)}
              />
            </div>

            <div className="mb-5 flex items-center gap-3.5">
              <div className="text-[12px] font-semibold text-[#616161]">Soil Testing</div>
              <Toggle
                ariaLabel="Soil Testing"
                checked={form.soilTesting === "Required"}
                onChange={(v) => set("soilTesting", v ? "Required" : "Not Required")}
                labels={{ on: "Required", off: "Not Required" }}
              />
            </div>

            <div className="mb-5">
              <FieldLabel>Water Source</FieldLabel>
              <ChipGroupWithOther
                multi
                fieldKey="waterSource"
                options={options.waterSource}
                value={form.waterSource}
                onChange={setChip("waterSource", "waterSource")}
                detail={form.otherText.waterSource ?? ""}
                onDetail={(t) => setOtherText("waterSource", t)}
              />
            </div>

            <div className="mb-5">
              <FieldLabel>
                Crops *{" "}
                <span className="font-normal text-[#9E9E9E]">
                  — pick crops, star the main one
                </span>
              </FieldLabel>
              <CropSelector
                options={options.crop}
                main={form.mainCrop}
                others={form.crop}
                onChange={({ main, others }) =>
                  setForm((f) => ({
                    ...f,
                    mainCrop: main,
                    crop: others,
                    otherText:
                      main === "Other" || others.includes("Other")
                        ? f.otherText
                        : { ...f.otherText, crop: "" },
                  }))
                }
                otherText={form.otherText.crop ?? ""}
                onOtherText={(v) => setOtherText("crop", v)}
              />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Season *</FieldLabel>
                <ChipGroup
                  options={options.season}
                  value={form.season}
                  onChange={(v) => set("season", v)}
                />
              </div>
              <div className="flex items-center gap-3.5 pt-[22px]">
                <div className="text-[12px] font-semibold text-[#616161]">Crop Insured?</div>
                <Toggle checked={form.cropInsured} onChange={(v) => set("cropInsured", v)} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div>
            <div className="mb-5 text-[18px] font-bold text-[#1A1C1A]">Products & Issues</div>

            {/* Products */}
            <GroupHeader icon={<BoxIcon />} title="Products" />
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SectionCard title="Currently Using">
                <ChipGroupWithOther
                  multi
                  size="sm"
                  fieldKey="product"
                  options={options.product}
                  value={form.product}
                  onChange={setChip("product", "product")}
                  detail={form.otherText.product ?? ""}
                  onDetail={(t) => setOtherText("product", t)}
                />
              </SectionCard>
              <SectionCard title="Required">
                <ChipGroupWithOther
                  multi
                  size="sm"
                  fieldKey="productRequired"
                  options={options.productRequired}
                  value={form.productRequired}
                  onChange={setChip("productRequired", "productRequired")}
                  detail={form.otherText.productRequired ?? ""}
                  onDetail={(t) => setOtherText("productRequired", t)}
                />
              </SectionCard>
            </div>

            {/* Issues & Risks */}
            <GroupHeader icon={<AlertIcon />} title="Issues & Risks" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SectionCard title="Current Problem">
                <ChipGroupWithOther
                  multi
                  size="sm"
                  fieldKey="currentProblem"
                  options={options.currentProblem}
                  value={form.currentProblem}
                  onChange={setChip("currentProblem", "currentProblem")}
                  detail={form.otherText.currentProblem ?? ""}
                  onDetail={(t) => setOtherText("currentProblem", t)}
                />
              </SectionCard>
              <SectionCard title="Pests / Diseases Seen">
                <ChipGroupWithOther
                  multi
                  size="sm"
                  fieldKey="pests"
                  options={options.pests}
                  value={form.pests}
                  onChange={setChip("pests", "pests")}
                  detail={form.otherText.pests ?? ""}
                  onDetail={(t) => setOtherText("pests", t)}
                />
              </SectionCard>
              <SectionCard title="Crop Risk">
                <ChipGroupWithOther
                  multi
                  size="sm"
                  fieldKey="cropRisk"
                  options={options.cropRisk}
                  value={form.cropRisk}
                  onChange={setChip("cropRisk", "cropRisk")}
                  detail={form.otherText.cropRisk ?? ""}
                  onDetail={(t) => setOtherText("cropRisk", t)}
                />
              </SectionCard>
              <SectionCard title="Danger Zone" className="col-span-2">
                <ChipGroup
                  multi
                  size="sm"
                  options={options.dangerZone}
                  value={form.dangerZone}
                  onChange={(v) => set("dangerZone", v)}
                />
              </SectionCard>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div>
            <div className="mb-5 text-[18px] font-bold text-[#1A1C1A]">Commercial & Services</div>

            <div className="mb-[18px]">
              <FieldLabel>Annual Agriculture Expense</FieldLabel>
              <BucketSlider
                options={options.annualExpense}
                value={form.annualExpense}
                onChange={(v) => set("annualExpense", v)}
                ariaLabel="Annual Agriculture Expense"
              />
            </div>

            <div className="mb-[18px]">
              <FieldLabel>Purchase Frequency</FieldLabel>
              <ChipGroup
                options={options.purchaseFreq}
                value={form.purchaseFreq}
                onChange={(v) => set("purchaseFreq", v)}
              />
            </div>

            <div className="mb-5">
              <FieldLabel>Other Shops Buy From</FieldLabel>
              <input
                type="text"
                placeholder="e.g. Local market, XYZ Agri Store..."
                value={form.otherShops}
                onChange={onText("otherShops")}
                className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]"
              />
            </div>

            <div className="mb-3.5 border-t border-[#F0F0F0] pt-1 text-[13px] font-bold text-[#424242]">
              Services & Membership
            </div>
            <div className="flex flex-col gap-2.5">
              {(
                [
                  ["FPO Member?", "fpoMember", "FPO / society name"],
                  ["Contract Farming?", "contractFarming", "Company & crop under contract"],
                  ["Dairy Services?", "dairyServices", "Dairy details (name, animals, litres/day)"],
                  ["WhatsApp Available?", "whatsappAvail", "WhatsApp number"],
                ] as const
              ).map(([label, key, ph]) => (
                <div key={key} className="rounded-[10px] border border-[#F0F0F0] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-semibold text-[#616161]">{label}</div>
                    <Toggle
                      ariaLabel={label}
                      checked={form[key]}
                      onChange={(v) => setService(key, v)}
                    />
                  </div>
                  <OtherReveal
                    show={form[key]}
                    value={form.serviceDetail[key] ?? ""}
                    onChange={(v) => setServiceDetail(key, v)}
                    placeholder={ph}
                    inputMode={key === "whatsappAvail" ? "numeric" : undefined}
                  />
                  {key === "whatsappAvail" &&
                    form.whatsappAvail &&
                    mobileValid &&
                    form.serviceDetail.whatsappAvail !== form.mobile && (
                      <button
                        type="button"
                        onClick={() => setServiceDetail("whatsappAvail", form.mobile)}
                        className="mt-2 text-[11px] font-semibold text-[#7DA02E] hover:underline"
                      >
                        Same as mobile ({form.mobile})
                      </button>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (
          <div>
            <div className="mb-5 text-[18px] font-bold text-[#1A1C1A]">Review & Submit</div>

            <div className="mb-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Next Follow-up Date</FieldLabel>
                <input
                  type="date"
                  value={form.followUpDate}
                  onChange={onText("followUpDate")}
                  className="w-full rounded-[10px] border-[1.5px] border-[#E0E0E0] px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E]"
                />
              </div>
              <div>
                <FieldLabel>Follow-up Reason{followUpSet && <span className="text-[#C62828]"> *</span>}</FieldLabel>
                <select
                  value={form.followUpReason}
                  onChange={onText("followUpReason")}
                  className={`w-full rounded-[10px] border-[1.5px] bg-white px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E] ${followUpSet && !form.followUpReason.trim() ? "border-[#EF9A9A]" : "border-[#E0E0E0]"}`}
                >
                  <option value="">Select a reason…</option>
                  {options.followUpReason.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-2">
              <FieldLabel>Follow-up Comments{followUpSet && <span className="text-[#C62828]"> *</span>}</FieldLabel>
              <textarea
                value={form.followUpComment}
                onChange={(e) => setForm((f) => ({ ...f, followUpComment: e.target.value }))}
                rows={3}
                placeholder={followUpSet ? "What is the next visit for? Add context for the action…" : "Only needed if you set a follow-up date"}
                className={`w-full resize-y rounded-[10px] border-[1.5px] px-3.5 py-[11px] text-[14px] outline-none focus:border-[#7DA02E] ${followUpSet && !form.followUpComment.trim() ? "border-[#EF9A9A]" : "border-[#E0E0E0]"}`}
              />
            </div>
            <p className="mb-6 text-[12px] text-[#9E9E9E]">
              {followUpSet
                ? "A reason and comment are required — this creates a follow-up in the Action Registry, assigned to your store."
                : "Set a date to schedule a follow-up in the Action Registry."}
            </p>

            <div className="mb-5 rounded-xl bg-[#F5F7F5] p-[18px]">
              <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">Visit Summary</div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {(
                  [
                    ["Farmer", form.name],
                    ["Mobile", form.mobile],
                    ["Village", form.village],
                    ["Land", form.landHolding],
                    ["Main Crop", form.mainCrop],
                    ["Season", form.season],
                    ["Expense", form.annualExpense],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="text-[#757575]">
                    {label}:{" "}
                    <span className="font-semibold text-[#1A1C1A]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {optInQr && (
              <div className="mb-5 rounded-xl border-[1.5px] border-[#DBE9B4] bg-[#F1F8F1] p-[18px]">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.7px] text-[#0B8A3D]">
                  ⚡ WhatsApp updates
                </div>
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optInQr} alt="Scan to opt in to WhatsApp updates" className="h-40 w-40 shrink-0 rounded-[10px] border border-[#E9F2CF] bg-white p-1.5" />
                  <div className="text-[13px] leading-relaxed text-[#33691E]">
                    <div className="font-bold text-[#66852A]">Ask the farmer to scan this</div>
                    <div className="mt-1">They&apos;ll open WhatsApp with a ready message — they just tap <b>send</b>. That opts them in to receive product updates &amp; offers from Verde Agrotech on WhatsApp.</div>
                    <div className="mt-1.5 text-[11.5px] text-[#558B2F]">Optional — the visit still submits either way.</div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <FieldLabel>Photos</FieldLabel>
                <PhotoCapture photos={form.photos} onChange={(v) => set("photos", v)} />
              </div>
              <div>
                <FieldLabel>Voice Notes</FieldLabel>
                <VoiceRecorder notes={form.voiceNotes} onChange={(v) => set("voiceNotes", v)} />
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <div className="mt-4 rounded-[10px] border border-[#F5C6C6] bg-[#FDECEA] px-3.5 py-2.5 text-[12px] font-medium text-[#C62828]">
            {submitError}
          </div>
        )}

        {/* Wizard nav */}
        <div className="mt-7 flex justify-between border-t border-[#F0F0F0] pt-5">
          {step > 0 ? (
            <button
              type="button"
              onClick={prev}
              className="rounded-[10px] border-[1.5px] border-[#E0E0E0] px-7 py-[11px] text-[13px] font-semibold text-[#616161] hover:border-[#7DA02E] hover:text-[#7DA02E]"
            >
              Previous
            </button>
          ) : (
            <div />
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              disabled={(step === 0 && !step0Valid) || (step === 1 && !step1Valid)}
              title={
                step === 0 && !step0Valid
                  ? "Select a store and enter a valid mobile, farmer name, village and visit reason to continue."
                  : step === 1 && !step1Valid
                    ? "Select at least one crop to continue."
                    : undefined
              }
              className="rounded-[10px] bg-[#7DA02E] px-8 py-[11px] text-[13px] font-semibold text-white hover:bg-[#66852A] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#7DA02E]"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending || !followUpValid}
              title={!followUpValid ? "Add a follow-up reason and comment (required when a follow-up date is set)." : undefined}
              className="rounded-[10px] bg-[#7DA02E] px-8 py-[11px] text-[13px] font-semibold text-white hover:bg-[#66852A] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Submitting…" : "Submit Visit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
