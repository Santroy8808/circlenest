export type BusinessProfileSummary = Readonly<{
  id: string;
  ownerId: string;
  businessName: string;
  legalBusinessName: string | null;
  dbaName: string | null;
  entityType: string | null;
  industry: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  supportEmail: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  contactPhone: string | null;
  businessPhone: string | null;
  category: string | null;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  timezone: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  isPublic: boolean;
  status: string;
  verificationStatus: string;
  processorOnboardingStatus: string | null;
  processorChargesEnabled: boolean;
  processorPayoutsEnabled: boolean;
  storefrontSlug: string | null;
  storefrontEnabled: boolean;
  completion: Readonly<{
    publicIdentity: boolean;
    contactLocation: boolean;
    legalBusinessInfo: boolean;
    paymentProcessorSetup: boolean;
    storefrontSetup: boolean;
    reviewReady: boolean;
    percent: number;
  }>;
  createdAt: string;
  updatedAt: string;
  owner: Readonly<{
    id: string;
    username: string;
    fullName: string | null;
  }>;
}>;

type BusinessProfileSource = {
  id: string;
  ownerId: string;
  businessName: string;
  legalBusinessName: string | null;
  dbaName: string | null;
  entityType: string | null;
  industry: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  supportEmail: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  contactPhone: string | null;
  businessPhone: string | null;
  category: string | null;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  timezone: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  isPublic: boolean;
  status: string;
  verificationStatus: string;
  storefrontSlug: string | null;
  storefrontEnabled: boolean;
  complianceProfile?: {
    processorOnboardingStatus: string;
    processorChargesEnabled: boolean;
    processorPayoutsEnabled: boolean;
  } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  owner: {
    id: string;
    username: string;
    fullName: string | null;
  };
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function calculateCompletion(profile: BusinessProfileSource): BusinessProfileSummary["completion"] {
  const publicIdentity = Boolean(profile.businessName.trim() && profile.tagline?.trim() && profile.description?.trim());
  const contactLocation = Boolean(
    (profile.publicContactEmail?.trim() || profile.contactEmail?.trim()) &&
      (profile.businessPhone?.trim() || profile.publicContactPhone?.trim() || profile.contactPhone?.trim()) &&
      profile.country?.trim() &&
      profile.state?.trim() &&
      profile.city?.trim(),
  );
  const legalBusinessInfo = Boolean(profile.legalBusinessName?.trim() && profile.entityType?.trim());
  const paymentProcessorSetup = Boolean(
    profile.complianceProfile?.processorOnboardingStatus === "COMPLETE" ||
      (profile.complianceProfile?.processorChargesEnabled && profile.complianceProfile?.processorPayoutsEnabled),
  );
  const storefrontSetup = Boolean(profile.storefrontSlug?.trim());
  const reviewReady = publicIdentity && contactLocation && legalBusinessInfo && storefrontSetup;
  const steps = [publicIdentity, contactLocation, legalBusinessInfo, paymentProcessorSetup, storefrontSetup, reviewReady];
  const percent = Math.round((steps.filter(Boolean).length / steps.length) * 100);
  return { publicIdentity, contactLocation, legalBusinessInfo, paymentProcessorSetup, storefrontSetup, reviewReady, percent };
}

export function serializeBusinessProfile(profile: BusinessProfileSource): BusinessProfileSummary {
  const completion = calculateCompletion(profile);
  return {
    id: profile.id,
    ownerId: profile.ownerId,
    businessName: profile.businessName,
    legalBusinessName: profile.legalBusinessName,
    dbaName: profile.dbaName,
    entityType: profile.entityType,
    industry: profile.industry,
    tagline: profile.tagline,
    description: profile.description,
    websiteUrl: profile.websiteUrl,
    contactEmail: profile.contactEmail,
    supportEmail: profile.supportEmail,
    publicContactEmail: profile.publicContactEmail,
    publicContactPhone: profile.publicContactPhone,
    contactPhone: profile.contactPhone,
    businessPhone: profile.businessPhone,
    category: profile.category,
    location: profile.location,
    country: profile.country,
    state: profile.state,
    city: profile.city,
    postalCode: profile.postalCode,
    streetAddress1: profile.streetAddress1,
    streetAddress2: profile.streetAddress2,
    timezone: profile.timezone,
    logoUrl: profile.logoUrl,
    bannerUrl: profile.bannerUrl,
    isPublic: profile.isPublic,
    status: profile.status,
    verificationStatus: profile.verificationStatus,
    processorOnboardingStatus: profile.complianceProfile?.processorOnboardingStatus ?? null,
    processorChargesEnabled: profile.complianceProfile?.processorChargesEnabled ?? false,
    processorPayoutsEnabled: profile.complianceProfile?.processorPayoutsEnabled ?? false,
    storefrontSlug: profile.storefrontSlug,
    storefrontEnabled: profile.storefrontEnabled,
    completion,
    createdAt: normalizeDate(profile.createdAt),
    updatedAt: normalizeDate(profile.updatedAt),
    owner: {
      id: profile.owner.id,
      username: profile.owner.username,
      fullName: profile.owner.fullName,
    },
  };
}

export function serializeBusinessProfiles(profiles: BusinessProfileSource[]): BusinessProfileSummary[] {
  return profiles.map((profile) => serializeBusinessProfile(profile));
}
