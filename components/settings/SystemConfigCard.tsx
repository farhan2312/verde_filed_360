"use client";

import { useState, useTransition } from "react";
import { Toggle } from "@/components/interactive";
import { CaretUpDown } from "@/components/icons";
import { updateSettingAction, type ConfigKey } from "@/app/actions/settings";

export type ConfigState = {
  primaryIdLabel: string;
  visitReasonRequired: boolean;
  requireGPS: boolean;
  defaultDistrict: string;
};

const PRIMARY_ID_OPTIONS = ["Mobile Number", "Aadhaar Number", "Farmer Code", "Voter ID"];

function ConfigSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const opts = options.includes(value) ? options : [value, ...options];
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-[8px] border border-line bg-white py-1.5 pl-3 pr-7 text-[12px] font-semibold text-ink disabled:opacity-50"
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <CaretUpDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}

export function SystemConfigCard({
  initial,
  districtOptions,
}: {
  initial: ConfigState;
  districtOptions: string[];
}) {
  const [config, setConfig] = useState<ConfigState>(initial);
  const [, startTransition] = useTransition();

  function save(key: ConfigKey, value: string) {
    startTransition(() => {
      void updateSettingAction(key, value);
    });
  }

  function setSelect(field: "primaryIdLabel" | "defaultDistrict", key: ConfigKey, value: string) {
    setConfig((c) => ({ ...c, [field]: value }));
    save(key, value);
  }

  function setBool(field: "visitReasonRequired" | "requireGPS", key: ConfigKey, value: boolean) {
    setConfig((c) => ({ ...c, [field]: value }));
    save(key, value ? "true" : "false");
  }

  return (
    <div className="rounded-[14px] border border-black/[0.03] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-4 text-base font-bold text-ink">System Configuration</div>
      <div className="flex flex-col gap-3.5">
        {/* Primary identifier (select) */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink">Primary Identifier</div>
            <div className="text-[11px] text-neutral-400">How farmers are uniquely keyed</div>
          </div>
          <ConfigSelect
            value={config.primaryIdLabel}
            options={PRIMARY_ID_OPTIONS}
            onChange={(v) => setSelect("primaryIdLabel", "config.primaryIdLabel", v)}
          />
        </div>

        {/* Visit reason required (toggle) */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink">Visit Reason Required</div>
            <div className="text-[11px] text-neutral-400">Mandate a reason on each visit</div>
          </div>
          <Toggle
            checked={config.visitReasonRequired}
            onChange={(v) => setBool("visitReasonRequired", "config.visitReasonRequired", v)}
          />
        </div>

        {/* GPS mandatory (toggle) */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink">GPS Mandatory</div>
            <div className="text-[11px] text-neutral-400">Require location for each visit</div>
          </div>
          <Toggle
            checked={config.requireGPS}
            onChange={(v) => setBool("requireGPS", "config.requireGPS", v)}
          />
        </div>

        {/* Default district (select) */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink">Default District</div>
            <div className="text-[11px] text-neutral-400">Pre-filled on new farmer / visit</div>
          </div>
          <ConfigSelect
            value={config.defaultDistrict}
            options={districtOptions}
            onChange={(v) => setSelect("defaultDistrict", "config.defaultDistrict", v)}
          />
        </div>
      </div>
    </div>
  );
}
