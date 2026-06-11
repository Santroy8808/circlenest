export type BusinessProfileSummary = Readonly<{
  id: string;
  ownerId: string;
  businessName: string;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  category: string | null;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  isPublic: boolean;
  storefrontSlug: string | null;
  storefrontEnabled: boolean;
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
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  category: string | null;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  isPublic: boolean;
  storefrontSlug: string | null;
  storefrontEnabled: boolean;
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

export function serializeBusinessProfile(profile: BusinessProfileSource): BusinessProfileSummary {
  return {
    id: profile.id,
    ownerId: profile.ownerId,
    businessName: profile.businessName,
    tagline: profile.tagline,
    description: profile.description,
    websiteUrl: profile.websiteUrl,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    category: profile.category,
    location: profile.location,
    country: profile.country,
    state: profile.state,
    city: profile.city,
    isPublic: profile.isPublic,
    storefrontSlug: profile.storefrontSlug,
    storefrontEnabled: profile.storefrontEnabled,
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
