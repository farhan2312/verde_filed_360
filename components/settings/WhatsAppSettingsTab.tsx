"use client";

import { useState, type ComponentProps } from "react";
import { SmsTestCard } from "./SmsTestCard";
import { WhatsAppTemplatesCard } from "./WhatsAppTemplatesCard";
import { WhatsAppOptInsCard } from "./WhatsAppOptInsCard";
import { WaDeliveryStatus } from "./WaDeliveryStatus";

/**
 * WhatsApp settings tab: test bench + templates + opt-ins on the left, with the delivery-status panel
 * pinned to the right (visible without scrolling). A send in the test bench bumps `signal` so the
 * status panel refreshes.
 */
export function WhatsAppSettingsTab({ sms, templates, optIns }: {
  sms: Omit<ComponentProps<typeof SmsTestCard>, "only" | "onSent">;
  templates: ComponentProps<typeof WhatsAppTemplatesCard>["initial"];
  optIns: ComponentProps<typeof WhatsAppOptInsCard>;
}) {
  const [signal, setSignal] = useState(0);
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-[18px] lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-[18px]">
        <SmsTestCard only="whatsapp" onSent={() => setSignal((s) => s + 1)} {...sms} />
        <WhatsAppTemplatesCard initial={templates} />
        <WhatsAppOptInsCard {...optIns} />
      </div>
      <div className="min-w-0">
        <WaDeliveryStatus signal={signal} />
      </div>
    </div>
  );
}
