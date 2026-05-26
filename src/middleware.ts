import { NextRequest, NextResponse } from "next/server";
import { featureFlags } from "@/lib/config/flags";

const protectedPrefixes = [
  "/home",
  "/profile/edit",
  "/settings/theme",
  "/friends",
  "/messages",
  "/groups",
  "/notifications",
];

export default function middleware(req: NextRequest) {
  if (!featureFlags.rebuildCore && req.nextUrl.pathname.startsWith("/home")) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  if (!featureFlags.rebuildGroups && req.nextUrl.pathname.startsWith("/groups")) {
    return NextResponse.redirect(new URL("/home", req.nextUrl));
  }
  if (!featureFlags.rebuildMessaging && req.nextUrl.pathname.startsWith("/messages")) {
    return NextResponse.redirect(new URL("/home", req.nextUrl));
  }
  if (!featureFlags.rebuildNotifications && req.nextUrl.pathname.startsWith("/notifications")) {
    return NextResponse.redirect(new URL("/home", req.nextUrl));
  }

  const isProtected = protectedPrefixes.some((prefix) => req.nextUrl.pathname.startsWith(prefix));
  const hasSession =
    Boolean(req.cookies.get("authjs.session-token")?.value) ||
    Boolean(req.cookies.get("__Secure-authjs.session-token")?.value);

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
