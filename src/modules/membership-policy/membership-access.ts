import { MembershipTier } from "@prisma/client";

export const operationalMembershipTiers = [MembershipTier.FREE, MembershipTier.CONTRIBUTOR] as const;

export type OperationalTier = (typeof operationalMembershipTiers)[number];

export const membershipCapabilities = [
  "stream.read",
  "stream.publish.public",
  "stream.filters",
  "profile.use",
  "gallery.use",
  "messages.use",
  "groups.use",
  "groups.create",
  "groups.manageModerators",
  "groups.unlimitedSize",
  "market.browse",
  "market.createListing",
  "market.promoteListing",
  "jobs.browse",
  "jobs.createListing",
  "auditors.browse",
  "auditors.createProfile",
  "writers.use",
  "support.create",
  "events.create",
  "ads.createGeneral",
  "ads.createFundraiser",
  "fundraisers.create",
  "invites.send",
  "invites.bulkSend",
  "mail.massSend",
  "mail.orgMassSend",
  "org.profile",
  "moderation.siteEligible",
  "admin.portal",
  "business.identity.switch",
  "business.storefront.manage"
] as const;

export type Capability = (typeof membershipCapabilities)[number];

export type MembershipQuotas = {
  groupMemberCap: number | null;
  marketListingsPer14Days: number | null;
  marketListingPhotoCap: number;
  fundraiserPerMonth: number;
  marketActiveListingCap: number | null;
  personalStorageBytes: number;
};

export type ContributorOfferStatus = "OFFERED" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type ContributorOffer = {
  status: ContributorOfferStatus;
  grantedByAdminId: string;
  grantedAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  betaPriceCents: 0;
  futureMonthlyPriceCents: 499;
};

export type MembershipAccess = {
  persistedTier: MembershipTier;
  operationalTier: OperationalTier;
  capabilities: ReadonlySet<Capability>;
  quotas: MembershipQuotas;
  contributorOffer: ContributorOffer | null;
};

type OperationalTierContract = {
  capabilities: readonly Capability[];
  quotas: MembershipQuotas;
};

const MEBIBYTE = 1024 * 1024;

const freeCapabilities = [
  "stream.read",
  "stream.publish.public",
  "profile.use",
  "gallery.use",
  "messages.use",
  "groups.use",
  "groups.create",
  "groups.manageModerators",
  "market.browse",
  "market.createListing",
  "jobs.browse",
  "auditors.browse",
  "moderation.siteEligible"
] as const satisfies readonly Capability[];

const contributorCapabilities = [
  ...freeCapabilities,
  "stream.filters",
  "writers.use",
  "support.create"
] as const satisfies readonly Capability[];

export const operationalTierContracts: Record<OperationalTier, OperationalTierContract> = {
  [MembershipTier.FREE]: {
    capabilities: freeCapabilities,
    quotas: {
      groupMemberCap: null,
      marketListingsPer14Days: null,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      marketActiveListingCap: 1,
      personalStorageBytes: 200 * MEBIBYTE
    }
  },
  [MembershipTier.CONTRIBUTOR]: {
    capabilities: contributorCapabilities,
    quotas: {
      groupMemberCap: null,
      marketListingsPer14Days: 6,
      marketListingPhotoCap: 3,
      fundraiserPerMonth: 0,
      marketActiveListingCap: null,
      personalStorageBytes: 2 * 1024 * MEBIBYTE
    }
  }
};

export function isOperationalTier(tier: MembershipTier): tier is OperationalTier {
  return operationalMembershipTiers.includes(tier as OperationalTier);
}

export function normalizeOperationalTier(tier?: MembershipTier | null): OperationalTier {
  return tier && isOperationalTier(tier) ? tier : MembershipTier.FREE;
}

export function getOperationalTierContract(tier?: MembershipTier | null) {
  return operationalTierContracts[normalizeOperationalTier(tier)];
}

export function hasOperationalTierCapability(tier: OperationalTier, capability: Capability) {
  return operationalTierContracts[tier].capabilities.includes(capability);
}

function offerHasNotExpired(offer: ContributorOffer, now: Date) {
  return offer.expiresAt === null || offer.expiresAt.getTime() > now.getTime();
}

export function isContributorOfferEligible(offer: ContributorOffer | null | undefined, now = new Date()) {
  return Boolean(
    offer &&
      offer.status === "OFFERED" &&
      offer.revokedAt === null &&
      offerHasNotExpired(offer, now)
  );
}

export function isContributorOfferAccepted(offer: ContributorOffer | null | undefined) {
  return Boolean(offer && offer.status === "ACCEPTED" && offer.revokedAt === null && offer.acceptedAt);
}

export function isContributorOfferVisible(offer: ContributorOffer | null | undefined, now = new Date()) {
  return isContributorOfferEligible(offer, now) || isContributorOfferAccepted(offer);
}

export function resolveMembershipAccess(input: {
  persistedTier?: MembershipTier | null;
  contributorOffer?: ContributorOffer | null;
  now?: Date;
}): MembershipAccess {
  const persistedTier = input.persistedTier ?? MembershipTier.FREE;
  const contributorOffer = isContributorOfferVisible(input.contributorOffer, input.now)
    ? input.contributorOffer ?? null
    : null;
  const normalizedTier = normalizeOperationalTier(persistedTier);
  const operationalTier =
    normalizedTier === MembershipTier.CONTRIBUTOR || isContributorOfferAccepted(contributorOffer)
      ? MembershipTier.CONTRIBUTOR
      : MembershipTier.FREE;
  const contract = operationalTierContracts[operationalTier];

  return {
    persistedTier,
    operationalTier,
    capabilities: new Set(contract.capabilities),
    quotas: { ...contract.quotas },
    contributorOffer
  };
}

export function hasMembershipCapability(access: MembershipAccess, capability: Capability) {
  return access.capabilities.has(capability);
}
