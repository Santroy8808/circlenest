import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return <FeatureFlagRouteGate featureKey="marketplace.member_market">{children}</FeatureFlagRouteGate>;
}
