import { auth } from "@/auth";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";

function readParam(value: string | string[] | undefined, fallback = "") {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? fallback).slice(0, 240);
}

export default async function FeatureUnavailablePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await auth();
  const featureKey = readParam(searchParams?.featureKey, "unknown");
  const label = readParam(searchParams?.label, "Feature");
  const requestedPath = readParam(searchParams?.requestedPath);
  const from = readParam(searchParams?.from);

  await logUnavailableFeatureClick({
    actorUserId: session?.user?.id,
    featureKey,
    label,
    requestedPath,
    from,
    source: "unavailable-page"
  });

  return (
    <AppShell>
      <FeatureUnavailableNotice featureLabel={label} />
    </AppShell>
  );
}
