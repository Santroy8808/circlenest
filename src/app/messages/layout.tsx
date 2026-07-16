import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <FeatureFlagRouteGate featureKey="communication.direct_messages">{children}</FeatureFlagRouteGate>;
}
