const MAX_CAMPAIGN_DAYS = 365;

export function resolveAdCampaignBudget(input: {
  ruleCredits: number;
  ruleDurationDays: number | null | undefined;
  fundraiserDiscount: boolean;
  requestedCredits?: number;
  requestedDurationDays?: number;
}) {
  const minimumCredits = Math.max(
    input.fundraiserDiscount ? Math.ceil(input.ruleCredits / 2) : input.ruleCredits,
    1
  );
  const baseDurationDays = Math.max(input.ruleDurationDays ?? 7, 1);
  const credits = input.requestedCredits ?? minimumCredits;

  if (!Number.isInteger(credits) || credits < minimumCredits) {
    return {
      ok: false as const,
      error: `This placement requires at least ${minimumCredits} credits.`
    };
  }

  const maximumDurationDays = Math.min(
    MAX_CAMPAIGN_DAYS,
    Math.max(baseDurationDays, Math.floor((credits / minimumCredits) * baseDurationDays))
  );
  const durationDays = input.requestedDurationDays ?? baseDurationDays;

  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > maximumDurationDays) {
    return {
      ok: false as const,
      error: `${credits} credits supports between 1 and ${maximumDurationDays} campaign days for this placement.`
    };
  }

  return {
    ok: true as const,
    credits,
    durationDays,
    minimumCredits,
    maximumDurationDays
  };
}
