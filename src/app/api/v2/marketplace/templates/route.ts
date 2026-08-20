import { NextResponse } from "next/server";

import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";
import { requireMarketplaceRollout } from "../_shared";

export async function GET() {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  return NextResponse.json({ templates: MARKETPLACE_TEMPLATES });
}
