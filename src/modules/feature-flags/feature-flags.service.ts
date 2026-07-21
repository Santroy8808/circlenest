import { randomUUID } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
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
  version: number;
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
      version: override?.version ?? 0,
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

function commandBody(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function commandIdFrom(body: Record<string, unknown>) {
  if (body.commandId === undefined || body.commandId === null || body.commandId === "") return randomUUID();
  if (typeof body.commandId !== "string") return null;
  const commandId = body.commandId.trim();
  return commandId.length >= 8 && commandId.length <= 200 ? commandId : null;
}

function expectedVersionFrom(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function isFeatureFlagVersionMatch(expectedVersion: number | undefined, actualVersion: number) {
  return expectedVersion === undefined || expectedVersion === actualVersion;
}

class FeatureFlagVersionConflict extends Error {}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function flagSnapshot(flag: {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  displayName: string | null;
  category: string;
  sortOrder: number;
  version: number;
  updatedAt: Date;
}) {
  return {
    id: flag.id,
    key: flag.key,
    enabled: flag.enabled,
    description: flag.description,
    displayName: flag.displayName,
    category: flag.category,
    sortOrder: flag.sortOrder,
    version: flag.version,
    updatedAt: flag.updatedAt.toISOString()
  };
}

async function findFeatureCommandReplay(commandId: string) {
  const audit = await prisma.auditLog.findUnique({ where: { operationId: commandId } });
  if (!audit) return null;
  if (audit.module !== "feature-flags") {
    return { conflict: "That command id has already been used for another administrator operation." } as const;
  }
  return { audit } as const;
}

function isMatchingFeatureCommandReplay(
  audit: NonNullable<Awaited<ReturnType<typeof prisma.auditLog.findUnique>>>,
  expected: {
    actorUserId: string;
    action: string;
    target: { type: string; id: string };
    fingerprint: string;
  }
) {
  return audit.module === "feature-flags" && isMatchingCommandFingerprint(audit, expected);
}

function replayConflict(message: string) {
  return { ok: false as const, error: message, code: "COMMAND_ID_CONFLICT" as const };
}

export async function setRegisteredFeatureFlag(actorUserId: string, input: unknown) {
  if (!(await canManageFeatureFlags(actorUserId))) return { ok: false as const, error: "Admin access required." };
  const body = commandBody(input);
  const definition = getRegisteredFeatureFlag(body.key);
  if (!definition) return { ok: false as const, error: "Choose a registered feature from the catalog." };
  if (typeof body.enabled !== "boolean") return { ok: false as const, error: "Choose whether the feature is enabled." };
  const reason = cleanReason(body.reason);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific reason of at least 10 characters." };
  const commandId = commandIdFrom(body);
  if (!commandId) return { ok: false as const, error: "Provide a valid command id." };
  const expectedVersion = expectedVersionFrom(body.expectedVersion);
  if (expectedVersion === null) return { ok: false as const, error: "Expected version must be a whole number." };
  const enabled = body.enabled;
  const action = enabled ? "feature_enabled" : "feature_disabled";
  const target = { type: "FeatureFlag", id: definition.key };
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: { enabled, reason, expectedVersion }
  });
  const replay = await findFeatureCommandReplay(commandId);
  if (replay) {
    if ("conflict" in replay) return replayConflict(replay.conflict ?? "That command id is already in use.");
    if (!isMatchingFeatureCommandReplay(replay.audit, { actorUserId, action, target, fingerprint: commandFingerprint })) {
      return replayConflict("That command id has already been used for a different feature-flag operation.");
    }
    const flag = await prisma.featureFlag.findUnique({ where: { key: definition.key } });
    return { ok: true as const, commandId, auditLogId: replay.audit.id, replayed: true as const, flag };
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.featureFlag.findUnique({ where: { key: definition.key } });
      const actualVersion = current?.version ?? 0;
      if (!isFeatureFlagVersionMatch(expectedVersion, actualVersion)) {
        throw new FeatureFlagVersionConflict(`Feature changed from version ${expectedVersion} to ${actualVersion}.`);
      }

      const data = {
        enabled,
        description: reason,
        displayName: definition.title,
        category: definition.categoryKey,
        sortOrder: FEATURE_FLAG_DEFINITIONS.indexOf(definition),
        updatedByUserId: actorUserId
      };
      let saved;
      if (current) {
        const changed = await transaction.featureFlag.updateMany({
          where: { id: current.id, version: actualVersion },
          data: { ...data, version: { increment: 1 } }
        });
        if (changed.count !== 1) throw new FeatureFlagVersionConflict("Feature changed while the command was being applied.");
        saved = await transaction.featureFlag.findUniqueOrThrow({ where: { id: current.id } });
      } else {
        saved = await transaction.featureFlag.create({ data: { key: definition.key, ...data, version: 1 } });
      }

      await transaction.adminAction.create({
        data: {
          actorUserId,
          actionKey: "feature-flags",
          module: "feature-flags",
          status: "completed",
          metadata: { commandId, key: definition.key, enabled, reason } as Prisma.InputJsonObject
        }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: commandId,
          requestId: commandId,
          actorUserId,
          module: "feature-flags",
          action,
          targetType: target.type,
          targetId: target.id,
          severity: definition.risk === "high" ? "warning" : "info",
          outcome: "SUCCESS",
          before: current ? (flagSnapshot(current) as Prisma.InputJsonObject) : Prisma.JsonNull,
          after: flagSnapshot(saved) as Prisma.InputJsonObject,
          metadata: {
            commandId,
            commandFingerprint,
            key: definition.key,
            recordId: saved.id,
            title: definition.title,
            reason,
            enforcedAt: definition.enforcement
          } as Prisma.InputJsonObject
        }
      });
      return { flag: saved, auditLogId: audit.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true as const, commandId, auditLogId: result.auditLogId, replayed: false as const, flag: result.flag };
  } catch (error) {
    if (error instanceof FeatureFlagVersionConflict) return { ok: false as const, error: error.message, code: "VERSION_CONFLICT" as const };
    if (isUniqueConstraintError(error)) {
      const duplicate = await findFeatureCommandReplay(commandId);
      if (duplicate && !("conflict" in duplicate)) {
        if (isMatchingFeatureCommandReplay(duplicate.audit, { actorUserId, action, target, fingerprint: commandFingerprint })) {
          const flag = await prisma.featureFlag.findUnique({ where: { key: definition.key } });
          return { ok: true as const, commandId, auditLogId: duplicate.audit.id, replayed: true as const, flag };
        }
      }
      if (duplicate) return replayConflict("That command id has already been used for a different administrator operation.");
      return { ok: false as const, error: "Feature changed while the command was being applied.", code: "VERSION_CONFLICT" as const };
    }
    throw error;
  }
}

export async function setRegisteredFeatureFlagCategory(actorUserId: string, input: unknown) {
  if (!(await canManageFeatureFlags(actorUserId))) return { ok: false as const, error: "Admin access required." };
  const body = commandBody(input);
  const category = getFeatureFlagCategory(body.categoryKey);
  if (!category) return { ok: false as const, error: "Choose a registered feature category." };
  if (typeof body.enabled !== "boolean") return { ok: false as const, error: "Choose whether the category is enabled." };
  const reason = cleanReason(body.reason);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific reason of at least 10 characters." };
  const definitions = FEATURE_FLAG_DEFINITIONS.filter((definition) => definition.categoryKey === category.key);
  const enabled = body.enabled;
  const commandId = commandIdFrom(body);
  if (!commandId) return { ok: false as const, error: "Provide a valid command id." };
  const expectedVersionsInput = body.expectedVersions;
  const expectedVersions =
    expectedVersionsInput && typeof expectedVersionsInput === "object" && !Array.isArray(expectedVersionsInput)
      ? (expectedVersionsInput as Record<string, unknown>)
      : {};
  const normalizedExpectedVersions: Record<string, number | undefined> = {};
  for (const definition of definitions) {
    const suppliedVersion = expectedVersionFrom(expectedVersions[definition.key]);
    if (suppliedVersion === null) {
      return { ok: false as const, error: `Invalid expected version for ${definition.title}.`, code: "VERSION_CONFLICT" as const };
    }
    normalizedExpectedVersions[definition.key] = suppliedVersion;
  }
  const action = enabled ? "feature_category_enabled" : "feature_category_disabled";
  const target = { type: "FeatureFlagCategory", id: category.key };
  const featureKeys = definitions.map((definition) => definition.key);
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: { enabled, reason, expectedVersions: normalizedExpectedVersions, featureKeys }
  });
  const replay = await findFeatureCommandReplay(commandId);
  if (replay) {
    if ("conflict" in replay) return replayConflict(replay.conflict ?? "That command id is already in use.");
    if (!isMatchingFeatureCommandReplay(replay.audit, { actorUserId, action, target, fingerprint: commandFingerprint })) {
      return replayConflict("That command id has already been used for a different feature-flag operation.");
    }
    const flags = await prisma.featureFlag.findMany({ where: { key: { in: definitions.map((definition) => definition.key) } } });
    return { ok: true as const, commandId, auditLogId: replay.audit.id, replayed: true as const, flags };
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const currentFlags = await transaction.featureFlag.findMany({ where: { key: { in: definitions.map((item) => item.key) } } });
      const currentMap = new Map(currentFlags.map((flag) => [flag.key, flag]));
      const savedFlags = [];
      for (const definition of definitions) {
        const current = currentMap.get(definition.key);
        const suppliedVersion = normalizedExpectedVersions[definition.key];
        const actualVersion = current?.version ?? 0;
        if (!isFeatureFlagVersionMatch(suppliedVersion, actualVersion)) {
          throw new FeatureFlagVersionConflict(`${definition.title} changed from version ${suppliedVersion} to ${actualVersion}.`);
        }
        const data = {
          enabled,
          description: reason,
          displayName: definition.title,
          category: definition.categoryKey,
          sortOrder: FEATURE_FLAG_DEFINITIONS.indexOf(definition),
          updatedByUserId: actorUserId
        };
        if (current) {
          const changed = await transaction.featureFlag.updateMany({
            where: { id: current.id, version: actualVersion },
            data: { ...data, version: { increment: 1 } }
          });
          if (changed.count !== 1) throw new FeatureFlagVersionConflict(`${definition.title} changed while the category command was being applied.`);
          savedFlags.push(await transaction.featureFlag.findUniqueOrThrow({ where: { id: current.id } }));
        } else {
          savedFlags.push(await transaction.featureFlag.create({ data: { key: definition.key, ...data, version: 1 } }));
        }
      }
      await transaction.adminAction.create({
        data: {
          actorUserId,
          actionKey: "feature-flags",
          module: "feature-flags",
          status: "completed",
          metadata: { commandId, categoryKey: category.key, enabled, featureKeys, reason } as Prisma.InputJsonObject
        }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: commandId,
          requestId: commandId,
          actorUserId,
          module: "feature-flags",
          action,
          targetType: target.type,
          targetId: target.id,
          severity: definitions.some((definition) => definition.risk === "high") ? "warning" : "info",
          outcome: "SUCCESS",
          before: currentFlags.map(flagSnapshot) as Prisma.InputJsonArray,
          after: savedFlags.map(flagSnapshot) as Prisma.InputJsonArray,
          metadata: {
            commandId,
            commandFingerprint,
            categoryKey: category.key,
            categoryTitle: category.title,
            enabled,
            featureKeys,
            reason
          } as Prisma.InputJsonObject
        }
      });
      return { auditLogId: audit.id, flags: savedFlags };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true as const, commandId, auditLogId: result.auditLogId, replayed: false as const, flags: result.flags };
  } catch (error) {
    if (error instanceof FeatureFlagVersionConflict) return { ok: false as const, error: error.message, code: "VERSION_CONFLICT" as const };
    if (isUniqueConstraintError(error)) {
      const duplicate = await findFeatureCommandReplay(commandId);
      if (
        duplicate &&
        !("conflict" in duplicate) &&
        isMatchingFeatureCommandReplay(duplicate.audit, { actorUserId, action, target, fingerprint: commandFingerprint })
      ) {
        const flags = await prisma.featureFlag.findMany({ where: { key: { in: definitions.map((definition) => definition.key) } } });
        return { ok: true as const, commandId, auditLogId: duplicate.audit.id, replayed: true as const, flags };
      }
      if (duplicate) return replayConflict("That command id has already been used for a different administrator operation.");
      return { ok: false as const, error: "A feature in this category changed while the command was being applied.", code: "VERSION_CONFLICT" as const };
    }
    throw error;
  }
}

export async function resetRegisteredFeatureFlag(actorUserId: string, input: unknown) {
  if (!(await canManageFeatureFlags(actorUserId))) return { ok: false as const, error: "Admin access required." };
  const body = commandBody(input);
  const definition = getRegisteredFeatureFlag(body.key);
  if (!definition) return { ok: false as const, error: "Choose a registered feature from the catalog." };
  const reason = cleanReason(body.reason);
  if (reason.length < 10) return { ok: false as const, error: "Enter a specific reset reason of at least 10 characters." };
  const commandId = commandIdFrom(body);
  if (!commandId) return { ok: false as const, error: "Provide a valid command id." };
  const expectedVersion = expectedVersionFrom(body.expectedVersion);
  if (expectedVersion === null) return { ok: false as const, error: "Expected version must be a whole number." };
  const action = "feature_reset_to_default";
  const target = { type: "FeatureFlag", id: definition.key };
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: { reason, expectedVersion, defaultEnabled: definition.defaultEnabled }
  });
  const replay = await findFeatureCommandReplay(commandId);
  if (replay) {
    if ("conflict" in replay) return replayConflict(replay.conflict ?? "That command id is already in use.");
    if (!isMatchingFeatureCommandReplay(replay.audit, { actorUserId, action, target, fingerprint: commandFingerprint })) {
      return replayConflict("That command id has already been used for a different feature-flag operation.");
    }
    return { ok: true as const, commandId, auditLogId: replay.audit.id, replayed: true as const };
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.featureFlag.findUnique({ where: { key: definition.key } });
      const actualVersion = existing?.version ?? 0;
      if (!isFeatureFlagVersionMatch(expectedVersion, actualVersion)) {
        throw new FeatureFlagVersionConflict(`Feature changed from version ${expectedVersion} to ${actualVersion}.`);
      }
      if (existing) {
        const removed = await transaction.featureFlag.deleteMany({ where: { id: existing.id, version: actualVersion } });
        if (removed.count !== 1) throw new FeatureFlagVersionConflict("Feature changed while the reset command was being applied.");
      }
      await transaction.adminAction.create({
        data: {
          actorUserId,
          actionKey: "feature-flags",
          module: "feature-flags",
          status: "completed",
          metadata: { commandId, key: definition.key, resetToDefault: definition.defaultEnabled, reason } as Prisma.InputJsonObject
        }
      });
      const audit = await transaction.auditLog.create({
        data: {
          operationId: commandId,
          requestId: commandId,
          actorUserId,
          module: "feature-flags",
          action,
          targetType: target.type,
          targetId: target.id,
          severity: definition.risk === "high" ? "warning" : "info",
          outcome: "SUCCESS",
          before: existing ? (flagSnapshot(existing) as Prisma.InputJsonObject) : Prisma.JsonNull,
          after: { key: definition.key, enabled: definition.defaultEnabled, source: "default" } as Prisma.InputJsonObject,
          metadata: { commandId, commandFingerprint, key: definition.key, defaultEnabled: definition.defaultEnabled, reason } as Prisma.InputJsonObject
        }
      });
      return audit.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ok: true as const, commandId, auditLogId: result, replayed: false as const };
  } catch (error) {
    if (error instanceof FeatureFlagVersionConflict) return { ok: false as const, error: error.message, code: "VERSION_CONFLICT" as const };
    if (isUniqueConstraintError(error)) {
      const duplicate = await findFeatureCommandReplay(commandId);
      if (
        duplicate &&
        !("conflict" in duplicate) &&
        isMatchingFeatureCommandReplay(duplicate.audit, { actorUserId, action, target, fingerprint: commandFingerprint })
      ) {
        return { ok: true as const, commandId, auditLogId: duplicate.audit.id, replayed: true as const };
      }
      if (duplicate) return replayConflict("That command id has already been used for a different administrator operation.");
      return { ok: false as const, error: "Feature changed while the reset command was being applied.", code: "VERSION_CONFLICT" as const };
    }
    throw error;
  }
}
