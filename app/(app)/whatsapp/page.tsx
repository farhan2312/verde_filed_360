import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { listConversations } from "@/app/actions/whatsapp-inbox";
import { WhatsAppInbox } from "@/components/whatsapp/WhatsAppInbox";

export const dynamic = "force-dynamic";

export default async function WhatsAppInboxPage() {
  // Sysadmin-only: enforce at the route level, not just the nav link.
  if ((await getRole()) !== "sysadmin") notFound();
  const initial = await listConversations("all", "");
  return <WhatsAppInbox initial={initial} />;
}
