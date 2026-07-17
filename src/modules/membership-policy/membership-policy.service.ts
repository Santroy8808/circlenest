import { MembershipTier, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isGodRole } from "@/lib/platform/roles";
import { verifyPassword } from "@/modules/auth-security/password";
import {
  canRoleBypassFeature,
  getTierPolicy,
  isOperationalMembershipTier,
  isMembershipFeatureKey,
  type MembershipFeatureKey,
  membershipFeatureKeys,
  normalizeOperationalMembershipTier,
  tierPolicies
} from "@/modules/membership-policy/policy";
import { getActivePromotionalTierForUser } from "@/modules/membership-policy/launch-access.service";

const MODULE_KEY = "membership-policy";

type FeatureOverrideMap = Partial<Record<MembershipFeatureKey, boolean>>;

export type EffectivePolicy = ReturnType<typeof getTierPolicy> & {
  role: UserRole;
  actualTier: MembershipTier;
  promotionalAccess?: {
    tier: MembershipTier;
    label: string;
    expiresAt: string;
  };
  overrides: FeatureOverrideMap;
};

function applyFeatureOverrides(policy: ReturnType<typeof getTierPolicy>, overrides: FeatureOverrideMap) {
  return {
    ...policy,
    features: {
      ...policy.features,
      ...overrides
    }
  };
}

function mapOverrides(
  overrides: Array<{ tier?: MembershipTier; featureKey: string; allowed: boolean }>,
  tier?: MembershipTier
) {
  return overrides.reduce<FeatureOverrideMap>((acc, override) => {
    if ((tier === undefined || override.tier === tier) && isMembershipFeatureKey(override.featureKey)) {
      acc[override.featureKey] = override.allowed;
    }

    return acc;
  }, {});
}

async function listGlobalTierFeatureOverrides() {
  return prisma.membershipTierFeatureOverride.findMany({
    orderBy: [{ tier: "asc" }, { featureKey: "asc" }]
  });
}

export function getPolicyMatrix() {
  return Object.values(tierPolicies);
}

export function getPublicPolicyMatrix() {
  return getPolicyMatrix().filter((policy) => policy.operational && policy.publiclyListed !== false);
}

export async function getEffectivePolicyMatrix() {
  const globalOverrides = await listGlobalTierFeatureOverrides();

  return getPolicyMatrix().map((policy) => applyFeatureOverrides(policy, mapOverrides(globalOverrides, policy.tier)));
}

export async function getEffectivePublicPolicyMatrix() {
  return (await getEffectivePolicyMatrix()).filter((policy) => policy.operational && policy.publiclyListed !== false);
}

export function resolvePolicy(input: {
  tier?: MembershipTier | null;
  role?: UserRole | null;
  globalOverrides?: FeatureOverrideMap;
  overrides?: FeatureOverrideMap;
}): EffectivePolicy {
  const actualTier = input.tier ?? MembershipTier.FREE;
  const tier = normalizeOperationalMembershipTier(actualTier);
  const role = input.role ?? UserRole.MEMBER;
  const base = getTierPolicy(tier);
  const globalOverrides = input.globalOverrides ?? {};
  const overrides = input.overrides ?? {};

  return {
    ...base,
    role,
    actualTier,
    overrides,
    features: {
      ...base.features,
      ...globalOverrides,
      ...overrides,
      "admin.portal": role === UserRole.ADMIN || role === UserRole.GOD
    }
  };
}

export function evaluateFeatureAccess(
  policy: EffectivePolicy,
  featureKey: MembershipFeatureKey,
  upgradeCandidates = getPublicPolicyMatrix()
): { allowed: boolean; reason: string; upgradeTo?: MembershipTier } {
  if (canRoleBypassFeature(policy.role, featureKey)) {
    return { allowed: true, reason: "Admin role grants this platform control." };
  }

  if (policy.features[featureKey]) {
    return { allowed: true, reason: `${policy.displayName} includes this feature.` };
  }

  const upgradeTo = upgradeCandidates.find((candidate) => candidate.features[featureKey])?.tier;

  return {
    allowed: false,
    reason: upgradeTo
      ? `Upgrade to ${getTierPolicy(upgradeTo).displayName} to use this feature.`
      : "This feature requires an admin assignment or a future account capability.",
    upgradeTo
  };
}

export async function getEffectivePolicyForUser(userId: string) {
  const [user, globalOverrides] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: true,
        membershipOverrides: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
          }
        }
      }
    }),
    listGlobalTierFeatureOverrides()
  ]);

  if (!user) return null;

  const actualTier = user.membership?.tier ?? MembershipTier.FREE;
  const promotionalAccess = await getActivePromotionalTierForUser(user.id, actualTier);
  const requestedTier = promotionalAccess?.tier ?? actualTier;
  const effectiveTier = normalizeOperationalMembershipTier(requestedTier);

  const overrides = user.membershipOverrides.reduce<FeatureOverrideMap>((acc, override) => {
    if (isMembershipFeatureKey(override.featureKey)) {
      acc[override.featureKey] = override.allowed;
    }

    return acc;
  }, {});

  const policy = resolvePolicy({
    tier: effectiveTier,
    role: user.role,
    globalOverrides: mapOverrides(globalOverrides, effectiveTier),
    overrides
  });

  return {
    ...policy,
    actualTier,
    promotionalAccess: promotionalAccess
      ? {
          tier: promotionalAccess.tier,
          label: promotionalAccess.label,
          expiresAt: promotionalAccess.expiresAt.toISOString()
        }
      : undefined
  };
}

export async function canUserAccessFeature(userId: string, featureKey: string) {
  if (!isMembershipFeatureKey(featureKey)) {
    await diagnostics.warn(MODULE_KEY, "Unknown feature key requested.", { userId, featureKey });
    return { allowed: false, reason: "Unknown feature key." };
  }

  const [policy, upgradeCandidates] = await Promise.all([
    getEffectivePolicyForUser(userId),
    getEffectivePublicPolicyMatrix()
  ]);

  if (!policy) {
    return { allowed: false, reason: "User was not found." };
  }

  return evaluateFeatureAccess(policy, featureKey, upgradeCandidates);
}

export async function getGodTierPolicyEditorView(actorUserId: string) {
  const [actor, policies, overrides] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { role: true }
    }),
    getEffectivePolicyMatrix().then((items) => items.filter((policy) => policy.operational)),
    listGlobalTierFeatureOverrides()
  ]);

  return {
    canManage: isGodRole(actor?.role),
    policies,
    overrides: overrides.map((override) => ({
      id: override.id,
      tier: override.tier,
      featureKey: override.featureKey,
      allowed: override.allowed,
      reason: override.reason,
      createdByUserId: override.createdByUserId,
      createdAt: override.createdAt.toISOString(),
      updatedAt: override.updatedAt.toISOString()
    }))
  };
}

export async function setGlobalTierFeatureOverride(input: {
  actorUserId: string;
  tier: MembershipTier;
  featureKey: string;
  allowed: boolean;
  password: string;
  reason?: string;
}) {
  if (!isOperationalMembershipTier(input.tier)) {
    return { ok: false as const, error: "That membership tier is currently disabled." };
  }

  if (!isMembershipFeatureKey(input.featureKey)) {
    return { ok: false as const, error: "Unknown feature key." };
  }

  if (input.featureKey === "admin.portal") {
    return { ok: false as const, error: "Admin Portal is role-based and cannot be tier-assigned." };
  }

  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: {
      id: true,
      role: true,
      passwordHash: true
    }
  });

  if (!actor || !isGodRole(actor.role)) {
    return { ok: false as const, error: "God access required." };
  }

  if (!actor.passwordHash || !(await verifyPassword(input.password, actor.passwordHash))) {
    return { ok: false as const, error: "Password confirmation failed." };
  }

  const previousAllowed = (await getEffectivePolicyMatrix()).find((policy) => policy.tier === input.tier)?.features[input.featureKey] ?? getTierPolicy(input.tier).features[input.featureKey];
  const reason = input.reason?.trim() || "God tier policy edit.";
  const override = await prisma.membershipTierFeatureOverride.upsert({
    where: {
      tier_featureKey: {
        tier: input.tier,
        featureKey: input.featureKey
      }
    },
    update: {
      allowed: input.allowed,
      reason,
      createdByUserId: input.actorUserId
    },
    create: {
      tier: input.tier,
      featureKey: input.featureKey,
      allowed: input.allowed,
      reason,
      createdByUserId: input.actorUserId
    }
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    module: MODULE_KEY,
    action: "tier.feature.override.set",
    targetType: "MembershipTier",
    targetId: input.tier,
    severity: "critical",
    metadata: {
      tier: input.tier,
      featureKey: input.featureKey,
      previousAllowed,
      allowed: input.allowed,
      reason
    } as Prisma.InputJsonObject
  });

  return { ok: true as const, override };
}

export async function setMembershipPolicyOverride(input: {
  actorUserId?: string;
  targetUserId: string;
  featureKey: string;
  allowed: boolean;
  reason?: string;
  expiresAt?: Date;
}) {
  if (!isMembershipFeatureKey(input.featureKey)) {
    return { ok: false as const, error: "Unknown feature key." };
  }

  const override = await prisma.membershipPolicyOverride.upsert({
    where: {
      userId_featureKey: {
        userId: input.targetUserId,
        featureKey: input.featureKey
      }
    },
    update: {
      allowed: input.allowed,
      reason: input.reason,
      expiresAt: input.expiresAt,
      createdByUserId: input.actorUserId
    },
    create: {
      userId: input.targetUserId,
      featureKey: input.featureKey,
      allowed: input.allowed,
      reason: input.reason,
      expiresAt: input.expiresAt,
      createdByUserId: input.actorUserId
    }
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    module: MODULE_KEY,
    action: "policy.override.set",
    targetType: "User",
    targetId: input.targetUserId,
    severity: "warning",
    metadata: {
      featureKey: input.featureKey,
      allowed: input.allowed,
      expiresAt: input.expiresAt?.toISOString()
    } as Prisma.InputJsonObject
  });

  return { ok: true as const, override };
}

export function getMembershipFeatureKeys() {
  return membershipFeatureKeys;
}
