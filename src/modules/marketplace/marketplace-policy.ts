import { MarketplaceListingKind, Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import type { MarketplaceListingInput, MarketplacePublisherKind } from "./marketplace.contracts";

export const MARKETPLACE_PUBLIC_REVIEW_THRESHOLD = 3;
export const MARKETPLACE_LISTING_LIFETIME_DAYS = 30;

export function isMarketplaceDirectoryBridgeRecord(attributes: Prisma.JsonValue | null) {
  return Boolean(
    attributes &&
    typeof attributes === "object" &&
    !Array.isArray(attributes) &&
    (attributes as Record<string, unknown>).sourceProfileSync === true,
  );
}

type MarketplaceDatabase = typeof prisma | Prisma.TransactionClient;

export async function requireMarketplaceActor(userId: string, capability: "browse" | "create" | "interact" = "interact") {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deactivatedAt: true, emailVerified: true },
  });
  if (!user || user.deactivatedAt) return { ok: false as const, error: "This account is not available." };
  if (!user.emailVerified && !isAdminRole(user.role)) {
    return { ok: false as const, error: "Verify your email before using marketplace actions." };
  }

  if (capability === "browse") return { ok: true as const, user };
  const feature = capability === "create" ? "market.createListing" : "jobs.browse";
  const access = await canUserAccessFeature(userId, feature);
  if (!access.allowed && !isAdminRole(user.role)) {
    return { ok: false as const, error: access.reason ?? "This marketplace action is not available for your account." };
  }
  return { ok: true as const, user };
}

export async function resolveMarketplacePublisher(
  database: MarketplaceDatabase,
  userId: string,
  publisher: MarketplaceListingInput["publisher"],
) {
  if (publisher.kind === "PERSONAL") {
    return {
      ok: true as const,
      publisherKind: "PERSONAL" as const,
      businessProfileId: null,
      auditorProfileId: null,
    };
  }

  if (publisher.kind === "BUSINESS" || publisher.kind === "ORGANIZATION") {
    const profile = await database.businessProfile.findFirst({
      where: {
        id: publisher.businessProfileId ?? undefined,
        OR: [
          { ownerUserId: userId },
          {
            owner: {
              businessAccountOwnerLink: {
                is: { privateUserId: userId, active: true },
              },
            },
          },
        ],
      },
      select: { id: true, profileKind: true },
    });
    if (!profile) return { ok: false as const, error: "That business or organization profile is not managed by this account." };
    const publisherKind: MarketplacePublisherKind = profile.profileKind === "ORG" ? "ORGANIZATION" : "BUSINESS";
    if (publisher.kind !== publisherKind) {
      return { ok: false as const, error: `Publish this listing as ${publisherKind.toLowerCase()}.` };
    }
    return { ok: true as const, publisherKind, businessProfileId: profile.id, auditorProfileId: null };
  }

  const profile = await database.auditorProfile.findFirst({
    where: {
      id: publisher.auditorProfileId ?? undefined,
      active: true,
      OR: [
        { userId },
        {
          user: {
            auditorAccountOwnerLink: {
              is: { privateUserId: userId, active: true },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (!profile) return { ok: false as const, error: "That auditor profile is not managed by this account." };
  return { ok: true as const, publisherKind: "AUDITOR" as const, businessProfileId: null, auditorProfileId: profile.id };
}

const unlawfulListingPatterns: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\b(stolen goods?|fake identification|counterfeit documents?)\b/i, message: "Listings for stolen or counterfeit items are prohibited." },
  { pattern: /\b(child sexual|human trafficking|forced labor)\b/i, message: "This content cannot be listed on Theta-Space." },
  { pattern: /\b(sell|selling|ship)\b.{0,40}\b(prescription|controlled substance)\b/i, message: "Controlled and prescription products cannot be sold here." },
];

const religionPreferencePatterns = [
  /\bscientologists? only\b/i,
  /\bmust be (?:a )?scientologist\b/i,
  /\bno non[- ]scientologists?\b/i,
  /\breligion (?:is )?required\b/i,
  /\bscientology membership required\b/i,
];

export function validateMarketplacePublicationPolicy(input: MarketplaceListingInput) {
  const searchableText = [input.title, input.summary, input.description, JSON.stringify(input.attributes)].filter(Boolean).join(" ");
  for (const rule of unlawfulListingPatterns) {
    if (rule.pattern.test(searchableText)) return rule.message;
  }
  if (input.kind === MarketplaceListingKind.JOB || input.kind === MarketplaceListingKind.RENTAL) {
    if (religionPreferencePatterns.some((pattern) => pattern.test(searchableText))) {
      return input.kind === "JOB"
        ? "Employment listings cannot require or prefer a religion."
        : "Housing listings cannot require or prefer a religion.";
    }
  }
  if (input.kind === "GOODS") {
    const regulatedCategory = input.attributes.regulatedCategory;
    if (typeof regulatedCategory === "string" && regulatedCategory !== "none" && input.attributes.legalComplianceAttested !== true) {
      return "Confirm that this regulated listing complies with all applicable laws.";
    }
  }
  if (input.kind === "AUDITOR" && input.intent === "OFFER" && input.attributes.qualificationsAttested !== true) {
    return "Confirm that the auditing qualifications in this listing are accurate.";
  }
  return null;
}

export function canManageMarketplaceListing(input: {
  viewerUserId: string;
  ownerUserId: string;
  viewerRole: UserRole;
}) {
  return input.viewerUserId === input.ownerUserId || isAdminRole(input.viewerRole);
}

export function redactMarketplaceContact<T extends {
  contactEmail: string | null;
  contactPhone: string | null;
  contactWebsite: string | null;
  exactAddress: string | null;
  showEmail: boolean;
  showPhone: boolean;
  showWebsite: boolean;
  showExactAddress: boolean;
}>(listing: T, canManage: boolean) {
  return {
    email: canManage || listing.showEmail ? listing.contactEmail : null,
    phone: canManage || listing.showPhone ? listing.contactPhone : null,
    website: canManage || listing.showWebsite ? listing.contactWebsite : null,
    exactAddress: canManage || listing.showExactAddress ? listing.exactAddress : null,
  };
}

export function publicMarketplaceReviewSummary(reviews: Array<{ rating: number }>) {
  if (reviews.length < MARKETPLACE_PUBLIC_REVIEW_THRESHOLD) {
    return { average: null, count: reviews.length, public: false };
  }
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return { average: Math.round(average * 10) / 10, count: reviews.length, public: true };
}

export function encodeMarketplaceCursor(offset: number) {
  return Buffer.from(JSON.stringify({ v: 1, offset }), "utf8").toString("base64url");
}

export function decodeMarketplaceCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { v?: unknown; offset?: unknown };
    return value.v === 1 && Number.isInteger(value.offset) && Number(value.offset) >= 0 && Number(value.offset) <= 1_000_000
      ? Number(value.offset)
      : 0;
  } catch {
    return 0;
  }
}
