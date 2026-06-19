import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createJobListing, listJobListings } from "@/modules/jobs/jobs.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const listings = await listJobListings({
    query: request.nextUrl.searchParams.get("q"),
    category: request.nextUrl.searchParams.get("category")
  });

  return NextResponse.json({ listings });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createJobListing(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ job: result.job }, { status: 201 });
}
