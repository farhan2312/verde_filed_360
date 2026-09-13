import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Activity heartbeat. The client (components/shell/Heartbeat) pings this while the user has the app
 * open, so "Last active" reflects real usage rather than the (up-to-7-day-old) last sign-in time.
 * Throttled in SQL to at most one write per 30s per user, so rapid pings (mount + tab-focus) are cheap.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  try {
    await prisma.$executeRaw`
      UPDATE "User" SET "lastSeenAt" = now()
      WHERE id = ${session.userId}
        AND ("lastSeenAt" IS NULL OR "lastSeenAt" < now() - interval '30 seconds')`;
  } catch {
    // best-effort — never surface heartbeat failures to the user
  }
  return new NextResponse(null, { status: 204 });
}
