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
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        complianceProfile: {
          select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
        },
      },
    }),
    prisma.businessProfile.findMany({
      where: { isPublic: true, NOT: { ownerId: session.user.id } },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        complianceProfile: {
          select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
        },
      },
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
    legalBusinessName?: string | null;
    dbaName?: string | null;
    entityType?: string | null;
    industry?: string | null;
    tagline?: string | null;
    description?: string | null;
    websiteUrl?: string | null;
    contactEmail?: string | null;
    supportEmail?: string | null;
    publicContactEmail?: string | null;
    publicContactPhone?: string | null;
    contactPhone?: string | null;
    businessPhone?: string | null;
    category?: string | null;
    location?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    postalCode?: string | null;
    streetAddress1?: string | null;
    streetAddress2?: string | null;
    timezone?: string | null;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    processorProvider?: string | null;
    processorOnboardingStatus?: string | null;
    isPublic?: boolean;
    storefrontSlug?: string | null;
    storefrontEnabled?: boolean;
  };

  const businessName = String(body.businessName ?? "").trim();
  if (!businessName) return NextResponse.json({ error: "Business name is required." }, { status: 400 });

  const existingProfile = await prisma.businessProfile.findUnique({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      storefrontSlug: true,
      storefrontEnabled: true,
      complianceProfile: {
        select: {
          processorProvider: true,
          processorOnboardingStatus: true,
        },
      },
    },
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
  const clean = (value: unknown) => String(value ?? "").trim() || null;
  const profileData = {
    businessName,
    legalBusinessName: clean(body.legalBusinessName),
    dbaName: clean(body.dbaName),
    entityType: clean(body.entityType),
    industry: clean(body.industry),
    tagline: clean(body.tagline),
    description: clean(body.description),
    websiteUrl: clean(body.websiteUrl),
    contactEmail: clean(body.contactEmail),
    supportEmail: clean(body.supportEmail),
    publicContactEmail: clean(body.publicContactEmail),
    publicContactPhone: clean(body.publicContactPhone),
    contactPhone: clean(body.contactPhone),
    businessPhone: clean(body.businessPhone),
    category: clean(body.category),
    location: clean(body.location),
    country: clean(body.country),
    state: clean(body.state),
    city: clean(body.city),
    postalCode: clean(body.postalCode),
    streetAddress1: clean(body.streetAddress1),
    streetAddress2: clean(body.streetAddress2),
    timezone: clean(body.timezone),
    logoUrl: clean(body.logoUrl),
    bannerUrl: clean(body.bannerUrl),
    isPublic: body.isPublic ?? true,
    storefrontSlug,
    storefrontEnabled,
  };
  const processorProvider = existingProfile?.complianceProfile?.processorProvider ?? "STRIPE";
  const processorOnboardingStatus = existingProfile?.complianceProfile?.processorOnboardingStatus ?? "NOT_STARTED";

  const profile = await prisma.$transaction(async (tx) => {
    const savedProfile = await tx.businessProfile.upsert({
      where: { ownerId: session.user.id },
      create: {
        ownerId: session.user.id,
        ...profileData,
      },
      update: profileData,
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        complianceProfile: {
          select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
        },
      },
    });

    await tx.businessComplianceProfile.upsert({
      where: { businessProfileId: savedProfile.id },
      create: {
        businessProfileId: savedProfile.id,
        processorProvider,
        processorOnboardingStatus,
      },
      update: {
        processorProvider,
        processorOnboardingStatus,
      },
    });

    await tx.businessProfileAuditLog.create({
      data: {
        businessProfileId: savedProfile.id,
        actorUserId: session.user.id,
        action: existingProfile ? "BUSINESS_PROFILE_UPDATED" : "BUSINESS_PROFILE_CREATED",
        previousStatus: existingProfile ? "EXISTING" : null,
        nextStatus: "SAVED",
        metadataJson: JSON.stringify({ storefrontEnabled, processorOnboardingStatus }),
      },
    });

    return tx.businessProfile.findUniqueOrThrow({
      where: { id: savedProfile.id },
      include: {
        owner: { select: { id: true, username: true, fullName: true } },
        complianceProfile: {
          select: { processorOnboardingStatus: true, processorChargesEnabled: true, processorPayoutsEnabled: true },
        },
      },
    });
  });

  return NextResponse.json({ ok: true, profile: serializeBusinessProfile(profile) });
}
