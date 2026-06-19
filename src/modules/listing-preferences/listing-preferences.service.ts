import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  listingPreferenceSurfaces,
  listingViewModes,
  type ListingPreferenceSurface,
  type ListingViewMode
} from "@/modules/listing-preferences/types";

const MODULE_KEY = "listing-preferences";
const PROFILE_PREFS_KEY = "listingViewPreferences";

type ProfileThemeData = {
  listingViewPreferences?: Partial<Record<ListingPreferenceSurface, ListingViewMode>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isListingViewMode(value: unknown): value is ListingViewMode {
  return typeof value === "string" && listingViewModes.includes(value as ListingViewMode);
}

export function isListingPreferenceSurface(value: unknown): value is ListingPreferenceSurface {
  return typeof value === "string" && listingPreferenceSurfaces.includes(value as ListingPreferenceSurface);
}

function readListingPreferences(theme: unknown): Partial<Record<ListingPreferenceSurface, ListingViewMode>> {
  if (!isRecord(theme)) return {};
  const rawPreferences = theme[PROFILE_PREFS_KEY];

  if (!isRecord(rawPreferences)) return {};

  return listingPreferenceSurfaces.reduce<Partial<Record<ListingPreferenceSurface, ListingViewMode>>>((preferences, surface) => {
    const value = rawPreferences[surface];

    if (isListingViewMode(value)) {
      preferences[surface] = value;
    }

    return preferences;
  }, {});
}

export async function getListingViewPreference(userId: string, surface: ListingPreferenceSurface, fallback: ListingViewMode = "square") {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { theme: true }
    });
    const preferences = readListingPreferences(profile?.theme);

    return preferences[surface] ?? fallback;
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Could not read listing view preference.", {
      userId,
      surface,
      error: error instanceof Error ? error.message : "unknown"
    });
    return fallback;
  }
}

export async function setListingViewPreference(userId: string, surface: ListingPreferenceSurface, view: ListingViewMode) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { theme: true }
  });
  const theme = (isRecord(profile?.theme) ? profile?.theme : {}) as ProfileThemeData;
  const preferences = {
    ...readListingPreferences(theme),
    [surface]: view
  };

  await prisma.profile.upsert({
    where: { userId },
    update: {
      theme: {
        ...theme,
        [PROFILE_PREFS_KEY]: preferences
      }
    },
    create: {
      userId,
      theme: {
        [PROFILE_PREFS_KEY]: preferences
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Listing view preference updated.", {
    userId,
    surface,
    view
  });

  return preferences;
}
