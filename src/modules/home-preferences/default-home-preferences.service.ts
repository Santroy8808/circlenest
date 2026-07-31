import { AccountPurpose, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isInternalMailEnabled } from "@/modules/mail/mail.service";
import { listRegisteredFeatureFlags } from "@/modules/feature-flags/feature-flags.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

const MODULE_KEY = "default-home-preferences";
const PROFILE_PREFS_KEY = "defaultHomePage";

export const defaultHomeKeys = [
  "stream",
  "market",
  "jobs",
  "messages",
  "gallery",
  "people",
  "groups",
  "auditors",
  "writers",
  "notifications",
  "mail",
  "business",
  "ads",
  "fundraisers"
] as const;

export type DefaultHomeKey = (typeof defaultHomeKeys)[number];

export type DefaultHomeOption = {
  description: string;
  href: string;
  key: DefaultHomeKey;
  label: string;
};

export type DefaultHomeContext = {
  accountPurpose?: AccountPurpose | null;
  features: Record<string, boolean>;
  isAdmin?: boolean;
  mailEnabled: boolean;
  platformFeatures: Record<string, boolean>;
};

type ProfileThemeData = {
  defaultHomePage?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDefaultHomeKey(value: unknown): value is DefaultHomeKey {
  return typeof value === "string" && defaultHomeKeys.includes(value as DefaultHomeKey);
}

function includePlatformFeature(features: Record<string, boolean>, key: string) {
  return features[key] !== false;
}

export function buildDefaultHomeOptions(context: DefaultHomeContext): DefaultHomeOption[] {
  if (context.accountPurpose === AccountPurpose.AUDITOR_SEEKER) {
    return [
      {
        key: "auditors",
        label: "Find an Auditor",
        href: "/auditors",
        description: "Open the auditor directory when you enter Theta-Space."
      },
      {
        key: "stream",
        label: "Stream",
        href: "/home",
        description: "Open the main Theta-Space stream."
      }
    ];
  }

  const options: DefaultHomeOption[] = [
    {
      key: "stream",
      label: "Stream",
      href: "/home",
      description: "Open the main Theta-Space stream."
    }
  ];

  if (includePlatformFeature(context.platformFeatures, "marketplace.member_market")) {
    options.push({
      key: "market",
      label: "Market",
      href: "/market",
      description: "Browse Theta-Space Market listings."
    });
  }

  if (context.features["jobs.browse"] === true) {
    options.push({
      key: "jobs",
      label: "Jobs",
      href: "/market/jobs",
      description: "Open active job listings."
    });
  }

  if (includePlatformFeature(context.platformFeatures, "communication.direct_messages")) {
    options.push(
      {
        key: "messages",
        label: "Messages",
        href: "/messages",
        description: "Open Comm Center messages."
      },
      {
        key: "people",
        label: "People",
        href: "/people",
        description: "Open member discovery."
      }
    );
  }

  if (includePlatformFeature(context.platformFeatures, "community.groups")) {
    options.push({
      key: "groups",
      label: "Groups",
      href: "/groups",
      description: "Browse and manage chat/community groups."
    });
  }

  if (includePlatformFeature(context.platformFeatures, "media.personal_gallery")) {
    options.push({
      key: "gallery",
      label: "My Pics",
      href: "/profile/gallery",
      description: "Open your personal gallery."
    });
  }

  if (context.features["auditors.browse"] === true) {
    options.push({
      key: "auditors",
      label: "Find an Auditor",
      href: "/auditors",
      description: "Open the auditor directory."
    });
  }

  if (context.features["writers.access"] === true) {
    options.push({
      key: "writers",
      label: "Writers Corner",
      href: "/writers-corner",
      description: "Open Writers Corner."
    });
  }

  if (context.mailEnabled) {
    options.push({
      key: "mail",
      label: "Mail",
      href: "/mail",
      description: "Open internal mail."
    });
  }

  options.push({
    key: "notifications",
    label: "Notifications",
    href: "/notifications",
    description: "Open notifications and alerts."
  });

  if (context.features["market.storefront"] === true || context.features["org.profile"] === true) {
    options.push({
      key: "business",
      label: "Business Center",
      href: "/business-center",
      description: "Open business and organization tools."
    });
  }

  if (context.features["ads.createGeneral"] === true || context.features["ads.createFundraiser"] === true) {
    options.push({
      key: "ads",
      label: "Ads",
      href: "/ads",
      description: "Open ad campaign tools."
    });
  }

  if (context.features["fundraisers.create"] === true) {
    options.push({
      key: "fundraisers",
      label: "Fundraisers",
      href: "/fundraisers",
      description: "Open fundraiser tools."
    });
  }

  return options;
}

function readDefaultHomeKey(theme: unknown): DefaultHomeKey {
  if (!isRecord(theme)) return "stream";
  const value = theme[PROFILE_PREFS_KEY];

  return isDefaultHomeKey(value) ? value : "stream";
}

function selectDefaultHomeOption(theme: unknown, options: DefaultHomeOption[]) {
  const selectedKey = readDefaultHomeKey(theme);

  return options.find((option) => option.key === selectedKey) ?? options[0] ?? {
    key: "stream" as const,
    label: "Stream",
    href: "/home",
    description: "Open the main Theta-Space stream."
  };
}

async function getDefaultHomeContext(userId: string): Promise<DefaultHomeContext> {
  const [policy, featureFlags, user] = await Promise.all([
    getEffectivePolicyForUser(userId),
    listRegisteredFeatureFlags(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { accountPurpose: true, role: true }
    })
  ]);

  return {
    accountPurpose: user?.accountPurpose,
    features: policy?.features ?? {},
    isAdmin: user?.role === UserRole.ADMIN || user?.role === UserRole.GOD,
    mailEnabled: isInternalMailEnabled(),
    platformFeatures: Object.fromEntries(featureFlags.map((flag) => [flag.key, flag.enabled]))
  };
}

export async function getDefaultHomeSettings(userId: string, context?: DefaultHomeContext) {
  try {
    const [profile, resolvedContext] = await Promise.all([
      prisma.profile.findUnique({
        where: { userId },
        select: { theme: true }
      }),
      context ? Promise.resolve(context) : getDefaultHomeContext(userId)
    ]);
    const options = buildDefaultHomeOptions(resolvedContext);
    const selected = selectDefaultHomeOption(profile?.theme, options);

    return { options, selected };
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Could not read default home preference.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    const options = buildDefaultHomeOptions(context ?? {
      features: {},
      mailEnabled: false,
      platformFeatures: {}
    });
    return { options, selected: options[0] };
  }
}

export async function getDefaultHomeHref(userId: string, context?: DefaultHomeContext) {
  const settings = await getDefaultHomeSettings(userId, context);

  return settings.selected?.href ?? "/home";
}

export async function setDefaultHomePreference(userId: string, value: unknown) {
  if (!isDefaultHomeKey(value)) {
    return { ok: false as const, error: "Invalid default home page." };
  }

  const settings = await getDefaultHomeSettings(userId);
  if (!settings.options.some((option) => option.key === value)) {
    return { ok: false as const, error: "That home page is not available for this account." };
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { theme: true }
  });
  const theme = (isRecord(profile?.theme) ? profile?.theme : {}) as ProfileThemeData;

  await prisma.profile.upsert({
    where: { userId },
    update: {
      theme: {
        ...theme,
        [PROFILE_PREFS_KEY]: value
      }
    },
    create: {
      userId,
      theme: {
        [PROFILE_PREFS_KEY]: value
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Default home preference updated.", {
    userId,
    value
  });

  const updated = await getDefaultHomeSettings(userId);
  return { ok: true as const, ...updated };
}
