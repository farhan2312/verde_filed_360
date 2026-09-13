import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isIsoDate, runSalesSync, todayIst } from "@/lib/sales-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** On-demand ERP sales sync (sysadmin) — body { from, to } as YYYY-MM-DD. Progress is polled separately. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  let from = "", to = "";
  try { ({ from = "", to = "" } = await req.json()); } catch { /* fallthrough → validation error */ }
  if (!isIsoDate(from) || !isIsoDate(to)) return NextResponse.json({ error: "Pick a valid date range." }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "'From' must be on or before 'To'." }, { status: 400 });
  if (to > todayIst()) return NextResponse.json({ error: "'To' cannot be in the future." }, { status: 400 });

  try {
    const res = await runSalesSync({ from, to, trigger: "MANUAL", actor: session.name || "Admin" });
    return NextResponse.json({ ok: res.status === "SUCCESS", ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed." }, { status: 409 });
  }
}
