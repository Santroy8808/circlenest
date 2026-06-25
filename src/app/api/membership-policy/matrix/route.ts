import { NextResponse } from "next/server";
import { getPublicPolicyMatrix } from "@/modules/membership-policy/membership-policy.service";

export function GET() {
  return NextResponse.json({ policies: getPublicPolicyMatrix() });
}
