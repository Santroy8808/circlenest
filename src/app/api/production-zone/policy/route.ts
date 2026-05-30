import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveProductionZoneAccess } from "@/lib/policy/production-zone";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true },
  });
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  const access = resolveProductionZoneAccess(user?.subscriptionTier, isInvitedCreator);

  return NextResponse.json({
    ...access,
    isInvitedCreator,
    subscriptionTier: user?.subscriptionTier ?? "FREE",
  });
}

