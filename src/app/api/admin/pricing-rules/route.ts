import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { listPlatformCostRules, updatePlatformCostRule } from "@/modules/platform-pricing/platform-pricing.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  if (!(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const rules = await listPlatformCostRules();

  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await updatePlatformCostRule(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ rule: result.rule });
}
