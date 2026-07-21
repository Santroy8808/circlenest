import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

export type ApiControlledFeatureKey = "publishing.writers_corner" | "directory.auditor_directory";

const UNAVAILABLE_MESSAGES: Record<ApiControlledFeatureKey, string> = {
  "publishing.writers_corner": "Writers Corner is temporarily unavailable.",
  "directory.auditor_directory": "Auditor Directory is temporarily unavailable."
};

export function platformApiFeatureAccessDecision(featureKey: ApiControlledFeatureKey, enabled: boolean) {
  if (enabled) return { allowed: true as const };

  return {
    allowed: false as const,
    status: 503 as const,
    code: "FEATURE_UNAVAILABLE" as const,
    error: UNAVAILABLE_MESSAGES[featureKey]
  };
}

export async function resolvePlatformApiFeatureAccess(featureKey: ApiControlledFeatureKey) {
  return platformApiFeatureAccessDecision(featureKey, await isFeatureEnabled(featureKey));
}
