import { MembershipTier } from "@prisma/client";

export const MEMBERSHIP_UPGRADE_HIGHLIGHT_DAYS = 30;
const HIGHLIGHT_WINDOW_MS = MEMBERSHIP_UPGRADE_HIGHLIGHT_DAYS * 24 * 60 * 60 * 1000;

export function hasActiveMembershipUpgradeHighlight(input: {
  tier: MembershipTier;
  tierActivatedAt: Date | null | undefined;
  now?: Date;
}) {
  if (input.tier === MembershipTier.FREE || !input.tierActivatedAt) return false;
  const elapsed = (input.now ?? new Date()).getTime() - input.tierActivatedAt.getTime();
  return elapsed >= 0 && elapsed < HIGHLIGHT_WINDOW_MS;
}
