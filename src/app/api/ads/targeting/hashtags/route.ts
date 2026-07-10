import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/platform/db";
import { normalizeAdTargetHashtag } from "@/modules/ads-credits/types";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
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
