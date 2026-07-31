import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getDefaultHomeSettings,
  setDefaultHomePreference
} from "@/modules/home-preferences/default-home-preferences.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json(await getDefaultHomeSettings(session.user.id));
}

export async function PUT(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await setDefaultHomePreference(session.user.id, body.defaultHome);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    options: result.options,
    selected: result.selected
  });
}
