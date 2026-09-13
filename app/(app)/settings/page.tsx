import { prisma } from "@/lib/prisma";
import { zapConfig } from "@/lib/zapsms";
import { waConfig } from "@/lib/whatsapp";
import {
  SystemConfigCard,
  type ConfigState,
} from "@/components/settings/SystemConfigCard";
import { DataManagementCard } from "@/components/settings/DataManagementCard";
import { SmsTestCard } from "@/components/settings/SmsTestCard";
import { listOptIns, getOptInQrConfig, type OptInRow } from "@/app/actions/whatsapp-optins";
import { WhatsAppSettingsTab } from "@/components/settings/WhatsAppSettingsTab";
import { waTemplatesStatus, listTemplates, type WaTemplate } from "@/app/actions/whatsapp-templates";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { StoreTagsCard } from "@/components/settings/StoreTagsCard";
import { listStoreTags, type StoreTagVM } from "@/app/actions/store-tags";
import { countVars } from "@/lib/wa-template-presets";

export const dynamic = "force-dynamic";

type LoadResult = {
  config: ConfigState;
  districtOptions: string[];
};

const EMPTY: LoadResult = {
  config: {
    primaryIdLabel: "Mobile Number",
    visitReasonRequired: true,
    requireGPS: true,
    defaultDistrict: "Agra",
  },
  districtOptions: ["Agra"],
};

async function load(): Promise<LoadResult> {
  try {
    const [districtRows, settingRows] = await Promise.all([
      prisma.store.findMany({
        where: { zone: { not: null } },
        distinct: ["zone"],
        select: { zone: true },
        orderBy: { zone: "asc" },
      }),
      prisma.setting.findMany({
        where: {
          key: {
            in: [
              "config.primaryIdLabel",
              "config.visitReasonRequired",
              "config.requireGPS",
              "config.defaultDistrict",
            ],
          },
        },
      }),
    ]);

    const districts = districtRows
      .map((r) => r.zone)
      .filter((z): z is string => Boolean(z));

    const settingMap = new Map(settingRows.map((s) => [s.key, s.value]));
    const get = (k: string, fallback: string) => settingMap.get(k) ?? fallback;

    return {
      config: {
        primaryIdLabel: get("config.primaryIdLabel", EMPTY.config.primaryIdLabel),
        visitReasonRequired: get("config.visitReasonRequired", "true") === "true",
        requireGPS: get("config.requireGPS", "true") === "true",
        defaultDistrict: get("config.defaultDistrict", EMPTY.config.defaultDistrict),
      },
      districtOptions: districts.length ? districts : EMPTY.districtOptions,
    };
  } catch {
    return EMPTY;
  }
}

export default async function SettingsPage() {
  const { config, districtOptions } = await load();

  // Test-messaging bench: gateway status only (SMS templates + WA templates are fetched client-side).
  const sms = zapConfig();
  const wa = waConfig();

  let optIns: { total: number; rows: OptInRow[] } = { total: 0, rows: [] };
  let optInCfg = { number: "", message: "" };
  try {
    optIns = await listOptIns();
    const cfg = await getOptInQrConfig();
    optInCfg = { number: cfg.number, message: cfg.message };
  } catch { /* DB unavailable */ }

  let storeTags: StoreTagVM[] = [];
  try { storeTags = await listStoreTags(); } catch { /* DB unavailable */ }

  // WhatsApp template manager (create/submit/track approval via the Business Management API).
  let tplInit: { ready: boolean; missing: string[]; templates: WaTemplate[] } = { ready: false, missing: [], templates: [] };
  try {
    const st = await waTemplatesStatus();
    let templates: WaTemplate[] = [];
    if (st.ready) { const l = await listTemplates(); if (l.ok && l.templates) templates = l.templates; }
    tplInit = { ready: st.ready, missing: st.missing, templates };
  } catch { /* gateway unreachable */ }

  return (
    <SettingsTabs
      tabs={[
        {
          key: "general",
          label: "General",
          icon: "⚙",
          content: (
            <div className="mx-auto flex max-w-3xl flex-col gap-[18px]">
              <SystemConfigCard initial={config} districtOptions={districtOptions} />
              <DataManagementCard />
            </div>
          ),
        },
        {
          key: "sms",
          label: "SMS",
          icon: "✉",
          content: (
            <div className="mx-auto flex max-w-3xl flex-col gap-[18px]">
              <SmsTestCard only="sms" smsReady={sms.ready} missing={sms.missing} senderId={sms.cfg.senderId} waReady={wa.ready} waMissing={wa.missing} />
            </div>
          ),
        },
        {
          key: "whatsapp",
          label: "WhatsApp",
          icon: "⚡",
          content: (
            <WhatsAppSettingsTab
              sms={{ smsReady: sms.ready, missing: sms.missing, senderId: sms.cfg.senderId, waReady: wa.ready, waMissing: wa.missing,
                waTemplates: tplInit.templates.filter((t) => t.status === "APPROVED").map((t) => ({ name: t.name, language: t.language, body: t.body, varCount: countVars(t.body) })) }}
              templates={tplInit}
              optIns={{ initial: optIns, qrConfig: optInCfg }}
            />
          ),
        },
        {
          key: "store-tags",
          label: "Store Tags",
          icon: "🏷",
          content: (
            <div className="mx-auto max-w-3xl">
              <StoreTagsCard initial={storeTags} />
            </div>
          ),
        },
      ]}
    />
  );
}
