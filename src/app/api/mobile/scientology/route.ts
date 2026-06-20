import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  getScientologyProfileForOwner,
  updateScientologyProfile
} from "@/modules/my-scientology/my-scientology.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  return NextResponse.json({ scientology: await getScientologyProfileForOwner(session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const result = await updateScientologyProfile(session.user.id, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ scientology: result.profile });
}
