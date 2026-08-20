import { NextRequest, NextResponse } from "next/server";

import { uploadIntentFailureResponse } from "@/lib/platform/upload-intent-response";
import { createMarketPhotoUploadIntent } from "@/modules/market/market.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceSessionUser, requireMarketplaceRollout } from "../../_shared";

export async function POST(request: NextRequest) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  const result = await createMarketPhotoUploadIntent(user.id, body.value);
  return result.ok
    ? NextResponse.json(result, { headers: { "cache-control": "no-store" } })
    : uploadIntentFailureResponse(result);
}
