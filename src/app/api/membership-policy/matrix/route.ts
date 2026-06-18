import { NextResponse } from "next/server";
import { getPolicyMatrix } from "@/modules/membership-policy/membership-policy.service";

export function GET() {
  return NextResponse.json({ policies: getPolicyMatrix() });
}
