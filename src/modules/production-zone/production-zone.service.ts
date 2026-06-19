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
      badge: "Browse",
      available: features["jobs.browse"]
    }),
    card({
      title: "Find an Auditor",
      description: "Browse auditor mini profiles and My Scientology education summaries.",
      href: "/auditors",
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
      badge: "Browse",
      available: features["writers.access"],
      reason: "Contributor or Professional access required."
    })
  ];

  const creatorCards = [
    card({
      title: "Create Event",
      description: "Create an invite-based event, then manage invites and scoped moderators.",
      href: "/events/create",
      badge: "Create",
      available: features["events.create"],
      reason: "Professional access required."
    }),
    card({
      title: "Create Market Listing",
      description: "Create a listing with static category, thumbnail photos, title, and price.",
      href: "/market/create",
      badge: "Create",
      available: features["market.createListing"],
      reason: "Contributor or Professional access required."
    }),
    card({
      title: "Create Job Listing",
      description: "Post a job opportunity with full detail and contact instructions.",
      href: "/jobs/create",
      badge: "Create",
      available: features["jobs.createListing"],
      reason: "Professional access required."
    }),
    card({
      title: "I'm an Auditor",
      description: "Build your auditor mini business profile.",
      href: "/auditors/im-an-auditor",
      badge: "Create",
      available: features["auditors.createProfile"] || Boolean(user.auditorProfile),
      reason: "Auditor account required."
    })
  ];

  const businessCards = [
    card({
      title: "Business Center",
      description: "Professional hub for storefront, general ads, jobs, events, and public business tooling.",
      href: "/business-center",
      badge: "Business",
      available: features["market.storefront"] || features["ads.createGeneral"] || features["jobs.createListing"],
      reason: "Professional access required."
    }),
    card({
      title: "Ad Campaigns",
      description: "Create labeled reserved-placement ads without inserting ads inside listings, events, or posts.",
      href: "/ads",
      badge: "Business",
      available: features["ads.createGeneral"],
      reason: "Professional, Auditor, or Admin access required."
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
