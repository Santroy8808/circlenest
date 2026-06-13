import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import { canCreateBusinessProfile } from "@/lib/policy/production-zone";
import { serializeBusinessProfile } from "@/lib/business/business-profile";
import { ensureUniqueStorefrontSlug, normalizeStorefrontSlug } from "@/lib/business/storefront";

async function updateStorefrontSettings(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true, username: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  if (!isAdmin && !canCreateBusinessProfile(user?.subscriptionTier, isInvitedCreator)) {
    return NextResponse.json({ error: "Biz is required to publish a storefront." }, { status: 403 });
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, businessName: true, storefrontSlug: true, storefrontEnabled: true },
  });
  if (!profile) return NextResponse.json({ error: "Create a business profile first." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    storefrontSlug?: string | null;
    storefrontEnabled?: boolean;
  };

  const requestedSlug = String(body.storefrontSlug ?? profile.storefrontSlug ?? profile.businessName ?? user?.username ?? "").trim();
  const storefrontSlug = await ensureUniqueStorefrontSlug(
    requestedSlug || user?.username || "storefront",
    async (slug) => Boolean(await prisma.businessProfile.findFirst({
      where: {
        storefrontSlug: slug,
        NOT: { id: profile.id },
      },
      select: { id: true },
    })),
  );
  const storefrontEnabled = body.storefrontEnabled ?? profile.storefrontEnabled;

  const updated = await prisma.businessProfile.update({
    where: { ownerId: session.user.id },
    data: {
      storefrontSlug,
      storefrontEnabled,
    },
    include: { owner: { select: { id: true, username: true, fullName: true } } },
  });

  return NextResponse.json({
    ok: true,
    profile: serializeBusinessProfile(updated),
    publicPath: `/storefront/${normalizeStorefrontSlug(storefrontSlug)}`,
  });
}

export async function POST(request: Request) {
  return updateStorefrontSettings(request);
}

export async function PATCH(request: Request) {
  return updateStorefrontSettings(request);
}
