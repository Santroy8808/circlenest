import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getListingViewPreference,
  isListingPreferenceSurface,
  isListingViewMode,
  setListingViewPreference
} from "@/modules/listing-preferences/listing-preferences.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const surface = request.nextUrl.searchParams.get("surface");

  if (!isListingPreferenceSurface(surface)) {
    return NextResponse.json({ error: "Invalid listing surface." }, { status: 400 });
  }

  const view = await getListingViewPreference(session.user.id, surface);

  return NextResponse.json({ surface, view });
}

export async function PUT(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json()) as { surface?: unknown; view?: unknown };

  if (!isListingPreferenceSurface(body.surface)) {
    return NextResponse.json({ error: "Invalid listing surface." }, { status: 400 });
  }

  if (!isListingViewMode(body.view)) {
    return NextResponse.json({ error: "Invalid listing view." }, { status: 400 });
  }

  await setListingViewPreference(session.user.id, body.surface, body.view);

  return NextResponse.json({ surface: body.surface, view: body.view });
}
