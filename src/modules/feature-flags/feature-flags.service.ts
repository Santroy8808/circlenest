import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export const FEATURE_FLAG_CATEGORIES = [
  {
    key: "community",
    title: "Community",
    description: "Member spaces for finding people and participating together."
  },
  {
    key: "communication-media",
    title: "Communication & Media",
    description: "Private conversations and member-managed pictures."
  },
  {
    key: "market-discovery",
    title: "Market, Publishing & Discovery",
    description: "Optional discovery, marketplace, directory, and publishing modules."
  },
  {
    key: "membership-support",
    title: "Membership & Support",
    description: "Invitation and member-support tools."
  },
  {
    key: "platform-operations",
    title: "Platform Operations",
    description: "Administrator-operated background and review systems."
  }
] as const;

export const FEATURE_FLAG_DEFINITIONS = [
  {
    key: "community.groups",
    title: "Groups",
    categoryKey: "community",
    area: "Community",
    description: "Allows members to browse, join, create, and participate in groups, group forums, and group media.",
    effectWhenDisabled: "Groups are removed from platform navigation and all group pages are unavailable. Existing group data is preserved.",
    enforcement: "Control Panel, desktop/mobile navigation, and the Groups route tree",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "communication.direct_messages",
    title: "Direct Messages",
    categoryKey: "communication-media",
    area: "Communication",
    description: "Allows members to open the Comm Center and exchange direct or group-chat messages.",
    effectWhenDisabled: "Messages are removed from navigation, message pages are unavailable, and new chat messages or reactions are rejected. Existing conversations are preserved.",
    enforcement: "Control Panel, desktop/mobile navigation, Messages route tree, and chat mutation APIs",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "media.personal_gallery",
    title: "My Pics & Personal Galleries",
    categoryKey: "communication-media",
    area: "Media",
    description: "Allows members to open and manage their personal picture gallery, uploads, visibility, tags, comments, and reactions.",
    effectWhenDisabled: "My Pics is removed from navigation and personal gallery pages are unavailable. Stored pictures are preserved.",
    enforcement: "Control Panel, desktop/mobile navigation, profile avatar link, and personal Gallery route tree",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "marketplace.member_market",
    title: "Member Marketplace",
    categoryKey: "market-discovery",
    area: "Marketplace",
    description: "Allows entitled members to browse listings and use their tier-permitted listing tools.",
    effectWhenDisabled: "The Market is removed from navigation and all marketplace pages are unavailable. Listings and listing media are preserved.",
    enforcement: "Control Panel, desktop/mobile navigation, and the Market route tree",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "directory.auditor_directory",
    title: "Auditor Directory",
    categoryKey: "market-discovery",
    area: "Directory",
    description: "Allows members to browse and search public auditor profiles. Membership-tier rules still control profile creation.",
    effectWhenDisabled: "Auditor directory links and every auditor-directory page are unavailable. Auditor profiles are preserved.",
    enforcement: "Control Panel Market menu and the Auditors route tree",
    risk: "medium",
    defaultEnabled: true
  },
  {
    key: "publishing.writers_corner",
    title: "Writers Corner",
    categoryKey: "market-discovery",
    area: "Publishing",
    description: "Allows entitled members to use manuscripts, chapters, subscriptions, and related publishing tools.",
    effectWhenDisabled: "Writers Corner is removed from navigation and all manuscript pages are unavailable. Manuscripts and subscriptions are preserved.",
    enforcement: "Control Panel Tools menu and the Writers Corner route tree",
    risk: "medium",
    defaultEnabled: true
  },
  {
    key: "membership.single_invites",
    title: "Single Invitations",
    categoryKey: "membership-support",
    area: "Membership",
    description: "Allows accounts with invite permission to create and manage one individually coded invitation at a time.",
    effectWhenDisabled: "Single-invite controls are hidden and new single invitations are rejected. Existing invitations remain manageable by administrators.",
    enforcement: "Settings visibility, Invite Controls, and invitation creation API",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "operations.communication_review",
    title: "Communication Review Scanner",
    categoryKey: "platform-operations",
    area: "Platform Management",
    description: "Allows manual, automatic, and scheduled scanning of eligible stream and group discussions for human-review candidates.",
    effectWhenDisabled: "No new communication-review runs can be queued. Manual member reports and disputes continue to work.",
    enforcement: "Platform worker scheduler and conduct scan queue",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "membership.bulk_invites",
    title: "Bulk Invitations",
    categoryKey: "membership-support",
    area: "Membership",
    description: "Allows authorized accounts to parse a list of email addresses and queue individually coded invitation emails.",
    effectWhenDisabled: "Bulk invitation controls are hidden and no new bulk batch can be created. Single invitations continue to work.",
    enforcement: "Settings visibility and bulk invitation service",
    risk: "high",
    defaultEnabled: true
  },
  {
    key: "support.feedback_center",
    title: "Feedback Center",
    categoryKey: "membership-support",
    area: "Support",
    description: "Allows members to submit support requests, problem reports, and feature suggestions.",
    effectWhenDisabled: "The Settings link is hidden, the page shows unavailable, and ticket submission is rejected.",
    enforcement: "Settings navigation, feedback page, and feedback API",
    risk: "medium",
    defaultEnabled: true
  }
] as const;

export type RegisteredFeatureFlagKey = (typeof FEATURE_FLAG_DEFINITIONS)[number]["key"];
export type RegisteredFeatureFlagDefinition = (typeof FEATURE_FLAG_DEFINITIONS)[number];
export type FeatureFlagCategoryKey = (typeof FEATURE_FLAG_CATEGORIES)[number]["key"];
export type FeatureFlagCategoryDefinition = (typeof FEATURE_FLAG_CATEGORIES)[number];

export type RegisteredFeatureFlagView = RegisteredFeatureFlagDefinition & {
  enabled: boolean;
  source: "default" | "override";
  overrideDescription: string | null;
  updatedAt: string | null;
};

const definitionMap = new Map<string, RegisteredFeatureFlagDefinition>(
  FEATURE_FLAG_DEFINITIONS.map((definition) => [definition.key, definition])
);
const categoryMap = new Map<string, FeatureFlagCategoryDefinition>(
  FEATURE_FLAG_CATEGORIES.map((category) => [category.key, category])
);

export function getRegisteredFeatureFlag(key: unknown) {
  return typeof key === "string" ? definitionMap.get(key) ?? null : null;
}

export function getFeatureFlagCategory(key: unknown) {
  return typeof key === "string" ? categoryMap.get(key) ?? null : null;
}

export async function isFeatureEnabled(key: RegisteredFeatureFlagKey) {
  const definition = definitionMap.get(key);
  if (!definition) throw new Error(`Feature flag ${key} is not registered.`);
  const override = await prisma.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
  return override?.enabled ?? definition.defaultEnabled;
}

export async function listRegisteredFeatureFlags(): Promise<RegisteredFeatureFlagView[]> {
  const overrides = await prisma.featureFlag.findMany({
    where: { key: { in: FEATURE_FLAG_DEFINITIONS.map((definition) => definition.key) } },
    orderBy: { key: "asc" }
  });
  const overrideMap = new Map(overrides.map((override) => [override.key, override]));
  return FEATURE_FLAG_DEFINITIONS.map((definition) => {
    const override = overrideMap.get(definition.key);
    return {
      ...definition,
      enabled: override?.enabled ?? definition.defaultEnabled,
      source: override ? "override" : "default",
      overrideDescription: override?.description ?? null,
      updatedAt: override?.updatedAt.toISOString() ?? null
    };
  });
}

async function canManageFeatureFlags(actorUserId: string) {
  const user = await prisma.user.findUnique({ where: { id: actorUserId }, select: { role: true, deactivatedAt: true } });
  return Boolean(user && !user.deactivatedAt && (user.role === UserRole.ADMIN || user.role === UserRole.GOD));
}

function cleanReason(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, 1000) : "";
}

export async function setRegisteredFeatureFlag(actorUserId: string, input: unknown) {
  if (!(await canManageFeatureFlags(actorUserId))) return { ok: false as const, error: "Admin access required." };
  const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const definition = getRegisteredFeatureFlag(body.key);
  if (!definition) return { ok: false as const, error: "Choose a registered feature from the catalog." };
  if (typeof body.enabled !== "boolean") return { ok: false as const, error: "Choose whether the feature is enabled." };
  const reason = cleanReason(body.reason);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific reason of at least 10 characters." };

  const flag = await prisma.$transaction(async (transaction) => {
    const saved = await transaction.featureFlag.upsert({
      where: { key: definition.key },
      update: { enabled: body.enabled as boolean, description: reason },
      create: { key: definition.key, enabled: body.enabled as boolean, description: reason }
    });
    await transaction.adminAction.create({
      data: {
        actorUserId,
        actionKey: "feature-flags",
        module: "feature-flags",
        status: "completed",
        metadata: { key: definition.key, enabled: body.enabled, reason } as Prisma.InputJsonObject
      }
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        module: "feature-flags",
        action: body.enabled ? "feature_enabled" : "feature_disabled",
        targetType: "FeatureFlag",
        targetId: saved.id,
        severity: definition.risk === "high" ? "warning" : "info",
        metadata: { key: definition.key, title: definition.title, reason, enforcedAt: definition.enforcement } as Prisma.InputJsonObject
      }
    });
    return saved;
  });
  return { ok: true as const, flag };
}

export async function setRegisteredFeatureFlagCategory(actorUserId: string, input: unknown) {
  if (!(await canManageFeatureFlags(actorUserId))) return { ok: false as const, error: "Admin access required." };
  const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const category = getFeatureFlagCategory(body.categoryKey);
  if (!category) return { ok: false as const, error: "Choose a registered feature category." };
  if (typeof body.enabled !== "boolean") return { ok: false as const, error: "Choose whether the category is enabled." };
  const reason = cleanReason(body.reason);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific reason of at least 10 characters." };
  const definitions = FEATURE_FLAG_DEFINITIONS.filter((definition) => definition.categoryKey === category.key);
  const enabled = body.enabled;

  await prisma.$transaction(async (transaction) => {
    for (const definition of definitions) {
      await transaction.featureFlag.upsert({
        where: { key: definition.key },
        update: { enabled, description: reason },
        create: { key: definition.key, enabled, description: reason }
      });
    }
    await transaction.adminAction.create({
      data: {
        actorUserId,
        actionKey: "feature-flags",
        module: "feature-flags",
        status: "completed",
        metadata: {
          categoryKey: category.key,
          categoryTitle: category.title,
          enabled,
          featureKeys: definitions.map((definition) => definition.key),
          reason
        } as Prisma.InputJsonObject
      }
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        module: "feature-flags",
        action: enabled ? "feature_category_enabled" : "feature_category_disabled",
        targetType: "FeatureFlagCategory",
        targetId: category.key,
        severity: definitions.some((definition) => definition.risk === "high") ? "warning" : "info",
        metadata: {
          categoryKey: category.key,
          categoryTitle: category.title,
          enabled,
          featureKeys: definitions.map((definition) => definition.key),
          reason
        } as Prisma.InputJsonObject
      }
    });
  });

  return { ok: true as const };
}

export async function resetRegisteredFeatureFlag(actorUserId: string, input: unknown) {
  if (!(await canManageFeatureFlags(actorUserId))) return { ok: false as const, error: "Admin access required." };
  const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const definition = getRegisteredFeatureFlag(body.key);
  if (!definition) return { ok: false as const, error: "Choose a registered feature from the catalog." };
  const reason = cleanReason(body.reason);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific reset reason of at least 10 characters." };
  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.featureFlag.findUnique({ where: { key: definition.key } });
    if (existing) await transaction.featureFlag.delete({ where: { id: existing.id } });
    await transaction.adminAction.create({
      data: {
        actorUserId,
        actionKey: "feature-flags",
        module: "feature-flags",
        status: "completed",
        metadata: { key: definition.key, resetToDefault: definition.defaultEnabled, reason } as Prisma.InputJsonObject
      }
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        module: "feature-flags",
        action: "feature_reset_to_default",
        targetType: "FeatureFlag",
        targetId: definition.key,
        severity: definition.risk === "high" ? "warning" : "info",
        metadata: { key: definition.key, defaultEnabled: definition.defaultEnabled, reason } as Prisma.InputJsonObject
      }
    });
  });
  return { ok: true as const };
}
