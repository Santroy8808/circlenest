import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      city: true,
      state: true,
      country: true,
      subscriptionTier: true,
      role: true,
      acceptedTermsVersion: true,
      acceptedTermsAt: true,
      createdAt: true,
      updatedAt: true,
      profile: { select: { displayName: true, bio: true, interests: true } },
      posts: { select: { id: true, content: true, createdAt: true } },
      comments: { select: { id: true, content: true, createdAt: true } },
      messages: { select: { id: true, body: true, createdAt: true } },
      groupMemberships: { select: { groupId: true, role: true, createdAt: true } },
      bazaarListings: { select: { id: true, title: true, createdAt: true } },
      alerts: { select: { id: true, type: true, createdAt: true } },
      notifications: { select: { id: true, type: true, createdAt: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.authSecurityEvent.create({
    data: {
      userId: session.user.id,
      eventType: "ACCOUNT_EXPORT_REQUESTED",
      metadata: JSON.stringify({ exportedAt: new Date().toISOString(), path: request.url }),
    },
  });

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user,
  });
}
