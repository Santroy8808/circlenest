import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { createJobListing, listJobListings } from "@/modules/jobs/jobs.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  if (!(await canUserAccessFeature(session.user.id, "jobs.browse")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
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

  if (!(await canUserAccessFeature(session.user.id, "jobs.createListing")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const body = await request.json();
  const result = await createJobListing(actor.actorUserId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ job: result.job }, { status: 201 });
}
