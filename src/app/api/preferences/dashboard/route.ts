import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getDashboardSettings,
  resetDashboardConfiguration,
  saveDashboardConfiguration
} from "@/modules/dashboard/dashboard.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });

  return NextResponse.json(await getDashboardSettings(session.user.id));
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = await saveDashboardConfiguration(session.user.id, body.configuration);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });

  return NextResponse.json(await resetDashboardConfiguration(session.user.id));
}
