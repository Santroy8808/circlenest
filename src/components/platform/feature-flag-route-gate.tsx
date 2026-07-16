import { notFound } from "next/navigation";
import {
  isFeatureEnabled,
  type RegisteredFeatureFlagKey
} from "@/modules/feature-flags/feature-flags.service";

export async function FeatureFlagRouteGate({
  children,
  featureKey
}: {
  children: React.ReactNode;
  featureKey: RegisteredFeatureFlagKey;
}) {
  if (!(await isFeatureEnabled(featureKey))) notFound();
  return <>{children}</>;
}
