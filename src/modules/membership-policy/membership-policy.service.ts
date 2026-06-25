import { MembershipTier, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  canRoleBypassFeature,
  getTierPolicy,
  isMembershipFeatureKey,
  type MembershipFeatureKey,
  membershipFeatureKeys,
  tierPolicies
} from "@/modules/membership-policy/policy";
import { getActivePromotionalTierForUser } from "@/modules/membership-policy/launch-access.service";

const MODULE_KEY = "membership-policy";

export type EffectivePolicy = ReturnType<typeof getTierPolicy> & {
  role: UserRole;
  actualTier: MembershipTier;
  promotionalAccess?: {
    tier: MembershipTier;
    label: string;
    expiresAt: string;
  };
  overrides: Partial<Record<MembershipFeatureKey, boolean>>;
};

export function getPolicyMatrix() {
  return Object.values(tierPolicies);
}

export function getPublicPolicyMatrix() {
  return getPolicyMatrix().filter((policy) => policy.publiclyListed !== false);
}

export function resolvePolicy(input: {
  tier?: MembershipTier | null;
  role?: UserRole | null;
  overrides?: Partial<Record<MembershipFeatureKey, boolean>>;
}): EffectivePolicy {
  const tier = input.tier ?? MembershipTier.FREE;
  const role = input.role ?? UserRole.MEMBER;
  const base = getTierPolicy(tier);
  const overrides = input.overrides ?? {};

  return {
    ...base,
    role,
    actualTier: tier,
    overrides,
    features: {
      ...base.features,
      ...overrides,
      "admin.portal": role === UserRole.ADMIN
    }
  };
}

export function evaluateFeatureAccess(
  policy: EffectivePolicy,
  featureKey: MembershipFeatureKey
): { allowed: boolean; reason: string; upgradeTo?: MembershipTier } {
  if (canRoleBypassFeature(policy.role, featureKey)) {
    return { allowed: true, reason: "Admin role grants this platform control." };
  }

  if (policy.features[featureKey]) {
    return { allowed: true, reason: `${policy.displayName} includes this feature.` };
  }

  const upgradeTo = getPublicPolicyMatrix().find((candidate) => candidate.features[featureKey])?.tier;

  return {
    allowed: false,
    reason: upgradeTo
      ? `Upgrade to ${getTierPolicy(upgradeTo).displayName} to use this feature.`
      : "This feature requires an admin assignment or a future account capability.",
    upgradeTo
  };
}

export async function getEffectivePolicyForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      membership: true,
      membershipOverrides: {
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      }
    }
  });

  if (!user) return null;

  const actualTier = user.membership?.tier ?? MembershipTier.FREE;
  const promotionalAccess = await getActivePromotionalTierForUser(user.id, actualTier);
  const effectiveTier = promotionalAccess?.tier ?? actualTier;

  const overrides = user.membershipOverrides.reduce<Partial<Record<MembershipFeatureKey, boolean>>>((acc, override) => {
    if (isMembershipFeatureKey(override.featureKey)) {
      acc[override.featureKey] = override.allowed;
    }

    return acc;
  }, {});

  const policy = resolvePolicy({
    tier: effectiveTier,
    role: user.role,
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

  const policy = await getEffectivePolicyForUser(userId);

  if (!policy) {
    return { allowed: false, reason: "User was not found." };
  }

  return evaluateFeatureAccess(policy, featureKey);
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
