"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cleanCrop, cleanPest } from "@/lib/crop-clean";
import { getPersona } from "@/lib/session";
import { getActor, getScope } from "@/lib/scope";
import { logAudit } from "@/lib/audit";
import { STATS_TAG } from "@/lib/stats";
import {
  LEAD_LABEL_TO_ENUM,
  SEGMENT_ENUM_TO_LABEL,
  LEAD_ENUM_TO_LABEL,
  type LeadStatusLabel,
} from "@/lib/segments";
import { inr } from "@/lib/format";
import type { VisitForm, FarmerLookupResult } from "@/components/new-visit/types";

/** Map the wizard lead-status label to the Prisma LeadStatus enum (best effort). */
function leadEnum(label: string): string | undefined {
  return LEAD_LABEL_TO_ENUM[label as LeadStatusLabel];
}

/**
 * Look up a registered farmer by mobile number (across ALL farmers) so the wizard
 * can autofill and edit the existing record. Prefers the enriched (DEMO) row when
 * a number is shared.
 */
export async function lookupFarmerByMobile(mobile: string): Promise<FarmerLookupResult> {
  const m = mobile.trim();
  if (m.length < 10) return { found: false };
  try {
    const f = await prisma.farmer.findFirst({
      where: { mobile: m },
      orderBy: [{ source: "asc" }, { id: "asc" }], // DEMO before REAL
      select: {
        id: true,
        name: true,
        village: true,
        district: true,
        crop: true,
        segment: true,
        leadStatus: true,
      },
    });
    if (!f) return { found: false };

    const [agg, lastVisit] = await Promise.all([
      prisma.saleLine.aggregate({ where: { farmerId: f.id, source: "REAL" }, _sum: { basic: true } }),
      prisma.visit.findFirst({
        where: { farmerId: f.id },
        orderBy: [{ visitedAt: "desc" }, { id: "desc" }],
        select: {
          date: true, landHoldingUnit: true, soilType: true, soilTesting: true, waterSource: true,
          mainCrop: true, crops: true, otherCrops: true, pests: true, season: true, cropInsured: true,
          products: true, productRequired: true, currentProblem: true, cropRisk: true, dangerZone: true,
          annualExpense: true, purchaseFreq: true, otherShops: true,
          fpoMember: true, fpoName: true, contractFarming: true, contractDetail: true,
          dairyServices: true, dairyDetail: true, whatsappAvail: true, whatsappNumber: true,
        },
      }),
    ]);

    // Prefill the next visit with the last visit's descriptive fields (editable). Media, follow-up
    // and visit purpose are intentionally left blank — they belong to each individual visit.
    const prefill = lastVisit
      ? {
          landHolding: lastVisit.landHoldingUnit ?? "",
          soil: lastVisit.soilType ?? "",
          soilTesting: lastVisit.soilTesting ?? "",
          waterSource: lastVisit.waterSource ?? [],
          mainCrop: lastVisit.mainCrop ?? "",
          crop: lastVisit.crops ?? [],
          otherCrops: lastVisit.otherCrops ?? "",
          pests: lastVisit.pests ?? [],
          season: lastVisit.season ?? "",
          cropInsured: lastVisit.cropInsured ?? false,
          product: lastVisit.products ?? [],
          productRequired: lastVisit.productRequired ?? [],
          currentProblem: lastVisit.currentProblem ?? [],
          cropRisk: lastVisit.cropRisk ?? [],
          dangerZone: lastVisit.dangerZone ?? [],
          annualExpense: lastVisit.annualExpense ?? "",
          purchaseFreq: lastVisit.purchaseFreq ?? "",
          otherShops: lastVisit.otherShops ?? "",
          fpoMember: lastVisit.fpoMember ?? false,
          contractFarming: lastVisit.contractFarming ?? false,
          dairyServices: lastVisit.dairyServices ?? false,
          whatsappAvail: lastVisit.whatsappAvail ?? false,
          serviceDetail: {
            fpoMember: lastVisit.fpoName ?? "",
            contractFarming: lastVisit.contractDetail ?? "",
            dairyServices: lastVisit.dairyDetail ?? "",
            whatsappAvail: lastVisit.whatsappNumber ?? "",
          },
        }
      : undefined;

    return {
      found: true,
      prefill,
      farmer: {
        id: f.id,
        name: f.name,
        village: f.village ?? "",
        district: f.district ?? "",
        mainCrop: f.crop ?? "",
        segmentLabel: f.segment ? SEGMENT_ENUM_TO_LABEL[f.segment] ?? null : null,
        leadStatusLabel: f.leadStatus ? LEAD_ENUM_TO_LABEL[f.leadStatus] ?? null : null,
        ltv: agg._sum.basic ? inr(Math.round(agg._sum.basic)) : "—",
        lastVisit: lastVisit?.date ?? "—",
      },
    };
  } catch {
    return { found: false };
  }
}

/**
 * Persist a New Visit. When `editingFarmerId` is supplied (an existing farmer was
 * pulled up by mobile) the farmer record is UPDATED; otherwise a farmer is created
 * (or matched by mobile). Then the Visit log entry is created. Tolerant of a
 * missing DB — always routes onward.
 */
export async function submitVisitAction(
  form: VisitForm,
  editingFarmerId?: number | null,
): Promise<void> {
  const persona = await getPersona();
  const officerName = persona.name;
  const actor = await getActor(); // audit: the ACTUAL logged-in user (name + employee code)
  const scope = await getScope(); // the filling user's store (officers/RMs are store/region scoped)
  let newVisitId: number | undefined;

  // An Agri Officer with no store assigned may not log visits — every visit must belong to a store, and
  // an officer can only file for their own. (RMs/admins pick a store on the form, so they're exempt.)
  const resolvedStoreId = form.storeId ?? scope.storeId ?? null;
  if (scope.role === "officer" && resolvedStoreId == null) {
    redirect("/visits/new?error=nostore");
  }

  try {
    // The store this visit is recorded against. It now comes from the mandatory Store picker on the
    // form (auto-set for single-store officers, chosen by RMs/admins). Fall back to the filler's own
    // scope store for older clients that don't send one.
    const chosenStoreId = form.storeId ?? scope.storeId ?? null;
    const officerStore = chosenStoreId != null
      ? await prisma.store.findUnique({ where: { id: chosenStoreId }, select: { id: true, code: true } })
      : null;
    let farmerId: number | undefined;
    // Store recorded on the visit: always the store chosen on the form; only falls back to an
    // existing farmer's own store when the form somehow didn't carry one.
    let visitStoreId: number | null = officerStore?.id ?? null;
    const mobile = form.mobile.trim();
    const lead = leadEnum(form.leadStatus);

    const editData = {
      name: form.name || undefined,
      village: form.village || null,
      district: form.district || null,
      crop: form.mainCrop || null,
      issues: form.currentProblem,
      ...(lead ? { leadStatus: lead as never } : {}),
      ...(mobile ? { mobile } : {}),
    };

    // A store-less existing farmer inherits the store chosen on the form (keeps records complete);
    // a farmer who already has a store keeps it.
    const farmerStorePatch = (currentStoreId: number | null) =>
      currentStoreId == null && officerStore ? { storeId: officerStore.id, storeCode: officerStore.code } : {};

    if (editingFarmerId) {
      // Edit the pulled-up record directly. The visit is recorded against the store chosen on the form.
      const updated = await prisma.farmer.update({
        where: { id: editingFarmerId },
        data: { ...editData, ...farmerStorePatch((await prisma.farmer.findUnique({ where: { id: editingFarmerId }, select: { storeId: true } }))?.storeId ?? null) },
      });
      farmerId = updated.id;
      if (officerStore == null) visitStoreId = updated.storeId; // old client sent no store → fall back
      await logAudit("Farmer", "UPDATE", `Edited farmer profile: ${updated.name}`, actor.name);
    } else if (mobile.length > 0) {
      const existing = await prisma.farmer.findFirst({ where: { mobile } });
      if (existing) {
        // Known farmer — recorded against the chosen store; stamp the farmer's store only if missing.
        const updated = await prisma.farmer.update({
          where: { id: existing.id },
          data: { ...editData, ...farmerStorePatch(existing.storeId) },
        });
        farmerId = updated.id;
        if (officerStore == null) visitStoreId = updated.storeId;
      } else {
        // Brand-new farmer — stamp them with the filling officer's store.
        const created = await prisma.farmer.create({
          data: {
            code: `FARM-NV-${Date.now()}`,
            name: (form.name || "New Farmer").toUpperCase(), // name cleansing — store new farmers in CAPS
            mobile,
            village: form.village || null,
            district: form.district || null,
            crop: form.mainCrop || null,
            issues: form.currentProblem,
            ...(lead ? { leadStatus: lead as never } : {}),
            ...(officerStore ? { storeId: officerStore.id, storeCode: officerStore.code } : {}),
            // No sales yet → a lead: LEAD lifecycle + NO_SPEND value (both dims stay filled until they buy).
            lifecycleSegment: "LEAD",
            valueSegment: "NO_SPEND",
            source: "REAL",
          },
        });
        farmerId = created.id;
        visitStoreId = officerStore?.id ?? null;
        await logAudit("Farmer", "CREATE", `New farmer captured: ${created.name}`, actor.name);
      }
    }

    const createdVisit = await prisma.visit.create({
      data: {
        farmerId,
        storeId: visitStoreId, // existing farmer → their store; new/walk-in → the officer's store
        officerName,
        recordedBy: actor.name, // audit trail — actual logged-in user (createdAt = fill timestamp)
        recordedByCode: actor.code,
        date: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }),
        followUpDate: form.followUpDate || null, // next-visit date the officer set on Review & Submit
        followUpReason: form.followUpReason || null,
        followUpComment: form.followUpComment || null,
        purpose: form.visitPurpose || null,
        type: form.visitPurpose || null,
        visitMode: form.visitMode,
        // Only a field visit records the farmer's location; a store visit never does.
        gpsLat: form.visitMode === "field" ? form.gpsLat : null,
        gpsLng: form.visitMode === "field" ? form.gpsLng : null,
        soilType: form.soil || null,
        soilTesting: form.soilTesting || null,
        waterSource: form.waterSource,
        mainCrop: form.mainCrop || null,
        crops: form.crop,
        otherCrops: form.otherCrops || null,
        pests: form.pests,
        season: form.season || null,
        cropInsured: form.cropInsured,
        landHoldingUnit: form.landHolding || null,
        products: form.product,
        productRequired: form.productRequired,
        currentProblem: form.currentProblem,
        cropRisk: form.cropRisk,
        dangerZone: form.dangerZone,
        annualExpense: form.annualExpense || null,
        purchaseFreq: form.purchaseFreq || null,
        otherShops: form.otherShops || null,
        fpoMember: form.fpoMember,
        contractFarming: form.contractFarming,
        dairyServices: form.dairyServices,
        whatsappAvail: form.whatsappAvail,
        // Service detail — only stored when the matching toggle is on.
        fpoName: form.fpoMember ? form.serviceDetail.fpoMember?.trim() || null : null,
        contractDetail: form.contractFarming
          ? form.serviceDetail.contractFarming?.trim() || null
          : null,
        dairyDetail: form.dairyServices
          ? form.serviceDetail.dairyServices?.trim() || null
          : null,
        whatsappNumber: form.whatsappAvail
          ? form.serviceDetail.whatsappAvail?.trim() || null
          : null,
        photos: form.photos,
        voiceNotes: form.voiceNotes,
        visitedAt: new Date(),
        source: "REAL",
      },
    });
    newVisitId = createdVisit.id;

    // A follow-up date creates an Action for the filling officer's store, tagged to this farmer +
    // visit, due on that date. It shows up in the Action Registry (scoped by store/district).
    if (form.followUpDate && farmerId) {
      const due = new Date(`${form.followUpDate}T00:00:00Z`);
      if (!Number.isNaN(due.getTime())) {
        await prisma.action.create({
          data: {
            farmerId,
            storeId: officerStore?.id ?? visitStoreId, // the filling officer's store
            visitId: createdVisit.id,
            reason: form.followUpReason || null,
            note: form.followUpComment || null, // the officer's follow-up comment → the action's note
            dueDate: due,
            status: "OPEN",
            createdByName: actor.name,
            createdByCode: actor.code,
          },
        });
      }
    }

    // Denormalise this visit's crops + pests onto the farmer so the visit-lens crop filter and
    // the Target Pest filter update live. Both are kept SEGREGATED by source (mirrors crops):
    //   visitCropTags / visitPestTags = from visits · salesCropTags / salesPestTags = from sales
    //   cropTags / pestTags = the union each filter matches on.
    // Crops use cleanCrop (Visit.mainCrop + crops[]); pests use cleanPest on the dedicated Pests
    // field. A cheap single-row union; value/lifecycle stay sales-driven (batch).
    if (farmerId) {
      const rawCrops = [form.mainCrop, ...form.crop, ...form.otherCrops.split(",")];
      const visitCrops = [...new Set(rawCrops.map((c) => cleanCrop(c)).filter((c): c is string => !!c))];
      const visitPests = [...new Set(form.pests.map((p) => cleanPest(p)).filter((p): p is string => !!p))];
      if (visitCrops.length || visitPests.length) {
        await prisma.$executeRaw`
          UPDATE "Farmer" SET
            "visitCropTags" = ARRAY(SELECT DISTINCT e FROM unnest("visitCropTags" || ${visitCrops}::text[]) e WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e),
            "cropTags"      = ARRAY(SELECT DISTINCT e FROM unnest("cropTags"      || ${visitCrops}::text[]) e WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e),
            "visitPestTags" = ARRAY(SELECT DISTINCT e FROM unnest("visitPestTags" || ${visitPests}::text[]) e WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e),
            "pestTags"      = ARRAY(SELECT DISTINCT e FROM unnest("salesPestTags" || "visitPestTags" || ${visitPests}::text[]) e WHERE e IS NOT NULL AND btrim(e) <> '' ORDER BY e)
          WHERE id = ${farmerId}`;
      }
    }

    await prisma.auditLog.create({
      data: {
        actor: officerName,
        action: editingFarmerId ? "UPDATE" : "CREATE",
        entity: "Visit",
        detail: `${editingFarmerId ? "Updated farmer + logged visit" : "New visit logged"}${
          form.name ? ` for ${form.name}` : ""
        }`,
      },
    });

    revalidatePath("/visits");
    revalidatePath("/analytics");
    revalidatePath("/action-registry");
    // Farmer count / segment summary may have changed — bust the cached stats.
    revalidateTag(STATS_TAG);
  } catch {
    // Tolerate a missing/empty DB — still route the officer onward.
  }

  // Confirm the submission by landing on the freshly-logged visit (the detail page
  // shows a success banner when ?created=1). Falls back to the dashboard if the DB
  // write was skipped (missing/empty DB).
  if (newVisitId) redirect(`/visits/${newVisitId}?created=1`);
  redirect("/analytics?visitLogged=1");
}
