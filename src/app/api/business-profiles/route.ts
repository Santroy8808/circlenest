import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isAdminUser } from "@/lib/auth/admin";
import { canCreateBusinessProfile, resolveBusinessProfileAccess } from "@/lib/policy/production-zone";
import { serializeBusinessProfile, serializeBusinessProfiles } from "@/lib/business/business-profile";
import { ensureUniqueStorefrontSlug } from "@/lib/business/storefront";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true, username: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  const access = resolveBusinessProfileAccess(user?.subscriptionTier, isInvitedCreator);
  const canCreate = isAdmin || canCreateBusinessProfile(user?.subscriptionTier, isInvitedCreator);

  const [ownProfile, publicProfiles] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { ownerId: session.user.id },
      include: { owner: { select: { id: true, username: true, fullName: true } } },
    }),
    prisma.businessProfile.findMany({
      where: { isPublic: true, NOT: { ownerId: session.user.id } },
      include: { owner: { select: { id: true, username: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    access: {
      ...access,
      canCreate,
    },
    ownProfile: ownProfile ? serializeBusinessProfile(ownProfile) : null,
    publicProfiles: serializeBusinessProfiles(publicProfiles),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true, username: true },
  });
  const isAdmin = await isAdminUser(session.user.id);
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  if (!isAdmin && !canCreateBusinessProfile(user?.subscriptionTier, isInvitedCreator)) {
    return NextResponse.json({ error: "Biz is required to create a business profile." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    businessName?: string;
    tagline?: string | null;
    description?: string | null;
    websiteUrl?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    category?: string | null;
    location?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    isPublic?: boolean;
    storefrontSlug?: string | null;
    storefrontEnabled?: boolean;
  };

  const businessName = String(body.businessName ?? "").trim();
  if (!businessName) return NextResponse.json({ error: "Business name is required." }, { status: 400 });

  const existingProfile = await prisma.businessProfile.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, storefrontSlug: true, storefrontEnabled: true },
  });
  const requestedStorefrontSlug = String(body.storefrontSlug ?? existingProfile?.storefrontSlug ?? businessName ?? user?.username ?? "").trim();
  const storefrontSlug = await ensureUniqueStorefrontSlug(
    requestedStorefrontSlug || user?.username || "storefront",
    async (slug) => Boolean(await prisma.businessProfile.findFirst({
      where: {
        storefrontSlug: slug,
        ...(existingProfile?.id ? { NOT: { id: existingProfile.id } } : {}),
      },
      select: { id: true },
    })),
  );
  const storefrontEnabled = body.storefrontEnabled ?? existingProfile?.storefrontEnabled ?? false;

  const profile = await prisma.businessProfile.upsert({
    where: { ownerId: session.user.id },
    create: {
      ownerId: session.user.id,
      businessName,
      tagline: String(body.tagline ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      websiteUrl: String(body.websiteUrl ?? "").trim() || null,
      contactEmail: String(body.contactEmail ?? "").trim() || null,
      contactPhone: String(body.contactPhone ?? "").trim() || null,
      category: String(body.category ?? "").trim() || null,
      location: String(body.location ?? "").trim() || null,
      country: String(body.country ?? "").trim() || null,
      state: String(body.state ?? "").trim() || null,
      city: String(body.city ?? "").trim() || null,
      isPublic: body.isPublic ?? true,
      storefrontSlug,
      storefrontEnabled,
    },
    update: {
      businessName,
      tagline: String(body.tagline ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      websiteUrl: String(body.websiteUrl ?? "").trim() || null,
      contactEmail: String(body.contactEmail ?? "").trim() || null,
      contactPhone: String(body.contactPhone ?? "").trim() || null,
      category: String(body.category ?? "").trim() || null,
      location: String(body.location ?? "").trim() || null,
      country: String(body.country ?? "").trim() || null,
      state: String(body.state ?? "").trim() || null,
      city: String(body.city ?? "").trim() || null,
      isPublic: body.isPublic ?? true,
      storefrontSlug,
      storefrontEnabled,
    },
    include: { owner: { select: { id: true, username: true, fullName: true } } },
  });

  return NextResponse.json({ ok: true, profile: serializeBusinessProfile(profile) });
}
