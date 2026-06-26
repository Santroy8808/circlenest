import { NextResponse } from "next/server";
import { getEffectivePublicPolicyMatrix } from "@/modules/membership-policy/membership-policy.service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ policies: await getEffectivePublicPolicyMatrix() });
}
