import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { getMailPreference, updateMailPreference } from "@/modules/mail/mail.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json({ preference: await getMailPreference(session.user.id) });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request, 8 * 1024);
  if (!body.ok) return body.response;
  const result = await updateMailPreference(session.user.id, body.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
