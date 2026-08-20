import { AppShell } from "@/components/platform/app-shell";
import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureFlagRouteGate featureKey="marketplace.focused_rollout">
      <AppShell>{children}</AppShell>
    </FeatureFlagRouteGate>
  );
}
