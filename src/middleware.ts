import { NextResponse, type NextRequest } from "next/server";

const MAX_API_BODY_BYTES = 64 * 1024 * 1024;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(request: NextRequest) {
  const origins = new Set([request.nextUrl.origin]);
  for (const candidate of [process.env.APP_ORIGIN, process.env.NEXTAUTH_URL]) {
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      // Production environment validation reports malformed canonical origins.
    }
  }
  return origins;
}

function rejectUnsafeCrossOriginRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || !UNSAFE_METHODS.has(request.method)) return null;

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_API_BODY_BYTES) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413, headers: { "cache-control": "no-store" } }
    );
  }

  const originExempt =
    request.nextUrl.pathname.startsWith("/api/mobile/") ||
    request.nextUrl.pathname === "/api/billing/stripe/webhook";
  if (originExempt) return null;

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  const hasAllowedOrigin = origin ? allowedOrigins(request).has(origin) : true;
  if (!hasAllowedOrigin || fetchSite === "cross-site") {
    return NextResponse.json(
      { error: "Cross-origin request denied." },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  return null;
}

export function middleware(request: NextRequest) {
  const rejected = rejectUnsafeCrossOriginRequest(request);
  if (rejected) return rejected;

  const headers = new Headers(request.headers);
  headers.set("x-current-path", request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
