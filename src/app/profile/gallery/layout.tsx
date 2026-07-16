import { FeatureFlagRouteGate } from "@/components/platform/feature-flag-route-gate";

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <FeatureFlagRouteGate featureKey="media.personal_gallery">{children}</FeatureFlagRouteGate>;
}
