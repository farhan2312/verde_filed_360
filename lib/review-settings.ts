import { prisma } from "@/lib/prisma";

/**
 * Visit Review & weekly-report settings (Settings → "Reviews & Reports"), stored as `Setting` rows.
 * All times are IST. Days are 0=Sunday … 6=Saturday (JS getDay order).
 */
export const REVIEW_SLA_KEY = "review.slaHours";
export const DEFAULT_SLA_HOURS = 48;

export const REVIEW_SETTING_KEYS = {
  slaHours: REVIEW_SLA_KEY,
  weekStartDay: "report.weekStartDay", // first day of the reporting week (default Monday)
  reportDay: "report.sendDay", // when the weekly report runs (default Monday)
  reportHour: "report.sendHour", // … at this IST hour (default 08:00)
  digestHour: "digest.hour", // RM daily pending digest + Central SLA alert, IST hour (default 09:00)
  emailEnabled: "email.enabled", // master switch for scheduled/automatic email (default OFF)
} as const;

export interface ReviewSettings {
  slaHours: number;
  weekStartDay: number;
  reportDay: number;
  reportHour: number;
  digestHour: number;
  emailEnabled: boolean;
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  slaHours: DEFAULT_SLA_HOURS,
  weekStartDay: 1,
  reportDay: 1,
  reportHour: 8,
  digestHour: 9,
  emailEnabled: false, // email stays off until an admin has sent a successful test and switches it on
};

const intIn = (v: string | undefined, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
};

export async function getReviewSettings(): Promise<ReviewSettings> {
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(REVIEW_SETTING_KEYS) } } });
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const d = DEFAULT_REVIEW_SETTINGS;
    return {
      slaHours: intIn(m.get(REVIEW_SETTING_KEYS.slaHours), 1, 24 * 30, d.slaHours),
      weekStartDay: intIn(m.get(REVIEW_SETTING_KEYS.weekStartDay), 0, 6, d.weekStartDay),
      reportDay: intIn(m.get(REVIEW_SETTING_KEYS.reportDay), 0, 6, d.reportDay),
      reportHour: intIn(m.get(REVIEW_SETTING_KEYS.reportHour), 0, 23, d.reportHour),
      digestHour: intIn(m.get(REVIEW_SETTING_KEYS.digestHour), 0, 23, d.digestHour),
      emailEnabled: m.get(REVIEW_SETTING_KEYS.emailEnabled) === "true",
    };
  } catch {
    return DEFAULT_REVIEW_SETTINGS;
  }
}

export async function getReviewSlaHours(): Promise<number> {
  return (await getReviewSettings()).slaHours;
}
