import { ThetaLoading } from "@/components/platform/theta-loading";

export default function Loading() {
  return (
    <div className="theta-loading-page">
      <ThetaLoading className="theta-loading-panel" label="Loading" size="lg" />
    </div>
  );
}
