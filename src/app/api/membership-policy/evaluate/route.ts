import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json()) as { featureKey?: string };

  if (!body.featureKey) {
    return NextResponse.json({ error: "featureKey is required." }, { status: 400 });
  }

  const result = await canUserAccessFeature(session.user.id, body.featureKey);
  return NextResponse.json(result);
}
