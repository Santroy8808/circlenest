export function getPublicBaseUrl(request: Request): string {
  // Prefer explicit configuration (best for prod).
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Fall back to the incoming request headers (works well on Railway/most proxies).
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();
  const proto = forwardedProto || "http";

  if (host) return `${proto}://${host}`;

  // Last resort.
  return "http://localhost:3000";
}

