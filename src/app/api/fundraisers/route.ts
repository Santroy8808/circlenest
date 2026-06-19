import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createFundraiser, listFundraisers } from "@/modules/fundraisers-funds/fundraisers-funds.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const fundraisers = await listFundraisers({
    category: request.nextUrl.searchParams.get("category")
  });

  return NextResponse.json({ fundraisers });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createFundraiser(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ campaign: result.campaign }, { status: 201 });
}
