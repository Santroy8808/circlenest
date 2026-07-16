import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function AuditorsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureFlagRouteGate featureKey="directory.auditor_directory">{children}</FeatureFlagRouteGate>;
}
