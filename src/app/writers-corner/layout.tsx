import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function WritersCornerLayout({ children }: { children: React.ReactNode }) {
  return <FeatureFlagRouteGate featureKey="publishing.writers_corner">{children}</FeatureFlagRouteGate>;
}
