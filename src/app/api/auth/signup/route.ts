import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/platform/request-context";
import { createMemberAccount } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await createMemberAccount(body, {
    preverified: process.env.AUTH_SIGNUP_PREVERIFIED === "true",
    context: getRequestContext(request)
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ user: result.user }, { status: 201 });
}
