import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import type { ProductionZoneCard, ProductionZoneView } from "@/modules/production-zone/types";

const MODULE_KEY = "production-zone";

function card(input: ProductionZoneCard): ProductionZoneCard {
  return input;
}

export async function getProductionZoneView(userId: string): Promise<ProductionZoneView> {
  const [policy, user] = await Promise.all([
    getEffectivePolicyForUser(userId),
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        auditorProfile: true
      }
    })
  ]);

  if (!policy || !user) {
    await diagnostics.warn(MODULE_KEY, "Could not resolve production zone policy.", { userId });
    return {
      tierName: "Unknown",
      browseCards: [],
      creatorCards: [],
      businessCards: [],
      futureCards: []
    };
  }

  const features = policy.features;
  const browseCards = [
    card({
      title: "Events",
      description: "View events you created, moderate, RSVP to, or were invited into.",
      href: "/events",
      badge: "Browse",
      available: true
    }),
    card({
      title: "The Market",
      description: "Browse member listings as thumbnail cards with detail pages.",
      href: "/market",
      badge: "Browse",
      available: true
    }),
    card({
      title: "Find a Job",
      description: "Browse available job listings and open details/contact instructions.",
      href: "/jobs",
      featureKey: "jobs.browse",
      badge: "Browse",
      available: features["jobs.browse"]
    }),
    card({
      title: "Find an Auditor",
      description: "Browse auditor mini profiles and My Scientology education summaries.",
      href: "/auditors",
      featureKey: "auditors.browse",
      badge: "Browse",
      available: features["auditors.browse"]
    }),
    card({
      title: "Fundraisers",
      description: "Browse member fundraiser campaigns with payment-ready contribution intent flow.",
      href: "/fundraisers",
      badge: "Browse",
      available: true
    }),
    card({
      title: "Writers Corner",
      description: "Open manuscripts, chapters, and reader-friendly writing spaces.",
      href: "/writers-corner",
      featureKey: "writers.access",
      badge: "Browse",
      available: features["writers.access"],
      reason: "This feature is in development."
    })
  ];

  const creatorCards = [
    card({
      title: "Create Event",
      description: "Create an invite-based event, then manage invites and scoped moderators.",
      href: "/events/create",
      featureKey: "events.create",
      badge: "Create",
      available: features["events.create"],
      reason: "This feature is in development."
    }),
    card({
      title: "Create Market Listing",
      description: "Create a listing with static category, thumbnail photos, title, and price.",
      href: "/market/create",
      featureKey: "market.createListing",
      badge: "Create",
      available: features["market.createListing"],
      reason: "This feature is in development."
    }),
    card({
      title: "Create Job Listing",
      description: "Post a job opportunity with full detail and contact instructions.",
      href: "/jobs/create",
      featureKey: "jobs.createListing",
      badge: "Create",
      available: features["jobs.createListing"],
      reason: "This feature is in development."
    }),
    card({
      title: "I'm an Auditor",
      description: "Build your auditor mini business profile.",
      href: "/auditors/im-an-auditor",
      featureKey: "auditors.createProfile",
      badge: "Create",
      available: features["auditors.createProfile"] || Boolean(user.auditorProfile),
      reason: "This feature is in development."
    })
  ];

  const businessCards = [
    card({
      title: features["org.profile"] ? "Org Center" : "Business Center",
      description: features["org.profile"]
        ? "Org profile, blogs, events, fundraisers, and parishioner communication tools."
        : "Professional hub for storefront, general ads, jobs, events, and public business tooling.",
      href: "/business-center",
      featureKey: features["org.profile"] ? "org.profile" : "market.storefront",
      badge: features["org.profile"] ? "Org" : "Business",
      available: features["market.storefront"] || features["org.profile"] || features["ads.createGeneral"] || features["jobs.createListing"],
      reason: "This feature is in development."
    }),
    card({
      title: "Ad Campaigns",
      description: "Create labeled reserved-placement ads without inserting ads inside listings, events, or posts.",
      href: "/ads",
      featureKey: features["ads.createFundraiser"] ? "ads.createFundraiser" : "ads.createGeneral",
      badge: "Business",
      available: features["ads.createGeneral"] || features["ads.createFundraiser"],
      reason: "This feature is in development."
    })
  ];

  const futureCards: ProductionZoneCard[] = [];

  return {
    tierName: policy.displayName,
    browseCards,
    creatorCards,
    businessCards,
    futureCards
  };
}
