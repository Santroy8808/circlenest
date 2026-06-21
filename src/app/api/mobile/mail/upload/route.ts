import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { completeMailUpload, createMailUploadIntent } from "@/modules/mail/mail.service";

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body.action ?? "intent";
  const result =
    action === "complete"
      ? await completeMailUpload(session.user.id, body)
      : await createMailUploadIntent(session.user.id, body);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
