import type { NextRequest } from "next/server";
import type { RequestContext } from "@/modules/auth-security/types";

export function getRequestContext(request: NextRequest): RequestContext {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? undefined;

  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined
  };
}
