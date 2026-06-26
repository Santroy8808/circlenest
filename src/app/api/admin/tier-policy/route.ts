import { MembershipTier } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGodTierPolicyEditorView, setGlobalTierFeatureOverride } from "@/modules/membership-policy/membership-policy.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const view = await getGodTierPolicyEditorView(session.user.id);

  if (!view.canManage) {
    return NextResponse.json({ error: "God access required." }, { status: 403 });
  }

  return NextResponse.json(view);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const tier = typeof body?.tier === "string" && body.tier in MembershipTier ? (body.tier as MembershipTier) : null;
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey : "";
  const allowed = typeof body?.allowed === "boolean" ? body.allowed : null;
  const password = typeof body?.password === "string" ? body.password : "";
  const reason = typeof body?.reason === "string" ? body.reason : undefined;

  if (!tier || allowed === null || !featureKey || !password) {
    return NextResponse.json({ error: "Tier, feature, target state, and password are required." }, { status: 400 });
  }

  const result = await setGlobalTierFeatureOverride({
    actorUserId: session.user.id,
    tier,
    featureKey,
    allowed,
    password,
    reason
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
