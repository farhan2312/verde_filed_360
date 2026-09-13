import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

const PUBLIC_PATHS = new Set(["/login", "/register"]);
const CHANGE_PW = "/change-password";

// Public API endpoints that external services (e.g. the Meta WhatsApp webhook) call without a session.
const PUBLIC_PREFIXES = ["/api/whatsapp/webhook"];

// Campaigners (part-time call team) are locked to the Campaigns page + the Training help + the forced
// password change. Every other route redirects them to Campaigns.
const CAMPAIGNER_ALLOWED = ["/campaigns", "/training", CHANGE_PW];
const landingFor = (roleKey: string) => (roleKey === "campaigner" ? "/campaigns" : "/analytics");
const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const isPublic = PUBLIC_PATHS.has(pathname);

  // Activity heartbeat — reachable by any signed-in user (incl. campaigners), never redirected.
  if (pathname === "/api/heartbeat") {
    return session ? NextResponse.next() : new NextResponse(null, { status: 401 });
  }

  // Not signed in and requesting a protected page → send to login.
  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in but on an auth page → send to the app (role-aware landing).
  if (session && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = session.mustChangePassword ? CHANGE_PW : landingFor(session.roleKey);
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in and must reset password → force the change-password page.
  if (session && session.mustChangePassword && pathname !== CHANGE_PW) {
    const url = req.nextUrl.clone();
    url.pathname = CHANGE_PW;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Campaigner lockdown — only the Campaigns page, Training help, and change-password are reachable;
  // anything else (including "/" and /analytics) redirects to Campaigns.
  if (session && session.roleKey === "campaigner" && !CAMPAIGNER_ALLOWED.some((p) => isUnder(pathname, p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/campaigns";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
