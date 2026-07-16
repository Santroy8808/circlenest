import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureFlagRouteGate featureKey="community.groups">{children}</FeatureFlagRouteGate>;
}
