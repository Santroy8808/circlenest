import { NextResponse } from "next/server";
import { clearAdminModeCookie } from "@/lib/security/admin-mode";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearAdminModeCookie());
  return response;
}
