import { handlers } from "@/auth";
import type { NextRequest } from "next/server";

const DESKTOP_GATE_COOKIE = "theta_desktop_gate";
const DEVICE_TOKEN_COOKIE = "theta_device_token";
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function hasDeviceTokenCookie(request: NextRequest) {
  return Boolean(request.cookies.get(DEVICE_TOKEN_COOKIE)?.value);
}

function stripCookieLifetime(cookie: string) {
  return cookie
    .split(";")
    .filter((part, index) => {
      if (index === 0) return true;
      const normalized = part.trim().toLowerCase();
      return !normalized.startsWith("expires=") && !normalized.startsWith("max-age=");
    })
    .join("; ");
}

function rewriteSetCookies(request: NextRequest, response: Response) {
  if (hasDeviceTokenCookie(request)) {
    return response;
  }

  const headers = new Headers(response.headers);
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function"
    ? getSetCookie.call(response.headers)
    : headers.get("set-cookie")
      ? [headers.get("set-cookie") as string]
      : [];

  if (!setCookies.length) {
    return response;
  }

  headers.delete("set-cookie");
  let wroteSessionCookie = false;
  for (const cookie of setCookies) {
    const lower = cookie.toLowerCase();
    const isSessionCookie = SESSION_COOKIE_NAMES.some((name) => lower.startsWith(`${name.toLowerCase()}=`));
    if (isSessionCookie && !lower.includes("max-age=0")) wroteSessionCookie = true;
    const nextCookie = isSessionCookie ? stripCookieLifetime(cookie) : cookie;
    headers.append("set-cookie", nextCookie);
  }

  if (wroteSessionCookie) {
    headers.append("set-cookie", `${DESKTOP_GATE_COOKIE}=1; Path=/; SameSite=Lax`);
  }

  if (request.nextUrl.pathname.endsWith("/signout")) {
    headers.append("set-cookie", `${DESKTOP_GATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request: NextRequest) {
  return rewriteSetCookies(request, await handlers.GET(request));
}

export async function POST(request: NextRequest) {
  return rewriteSetCookies(request, await handlers.POST(request));
}
