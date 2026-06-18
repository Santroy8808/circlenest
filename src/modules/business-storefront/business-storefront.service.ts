import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createBusinessInquirySchema,
  updateBusinessProfileSchema,
  type BusinessCenterView,
  type BusinessInquiryView,
  type BusinessProfileView
} from "@/modules/business-storefront/types";

const MODULE_KEY = "business-storefront";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueBusinessSlug(name: string) {
  const base = slugify(name) || "business";
  let candidate = base;
  let index = 2;

  while (await prisma.businessProfile.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function publicUrl(slug: string) {
  return `/storefront/${slug}`;
}

type BusinessProfilePayload = Prisma.BusinessProfileGetPayload<{
  include: {
    owner: { include: { profile: true } };
  };
}>;

function toBusinessProfileView(profile: BusinessProfilePayload): BusinessProfileView {
  return {
    id: profile.id,
    slug: profile.slug,
    businessName: profile.businessName,
    tagline: profile.tagline,
    description: profile.description,
    location: profile.location,
    publicEmail: profile.publicEmail,
    phone: profile.phone,
    website: profile.website,
    publicStorefrontEnabled: profile.publicStorefrontEnabled,
    emailLinkingEnabled: profile.emailLinkingEnabled,
    publicUrl: publicUrl(profile.slug),
    updatedAt: profile.updatedAt.toISOString(),
    owner: {
      username: profile.owner.username,
      displayName: profileName(profile.owner),
      avatarUrl: profile.owner.profile?.avatarUrl ?? null
    }
  };
}

function toInquiryView(inquiry: {
  id: string;
  senderName: string;
  senderEmail: string | null;
  message: string;
  status: "NEW" | "READ" | "ARCHIVED";
  createdAt: Date;
}): BusinessInquiryView {
  return {
    id: inquiry.id,
    senderName: inquiry.senderName,
    senderEmail: inquiry.senderEmail,
    message: inquiry.message,
    status: inquiry.status,
    createdAt: inquiry.createdAt.toISOString()
  };
}

async function canManageBusinessProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!user) return { allowed: false, reason: "User was not found." };
  if (user.role === UserRole.ADMIN) return { allowed: true, reason: "Admin role can manage business profiles." };

  return canUserAccessFeature(userId, "market.storefront");
}

export async function getBusinessCenterView(userId: string): Promise<BusinessCenterView> {
  const [access, profile] = await Promise.all([
    canManageBusinessProfile(userId),
    prisma.businessProfile.findUnique({
      where: { ownerUserId: userId },
      include: {
        owner: {
          include: {
            profile: true
          }
        },
        inquiries: {
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        }
      }
    })
  ]);

  return {
    canManage: access.allowed,
    reason: access.reason,
    profile: profile ? toBusinessProfileView(profile) : null,
    inquiries: profile?.inquiries.map(toInquiryView) ?? []
  };
}

export async function upsertBusinessProfile(userId: string, input: unknown) {
  const parsed = updateBusinessProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid business profile." };
  }

  const access = await canManageBusinessProfile(userId);

  if (!access.allowed) {
    return { ok: false as const, error: access.reason ?? "Professional access required." };
  }

  const existing = await prisma.businessProfile.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, slug: true }
  });
  const data = {
    businessName: parsed.data.businessName,
    tagline: parsed.data.tagline || null,
    description: parsed.data.description || null,
    location: parsed.data.location || null,
    publicEmail: parsed.data.publicEmail || null,
    phone: parsed.data.phone || null,
    website: parsed.data.website || null,
    publicStorefrontEnabled: parsed.data.publicStorefrontEnabled
  };
  const profile = existing
    ? await prisma.businessProfile.update({
        where: { id: existing.id },
        data,
        include: {
          owner: {
            include: {
              profile: true
            }
          }
        }
      })
    : await prisma.businessProfile.create({
        data: {
          ...data,
          slug: await uniqueBusinessSlug(parsed.data.businessName),
          ownerUserId: userId
        },
        include: {
          owner: {
            include: {
              profile: true
            }
          }
        }
      });

  await diagnostics.info(MODULE_KEY, "Business profile saved.", {
    userId,
    businessProfileId: profile.id,
    publicStorefrontEnabled: profile.publicStorefrontEnabled
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "business.profile.saved",
    targetType: "BusinessProfile",
    targetId: profile.id,
    metadata: {
      publicStorefrontEnabled: profile.publicStorefrontEnabled
    }
  });

  return { ok: true as const, profile: toBusinessProfileView(profile) };
}

export async function getPublicBusinessProfile(slug: string) {
  const profile = await prisma.businessProfile.findFirst({
    where: {
      slug,
      publicStorefrontEnabled: true
    },
    include: {
      owner: {
        include: {
          profile: true
        }
      }
    }
  });

  if (!profile) {
    return { ok: false as const, error: "Storefront not found." };
  }

  return { ok: true as const, profile: toBusinessProfileView(profile) };
}

export async function safeGetPublicBusinessProfile(slug: string) {
  try {
    return await getPublicBusinessProfile(slug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load public storefront.", {
      slug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load storefront." };
  }
}

export async function createBusinessInquiry(slug: string, input: unknown) {
  const parsed = createBusinessInquirySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid inquiry." };
  }

  const profile = await prisma.businessProfile.findFirst({
    where: {
      slug,
      publicStorefrontEnabled: true
    },
    select: {
      id: true,
      ownerUserId: true
    }
  });

  if (!profile) {
    return { ok: false as const, error: "Storefront not found." };
  }

  const inquiry = await prisma.businessInquiry.create({
    data: {
      businessProfileId: profile.id,
      senderName: parsed.data.senderName,
      senderEmail: parsed.data.senderEmail || null,
      message: parsed.data.message
    }
  });

  await diagnostics.info(MODULE_KEY, "Business storefront inquiry created.", {
    businessProfileId: profile.id,
    ownerUserId: profile.ownerUserId,
    inquiryId: inquiry.id
  });

  return { ok: true as const, inquiry: toInquiryView(inquiry) };
}
