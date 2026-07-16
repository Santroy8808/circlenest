import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { normalizeAdTargetHashtag } from "@/modules/ads-credits/types";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const generalAccess = await canUserAccessFeature(session.user.id, "ads.createGeneral");
  const marketAdAccess = await canUserAccessFeature(session.user.id, "market.createAd");
  if (!isAdminRole(session.user.role) && !generalAccess.allowed && !marketAdAccess.allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeAdTargetHashtag(searchParams.get("q") ?? "");

  if (query.length < 2) {
    return NextResponse.json({ hashtags: [] });
  }

  const hashtags = await prisma.hashtag.findMany({
    where: {
      normalized: {
        contains: query,
        mode: "insensitive"
      }
    },
    orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
    select: {
      normalized: true,
      displayName: true
    },
    take: 12
  });

  return NextResponse.json({
    hashtags: hashtags.map((hashtag) => ({
      value: hashtag.normalized,
      label: `#${hashtag.displayName}`
    }))
  });
}
