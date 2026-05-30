import { NextResponse } from "next/server";
import { clearSecureAreaCookie } from "@/lib/security/secure-area";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearSecureAreaCookie());
  return response;
}
