/**
 * Custom analytics — server-side SQL for the semantic model (lib/custom-analytics/model.ts).
 * Every expression here is a trusted constant keyed by a model id; user input only ever reaches the
 * query as bound parameters (see engine.ts). Each dataset aliases its store as `s` so the shared store /
 * region / RM dimensions, page filters and click-to-filter work the same way everywhere.
 * Plain module — import only from server code.
 */

export interface DatasetSql {
  from: string;
  where: string[]; // always-on conditions (REAL data only)
  storeCol: string; // store id used for scope + the Store page filter
  date: string | null; // timestamp the page date filter applies to
  valueSegment?: string;
  lifecycle?: string;
  /** Dimension / numeric field expressions. `lateral` = an extra join the field needs (multi-valued fields). */
  fields: Record<string, { expr: string; lateral?: string }>;
  measures: Record<string, string>;
}

/**
 * The RM dimension resolves `Store.rmUserIds` to the manager's own account name — `Store.regionalManager`
 * is only a denormalised comma-joined display label ("Asha R, Vikram S"), so grouping by it would file a
 * shared store under a composite value instead of under each manager. The lateral returns one row per
 * linked REGIONAL account, so a store with two managers legitimately counts under both (same rule and the
 * same legacy name fallback as `allRmStores` in lib/rm-stores.ts — a store imported with a manager name
 * but no linked account still shows that name).
 */
const RM_LATERAL = `LEFT JOIN LATERAL (SELECT u.name FROM unnest(s."rmUserIds") AS ru(uid) JOIN "User" u ON u.id = ru.uid AND u.role = 'REGIONAL' AND u.active AND u."approvalStatus" = 'APPROVED') rmu ON true`;

const STORE_FIELDS = {
  store: { expr: `COALESCE(s.name, '(no store)')` },
  store_code: { expr: `COALESCE(s.code, '(no store)')` },
  region: { expr: `COALESCE(NULLIF(btrim(s.zone), ''), '(no region)')` },
  rm: { expr: `COALESCE(rmu.name, NULLIF(btrim(s."regionalManager"), ''), '(no RM)')`, lateral: RM_LATERAL },
};

const yesNo = (cond: string) => `CASE WHEN ${cond} THEN 'Yes' ELSE 'No' END`;

export const SQL: Record<string, DatasetSql> = {
  sales: {
    from: `"SaleLine" sl LEFT JOIN "Farmer" f ON f.id = sl."farmerId" LEFT JOIN "Store" s ON s.id = sl."storeId"`,
    where: [`sl.source = 'REAL'`],
    storeCol: `sl."storeId"`,
    date: `sl."soldAt"`,
    valueSegment: `f."valueSegment"`,
    lifecycle: `f."lifecycleSegment"`,
    fields: {
      sale_date: { expr: `sl."soldAt"` },
      ...STORE_FIELDS,
      crop: { expr: `COALESCE(sl."cropTag", '(no crop)')` },
      item: { expr: `sl."itemRaw"` },
      category: { expr: `COALESCE(NULLIF(btrim(sl."mainCategory"), ''), '(none)')` },
      coupon: { expr: `COALESCE(NULLIF(NULLIF(sl."couponCode", '0'), ''), NULLIF(NULLIF(sl."invoiceCouponCode", '0'), ''), '(no coupon)')` },
      value_segment: { expr: `COALESCE(f."valueSegment", '(none)')` },
      lifecycle: { expr: `COALESCE(f."lifecycleSegment", '(none)')` },
      village: { expr: `COALESCE(NULLIF(btrim(f.village), ''), '(no village)')` },
      farmer: { expr: `COALESCE(f.name, '(unknown)')` },
      basic: { expr: `COALESCE(sl.basic, 0)` },
      qty: { expr: `sl.qty` },
      total_gst: { expr: `sl."totalPrice"` },
    },
    measures: {
      sales_value: `COALESCE(SUM(sl.basic), 0)`,
      bills: `COUNT(DISTINCT sl."orderNo")`,
      buyers: `COUNT(DISTINCT sl."farmerId")`,
      avg_bill: `COALESCE(SUM(sl.basic), 0) / NULLIF(COUNT(DISTINCT sl."orderNo"), 0)`,
      lines: `COUNT(*)`,
    },
  },

  farmers: {
    from: `"Farmer" f LEFT JOIN "Store" s ON s.id = f."storeId"`,
    where: [`f.source = 'REAL'`],
    storeCol: `f."storeId"`,
    date: `f."createdAt"`,
    valueSegment: `f."valueSegment"`,
    lifecycle: `f."lifecycleSegment"`,
    fields: {
      ...STORE_FIELDS,
      value_segment: { expr: `COALESCE(f."valueSegment", '(none)')` },
      lifecycle: { expr: `COALESCE(f."lifecycleSegment", '(none)')` },
      crop: { expr: `COALESCE(fc.v, '(no crop)')`, lateral: `LEFT JOIN LATERAL unnest(f."cropTags") AS fc(v) ON true` },
      store_crop: { expr: `COALESCE(sc.v, '(none set)')`, lateral: `LEFT JOIN LATERAL unnest(s."cropTags") AS sc(v) ON true` },
      village: { expr: `COALESCE(NULLIF(btrim(f.village), ''), '(no village)')` },
      district: { expr: `COALESCE(NULLIF(btrim(f.district), ''), '(no district)')` },
      whatsapp: { expr: yesNo(`f."whatsappOptIn"`) },
      ghoshti: { expr: yesNo(`f."attendedGhoshti"`) },
      added: { expr: `f."createdAt"` },
      last_purchase: { expr: `f."lastPurchaseAt"` },
      ltv: { expr: `COALESCE(f."lifetimeSpend", 0)` },
      p12m: { expr: `COALESCE(f."p12mSpend", 0)` },
    },
    measures: {
      farmers: `COUNT(DISTINCT f.id)`,
      ltv_total: `COALESCE(SUM(f."lifetimeSpend"), 0)`,
      ltv_avg: `AVG(COALESCE(f."lifetimeSpend", 0))`,
      hni: `COUNT(DISTINCT f.id) FILTER (WHERE f."valueSegment" = 'HNI')`,
      opted_in: `COUNT(DISTINCT f.id) FILTER (WHERE f."whatsappOptIn")`,
      converted: `COUNT(DISTINCT f.id) FILTER (WHERE f."leadConvertedAt" IS NOT NULL)`,
    },
  },

  visits: {
    // Visits belong to their own store, else the farmer's store (same rule as visitScopeWhere).
    from: `"Visit" v JOIN "Farmer" f ON f.id = v."farmerId" AND f.source = 'REAL' LEFT JOIN "Store" s ON s.id = COALESCE(v."storeId", f."storeId")`,
    where: [],
    storeCol: `COALESCE(v."storeId", f."storeId")`,
    date: `COALESCE(v."visitedAt", v."createdAt")`,
    valueSegment: `f."valueSegment"`,
    lifecycle: `f."lifecycleSegment"`,
    fields: {
      visit_date: { expr: `COALESCE(v."visitedAt", v."createdAt")` },
      ...STORE_FIELDS,
      officer: { expr: `COALESCE(NULLIF(btrim(v."officerName"), ''), '(unknown)')` },
      purpose: { expr: `COALESCE(NULLIF(btrim(COALESCE(v.purpose, v.type)), ''), '(not set)')` },
      reviewed: { expr: `CASE WHEN v."reviewedAt" IS NOT NULL THEN 'Reviewed' ELSE 'Pending' END` },
      rating: { expr: `COALESCE(v."reviewRating"::text, '(not rated)')` },
      main_crop: { expr: `COALESCE(NULLIF(btrim(v."mainCrop"), ''), '(not set)')` },
      crop: { expr: `COALESCE(NULLIF(btrim(vc.v), ''), '(none)')`, lateral: `LEFT JOIN LATERAL unnest(v.crops) AS vc(v) ON true` },
      problem: { expr: `COALESCE(NULLIF(btrim(vp.v), ''), '(none)')`, lateral: `LEFT JOIN LATERAL unnest(v."currentProblem") AS vp(v) ON true` },
      pest: { expr: `COALESCE(NULLIF(btrim(vt.v), ''), '(none)')`, lateral: `LEFT JOIN LATERAL unnest(v.pests) AS vt(v) ON true` },
      mode: { expr: `COALESCE(v."visitMode", '(not set)')` },
      value_segment: { expr: `COALESCE(f."valueSegment", '(none)')` },
      lifecycle: { expr: `COALESCE(f."lifecycleSegment", '(none)')` },
      rating_num: { expr: `v."reviewRating"` },
    },
    measures: {
      visits: `COUNT(DISTINCT v.id)`,
      reviewed_pct: `100.0 * COUNT(DISTINCT v.id) FILTER (WHERE v."reviewedAt" IS NOT NULL) / NULLIF(COUNT(DISTINCT v.id), 0)`,
      pending: `COUNT(DISTINCT v.id) FILTER (WHERE v."reviewedAt" IS NULL)`,
      avg_rating: `AVG(v."reviewRating")`,
      farmers_visited: `COUNT(DISTINCT v."farmerId")`,
      flagged: `COUNT(DISTINCT v.id) FILTER (WHERE v."reviewFlagged")`,
    },
  },

  campaigns: {
    from: `"CampaignMember" cm JOIN "Campaign" c ON c.id = cm."campaignId" LEFT JOIN "Store" s ON s.id = cm."storeId"`,
    where: [],
    storeCol: `cm."storeId"`,
    date: `c."startDate"`,
    valueSegment: `cm."valueSegment"`,
    lifecycle: `cm."lifecycleSegment"`,
    fields: {
      campaign: { expr: `c.name` },
      status: { expr: `c.status` },
      group: { expr: `cm."group"` },
      reach_state: { expr: `CASE WHEN 'UNREACHABLE' = ANY(cm.mediums) THEN 'Unreachable' WHEN cm.reached THEN 'Reached' ELSE 'Not yet contacted' END` },
      response: { expr: `CASE cm.response WHEN 'INTERESTED' THEN 'Interested' WHEN 'NOT_INTERESTED' THEN 'Not interested' WHEN 'OTHER_CROP' THEN 'Wants another crop' ELSE '(no response)' END` },
      channel: { expr: `COALESCE(CASE ch.v WHEN 'CALL' THEN 'Call' WHEN 'WHATSAPP' THEN 'WhatsApp' WHEN 'SMS' THEN 'SMS' WHEN 'IN_PERSON' THEN 'In-person' WHEN 'UNREACHABLE' THEN 'Unreachable' ELSE ch.v END, '(not contacted)')`, lateral: `LEFT JOIN LATERAL unnest(cm.mediums) AS ch(v) ON true` },
      ...STORE_FIELDS,
      value_segment: { expr: `COALESCE(cm."valueSegment", '(none)')` },
      lifecycle: { expr: `COALESCE(cm."lifecycleSegment", '(none)')` },
      reached_by: { expr: `COALESCE(cm."reachedBy", '(nobody yet)')` },
      reached_date: { expr: `cm."reachedAt"` },
      start_date: { expr: `c."startDate"` },
    },
    measures: {
      members: `COUNT(DISTINCT cm.id)`,
      reached: `COUNT(DISTINCT cm.id) FILTER (WHERE cm.reached)`,
      reach_pct: `100.0 * COUNT(DISTINCT cm.id) FILTER (WHERE cm.reached) / NULLIF(COUNT(DISTINCT cm.id), 0)`,
      interested: `COUNT(DISTINCT cm.id) FILTER (WHERE cm.response = 'INTERESTED')`,
      unreachable: `COUNT(DISTINCT cm.id) FILTER (WHERE 'UNREACHABLE' = ANY(cm.mediums))`,
    },
  },

  actions: {
    from: `"Action" a LEFT JOIN "Store" s ON s.id = a."storeId"`,
    where: [],
    storeCol: `a."storeId"`,
    date: `a."dueDate"`,
    fields: {
      // :today is replaced with the shared start-of-today cutoff (a bound parameter) by the engine.
      state: { expr: `CASE WHEN a.status = 'DONE' THEN 'Done' WHEN a."dueDate" < :today THEN 'Overdue' ELSE 'Open' END` },
      reason: { expr: `COALESCE(NULLIF(btrim(a.reason), ''), '(no reason)')` },
      source: { expr: `CASE WHEN a."visitId" IS NULL THEN 'Manual' ELSE 'From a visit' END` },
      ...STORE_FIELDS,
      created_by: { expr: `COALESCE(a."createdByName", '(unknown)')` },
      due_date: { expr: `a."dueDate"` },
      completed_date: { expr: `a."completedAt"` },
    },
    measures: {
      actions: `COUNT(DISTINCT a.id)`,
      open: `COUNT(DISTINCT a.id) FILTER (WHERE a.status <> 'DONE')`,
      overdue: `COUNT(DISTINCT a.id) FILTER (WHERE a.status <> 'DONE' AND a."dueDate" < :today)`,
      done: `COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'DONE')`,
      done_pct: `100.0 * COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'DONE') / NULLIF(COUNT(DISTINCT a.id), 0)`,
    },
  },

  ghoshti: {
    from: `"Ghoshti" g LEFT JOIN "Store" s ON s.id = g."storeId" LEFT JOIN LATERAL (SELECT COUNT(*)::int n, (COUNT(*) FILTER (WHERE ga."isExisting"))::int e FROM "GhoshtiAttendee" ga WHERE ga."ghoshtiId" = g.id) gc ON true`,
    where: [],
    storeCol: `g."storeId"`,
    date: `g.date`,
    fields: {
      status: { expr: `CASE g.status WHEN 'APPROVED' THEN 'Approved' WHEN 'REJECTED' THEN 'Rejected' ELSE 'Pending approval' END` },
      ...STORE_FIELDS,
      organiser: { expr: `COALESCE(g."createdByName", '(unknown)')` },
      topic: { expr: `COALESCE(NULLIF(btrim(g.topic), ''), '(no topic)')` },
      meetup_date: { expr: `g.date` },
    },
    measures: {
      meetups: `COUNT(DISTINCT g.id)`,
      attendees: `COALESCE(SUM(gc.n), 0)`,
      existing: `COALESCE(SUM(gc.e), 0)`,
      new_people: `COALESCE(SUM(gc.n - gc.e), 0)`,
    },
  },

  stores: {
    from: `"Store" s LEFT JOIN LATERAL (SELECT COUNT(*)::int n FROM "Farmer" ff WHERE ff."storeId" = s.id AND ff.source = 'REAL') sf ON true`,
    where: [`s.source = 'REAL'`],
    storeCol: `s.id`,
    date: null,
    fields: {
      ...STORE_FIELDS,
      status: { expr: `COALESCE(s.status, '(unknown)')` },
      store_crop: { expr: `COALESCE(sc.v, '(none set)')`, lateral: `LEFT JOIN LATERAL unnest(s."cropTags") AS sc(v) ON true` },
    },
    measures: {
      stores: `COUNT(DISTINCT s.id)`,
      store_farmers: `COALESCE(SUM(sf.n), 0)`,
    },
  },
};
