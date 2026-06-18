import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/platform/request-context";
import { verifyEmailToken } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await verifyEmailToken(body, getRequestContext(request));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
