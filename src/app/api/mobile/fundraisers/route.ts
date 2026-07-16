import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createFundraiser,
  getFundraiserCreateState,
  safeGetFundraiserDetail,
  safeListFundraisers
} from "@/modules/fundraisers-funds/fundraisers-funds.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "fundraisers.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (campaignId) {
    const result = await safeGetFundraiserDetail(session.user.id, campaignId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ campaign: result.campaign });
  }

  return NextResponse.json({
    campaigns: await safeListFundraisers({ category: request.nextUrl.searchParams.get("category") }),
    createState: await getFundraiserCreateState(session.user.id)
  });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "fundraisers.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const result = await createFundraiser(session.user.id, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ campaign: result.campaign }, { status: 201 });
}
