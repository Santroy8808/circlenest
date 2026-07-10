import type { RequestContext } from "@/modules/auth-security/types";

type RequestWithHeaders = {
  headers: {
    get(name: string): string | null;
  };
};

function trustedProxyHops() {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 8) : 1;
}

function clientAddressFromForwardedFor(value: string | null) {
  const addresses = value
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .slice(-10);

  if (!addresses?.length) return undefined;

  // Work from the trusted edge inward so a client-supplied left-most value
  // cannot become the rate-limit/audit identity when the proxy appends to XFF.
  const index = Math.max(addresses.length - trustedProxyHops(), 0);
  return addresses[index]?.slice(0, 96);
}

export function getRequestContext(request: RequestWithHeaders): RequestContext {
  const ipAddress = clientAddressFromForwardedFor(request.headers.get("x-forwarded-for"));

  return {
    ipAddress,
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? undefined
  };
}
