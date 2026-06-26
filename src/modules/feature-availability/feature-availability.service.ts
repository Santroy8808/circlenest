import { writeAuditLog } from "@/lib/platform/audit";

export const FEATURE_UNAVAILABLE_TITLE = "This feature is not yet available";
export const FEATURE_UNAVAILABLE_MESSAGE = "This feature is in development and is not yet available from this account right now.";

type UnavailableFeatureHrefInput = {
  featureKey: string;
  label?: string;
  requestedPath?: string;
  from?: string;
};

export function unavailableFeatureHref(input: UnavailableFeatureHrefInput) {
  const params = new URLSearchParams();
  params.set("featureKey", input.featureKey);
  if (input.label) params.set("label", input.label);
  if (input.requestedPath) params.set("requestedPath", input.requestedPath);
  if (input.from) params.set("from", input.from);
  return `/features/unavailable?${params.toString()}`;
}

export async function logUnavailableFeatureClick(input: {
  actorUserId?: string;
  featureKey: string;
  label?: string;
  requestedPath?: string;
  from?: string;
  source: "unavailable-page" | "route-gate";
  reason?: string;
}) {
  const metadata: Record<string, string> = {
    source: input.source
  };
  if (input.label) metadata.label = input.label;
  if (input.requestedPath) metadata.requestedPath = input.requestedPath;
  if (input.from) metadata.from = input.from;
  if (input.reason) metadata.reason = input.reason;

  await writeAuditLog({
    actorUserId: input.actorUserId,
    module: "feature-availability",
    action: "feature.unavailable.clicked",
    targetType: "feature",
    targetId: input.featureKey,
    severity: "info",
    metadata
  });
}
