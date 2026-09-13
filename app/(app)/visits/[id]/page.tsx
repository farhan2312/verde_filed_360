import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getScope, visitScopeWhere, getActor, canReviewVisit } from "@/lib/scope";
import { roleLabel } from "@/lib/roles";
import { initials, avatarColor } from "@/lib/format";
import { shortStoreName, storeColor } from "@/lib/store-utils";
import {
  SEGMENT_ENUM_TO_LABEL,
  SEGMENT_COLORS,
  SEGMENT_BGS,
  type SegmentLabel,
} from "@/lib/segments";
import {
  visitTypeColor,
  followupNeeded,
  recommendationsFor,
} from "@/lib/visit-types";
import { VisitDetailView, type VisitDetailData } from "@/components/visit-detail/VisitDetailView";

export const dynamic = "force-dynamic";

type VisitRow = {
  id: number;
  date: string | null;
  visitedAt: Date | null;
  followUpDate: string | null;
  purpose: string | null;
  notes: string | null;
  officerName: string | null;
  recordedBy: string | null;
  recordedByCode: string | null;
  storeId: number | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedByCode: string | null;
  reviewedByRole: string | null;
  createdAt: Date;
  visitMode: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  segment: string | null;
  // Captured wizard fields
  soilType: string | null;
  soilTesting: string | null;
  waterSource: string[];
  mainCrop: string | null;
  crops: string[];
  otherCrops: string | null;
  season: string | null;
  cropInsured: boolean;
  landHoldingUnit: string | null;
  products: string[];
  productRequired: string[];
  currentProblem: string[];
  cropRisk: string[];
  dangerZone: string[];
  annualExpense: string | null;
  purchaseFreq: string | null;
  otherShops: string | null;
  fpoMember: boolean;
  fpoName: string | null;
  contractFarming: boolean;
  contractDetail: string | null;
  dairyServices: boolean;
  dairyDetail: string | null;
  whatsappAvail: boolean;
  whatsappNumber: string | null;
  photos: string[];
  voiceNotes: string[];
  farmer: {
    id: number;
    name: string;
    mobile: string | null;
    village: string | null;
    district: string | null;
    crop: string | null;
    land: number | null;
    segment: string | null;
  } | null;
  store: { id: number; name: string } | null;
};

function gpsString(lat: number | null, lng: number | null): { text: string; verified: boolean } {
  if (lat != null && lng != null) {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lng >= 0 ? "E" : "W";
    return {
      text: `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew} · Verified`,
      verified: true,
    };
  }
  return { text: "Not captured", verified: false };
}

/** A full, human display date: prefer the stored display string, else format visitedAt. */
function displayDate(dateStr: string | null, visitedAt: Date | null): string {
  if (dateStr && dateStr.trim()) return dateStr.trim();
  if (visitedAt)
    return visitedAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  return "";
}

/** An empty-but-valid detail record (used when the DB is unavailable pre-seed). */
function emptyDetail(id: number, justCreated: boolean): VisitDetailData {
  return {
    vid: `VIS-${String(id).padStart(4, "0")}`,
    visitId: id,
    reviewed: false,
    reviewNote: "",
    reviewedBy: "",
    canReview: false,
    date: "",
    followUpDate: "",
    purpose: "",
    notes: "",
    officer: "",
    recordedBy: "",
    village: "",
    district: "",
    crop: "",
    land: "",
    segment: "",
    storeName: "",
    typeColor: visitTypeColor(null),
    storeColor: "#9E9E9E",
    followup: "None",
    followupBg: "#F3F8E6",
    followupColor: "#678722",
    segBg: "#F5F5F5",
    segColor: "#757575",
    farmerName: "",
    farmerMobile: "",
    init: "",
    avatarBg: "#678722",
    farmerId: null,
    recs: recommendationsFor(null),
    gps: "Not captured",
    gpsVerified: false,
    mainCrop: "",
    crops: [],
    otherCrops: "",
    soilType: "",
    soilTesting: "",
    waterSource: [],
    season: "",
    cropInsured: false,
    landHolding: "",
    products: [],
    productRequired: [],
    currentProblem: [],
    cropRisk: [],
    dangerZone: [],
    annualExpense: "",
    purchaseFreq: "",
    otherShops: "",
    fpoMember: false,
    fpoName: "",
    contractFarming: false,
    contractDetail: "",
    dairyServices: false,
    dairyDetail: "",
    whatsappAvail: false,
    whatsappNumber: "",
    photos: [],
    voiceNotes: [],
    visitMode: "",
    justCreated,
  };
}

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { created?: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const justCreated = searchParams?.created === "1";

  // RBAC: the id lookup is AND-ed with the caller's scope, so an out-of-store /
  // out-of-region visit 404s instead of opening by direct URL.
  const scope = await getScope();
  const visitScope = visitScopeWhere(scope);
  if (visitScope === "none") notFound();

  let visit: VisitRow | null = null;
  let dbError = false;
  try {
    visit = (await prisma.visit.findFirst({
      where: visitScope ? { AND: [{ id }, visitScope] } : { id },
      select: {
        id: true,
        date: true,
        visitedAt: true,
        followUpDate: true,
        purpose: true,
        notes: true,
        officerName: true,
        recordedBy: true,
        recordedByCode: true,
        storeId: true,
        reviewedAt: true,
        reviewNote: true,
        reviewedByName: true,
        reviewedByCode: true,
        reviewedByRole: true,
        createdAt: true,
        visitMode: true,
        gpsLat: true,
        gpsLng: true,
        segment: true,
        soilType: true,
        soilTesting: true,
        waterSource: true,
        mainCrop: true,
        crops: true,
        otherCrops: true,
        season: true,
        cropInsured: true,
        landHoldingUnit: true,
        products: true,
        productRequired: true,
        currentProblem: true,
        cropRisk: true,
        dangerZone: true,
        annualExpense: true,
        purchaseFreq: true,
        otherShops: true,
        fpoMember: true,
        fpoName: true,
        contractFarming: true,
        contractDetail: true,
        dairyServices: true,
        dairyDetail: true,
        whatsappAvail: true,
        whatsappNumber: true,
        photos: true,
        voiceNotes: true,
        farmer: {
          select: {
            id: true,
            name: true,
            mobile: true,
            village: true,
            district: true,
            crop: true,
            land: true,
            segment: true,
          },
        },
        store: { select: { id: true, name: true } },
      },
    })) as VisitRow | null;
  } catch {
    dbError = true;
  }

  if (dbError) return <VisitDetailView data={emptyDetail(id, justCreated)} />;
  if (!visit) notFound();

  // Segment: prefer the visit's own segment, fall back to the farmer's.
  const segEnum = visit.segment ?? visit.farmer?.segment ?? null;
  const segLabel: SegmentLabel | "" = segEnum ? SEGMENT_ENUM_TO_LABEL[segEnum] ?? "" : "";

  // A follow-up is scheduled when the officer actually recorded a follow-up date;
  // fall back to the purpose-based heuristic only when no explicit date exists.
  const needsFollowup = !!visit.followUpDate || followupNeeded(visit.purpose);
  const gps = gpsString(visit.gpsLat, visit.gpsLng);

  // Header "Crop"/"Land" reflect what THIS visit captured, falling back to the farmer record.
  const headerCrop = visit.mainCrop || visit.farmer?.crop || "";
  const headerLand =
    visit.landHoldingUnit ||
    (visit.farmer?.land != null ? `${visit.farmer.land} acres` : "");

  // Review / sign-off: can the current user review this visit? (recorder / managing RM / admin)
  const actor = await getActor();
  const canReview = canReviewVisit(scope, actor.code, { storeId: visit.storeId ?? visit.store?.id ?? null, byCode: visit.recordedByCode });
  const reviewedBy = visit.reviewedByName
    ? `${visit.reviewedByName}${visit.reviewedByCode ? ` (${visit.reviewedByCode})` : ""}${visit.reviewedByRole ? ` · ${roleLabel(visit.reviewedByRole as never)}` : ""}${visit.reviewedAt ? ` · ${visit.reviewedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}` : ""}`
    : "";

  const data: VisitDetailData = {
    vid: `VIS-${String(visit.id).padStart(4, "0")}`,
    visitId: visit.id,
    reviewed: visit.reviewedAt != null,
    reviewNote: visit.reviewNote ?? "",
    reviewedBy,
    canReview,
    date: displayDate(visit.date, visit.visitedAt),
    followUpDate: visit.followUpDate
      ? (() => { const d = new Date(`${visit.followUpDate}T00:00:00`); return Number.isNaN(d.getTime()) ? visit.followUpDate! : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); })()
      : "",
    purpose: visit.purpose ?? "",
    notes: visit.notes ?? "",
    officer: visit.officerName ?? "",
    // Audit: the actual logged-in user who filled the form + the fill timestamp.
    recordedBy: visit.recordedBy
      ? `${visit.recordedBy}${visit.recordedByCode ? ` (${visit.recordedByCode})` : ""} · ${visit.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`
      : "",
    village: visit.farmer?.village ?? "",
    district: visit.farmer?.district ?? "",
    crop: headerCrop,
    land: headerLand,
    segment: segLabel,
    storeName: shortStoreName(visit.store?.name),
    typeColor: visitTypeColor(visit.purpose),
    storeColor: visit.store ? storeColor(visit.store.id) : "#9E9E9E",
    followup: visit.followUpDate
      ? (() => { const d = new Date(`${visit.followUpDate}T00:00:00`); return Number.isNaN(d.getTime()) ? visit.followUpDate! : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); })()
      : needsFollowup ? "Needed" : "None",
    followupBg: needsFollowup ? "#FFF3E0" : "#F3F8E6",
    followupColor: needsFollowup ? "#E65100" : "#678722",
    segBg: segLabel ? SEGMENT_BGS[segLabel] : "#F5F5F5",
    segColor: segLabel ? SEGMENT_COLORS[segLabel] : "#757575",
    farmerName: visit.farmer?.name ?? "",
    farmerMobile: visit.farmer?.mobile ?? "",
    init: visit.farmer ? initials(visit.farmer.name) : "",
    avatarBg: avatarColor(visit.farmer?.id ?? visit.id),
    farmerId: visit.farmer?.id ?? null,
    recs: recommendationsFor(visit.purpose),
    gps: gps.text,
    gpsVerified: gps.verified,
    mainCrop: visit.mainCrop ?? "",
    crops: visit.crops ?? [],
    otherCrops: visit.otherCrops ?? "",
    soilType: visit.soilType ?? "",
    soilTesting: visit.soilTesting ?? "",
    waterSource: visit.waterSource ?? [],
    season: visit.season ?? "",
    cropInsured: visit.cropInsured,
    landHolding: visit.landHoldingUnit ?? "",
    products: visit.products ?? [],
    productRequired: visit.productRequired ?? [],
    currentProblem: visit.currentProblem ?? [],
    cropRisk: visit.cropRisk ?? [],
    dangerZone: visit.dangerZone ?? [],
    annualExpense: visit.annualExpense ?? "",
    purchaseFreq: visit.purchaseFreq ?? "",
    otherShops: visit.otherShops ?? "",
    fpoMember: visit.fpoMember,
    fpoName: visit.fpoName ?? "",
    contractFarming: visit.contractFarming,
    contractDetail: visit.contractDetail ?? "",
    dairyServices: visit.dairyServices,
    dairyDetail: visit.dairyDetail ?? "",
    whatsappAvail: visit.whatsappAvail,
    whatsappNumber: visit.whatsappNumber ?? "",
    photos: visit.photos ?? [],
    voiceNotes: visit.voiceNotes ?? [],
    visitMode: visit.visitMode ?? "",
    justCreated,
  };

  return <VisitDetailView data={data} />;
}
