import Link from "next/link";
import { FEATURE_UNAVAILABLE_MESSAGE, FEATURE_UNAVAILABLE_TITLE } from "@/modules/feature-availability/feature-availability.service";

export function FeatureUnavailableNotice({
  featureLabel,
  backHref = "/production-zone",
  backLabel = "Back to Production Zone"
}: {
  featureLabel?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section className="surface rounded-md p-8 text-center">
      {featureLabel ? <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{featureLabel}</p> : null}
      <h1 className="mt-3 text-3xl font-semibold text-[var(--gold)]">{FEATURE_UNAVAILABLE_TITLE}</h1>
      <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{FEATURE_UNAVAILABLE_MESSAGE}</p>
      <Link className="btn-secondary mt-5 inline-block" href={backHref}>
        {backLabel}
      </Link>
    </section>
  );
}
