"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessProfileSummary } from "@/lib/business/business-profile";

type Props = {
  canCreate: boolean;
  accessReason: string | null;
  ownProfile: BusinessProfileSummary | null;
  publicProfiles: BusinessProfileSummary[];
};

type StepKey = "IDENTITY" | "CONTACT" | "LEGAL" | "STOREFRONT" | "REVIEW";

const steps: Array<{ key: StepKey; label: string }> = [
  { key: "IDENTITY", label: "Public Identity" },
  { key: "CONTACT", label: "Contact & Location" },
  { key: "LEGAL", label: "Legal & Processor" },
  { key: "STOREFRONT", label: "Storefront" },
  { key: "REVIEW", label: "Review" },
];

function clean(value: string) {
  return value.trim() || null;
}

function statusLabel(done: boolean) {
  return done ? "Ready" : "Needs info";
}

export function BusinessProfileManager({ canCreate, accessReason, ownProfile, publicProfiles }: Props) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepKey>("IDENTITY");
  const [businessName, setBusinessName] = useState(ownProfile?.businessName ?? "");
  const [legalBusinessName, setLegalBusinessName] = useState(ownProfile?.legalBusinessName ?? "");
  const [dbaName, setDbaName] = useState(ownProfile?.dbaName ?? "");
  const [entityType, setEntityType] = useState(ownProfile?.entityType ?? "");
  const [industry, setIndustry] = useState(ownProfile?.industry ?? "");
  const [tagline, setTagline] = useState(ownProfile?.tagline ?? "");
  const [description, setDescription] = useState(ownProfile?.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(ownProfile?.websiteUrl ?? "");
  const [supportEmail, setSupportEmail] = useState(ownProfile?.supportEmail ?? ownProfile?.contactEmail ?? "");
  const [publicContactEmail, setPublicContactEmail] = useState(ownProfile?.publicContactEmail ?? ownProfile?.contactEmail ?? "");
  const [publicContactPhone, setPublicContactPhone] = useState(ownProfile?.publicContactPhone ?? ownProfile?.contactPhone ?? "");
  const [businessPhone, setBusinessPhone] = useState(ownProfile?.businessPhone ?? ownProfile?.contactPhone ?? "");
  const [category, setCategory] = useState(ownProfile?.category ?? "");
  const [country, setCountry] = useState(ownProfile?.country ?? "");
  const [state, setState] = useState(ownProfile?.state ?? "");
  const [city, setCity] = useState(ownProfile?.city ?? "");
  const [postalCode, setPostalCode] = useState(ownProfile?.postalCode ?? "");
  const [streetAddress1, setStreetAddress1] = useState(ownProfile?.streetAddress1 ?? "");
  const [streetAddress2, setStreetAddress2] = useState(ownProfile?.streetAddress2 ?? "");
  const [timezone, setTimezone] = useState(ownProfile?.timezone ?? "");
  const [logoUrl, setLogoUrl] = useState(ownProfile?.logoUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(ownProfile?.bannerUrl ?? "");
  const [storefrontSlug, setStorefrontSlug] = useState(ownProfile?.storefrontSlug ?? "");
  const [storefrontEnabled, setStorefrontEnabled] = useState(ownProfile?.storefrontEnabled ?? false);
  const processorProvider = "STRIPE";
  const processorOnboardingStatus = ownProfile?.processorOnboardingStatus ?? "NOT_STARTED";
  const [isPublic, setIsPublic] = useState(ownProfile?.isPublic ?? true);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const completion = useMemo(() => {
    const publicIdentity = Boolean(businessName.trim() && tagline.trim() && description.trim());
    const contactLocation = Boolean(publicContactEmail.trim() && businessPhone.trim() && country.trim() && state.trim() && city.trim());
    const legalBusinessInfo = Boolean(legalBusinessName.trim() && entityType.trim());
    const paymentProcessorSetup = processorOnboardingStatus === "COMPLETE" || Boolean(ownProfile?.processorChargesEnabled && ownProfile?.processorPayoutsEnabled);
    const storefrontSetup = Boolean(storefrontSlug.trim());
    const reviewReady = publicIdentity && contactLocation && legalBusinessInfo && storefrontSetup;
    const values = [publicIdentity, contactLocation, legalBusinessInfo, paymentProcessorSetup, storefrontSetup, reviewReady];
    return {
      publicIdentity,
      contactLocation,
      legalBusinessInfo,
      paymentProcessorSetup,
      storefrontSetup,
      reviewReady,
      percent: Math.round((values.filter(Boolean).length / values.length) * 100),
    };
  }, [
    businessName,
    businessPhone,
    city,
    country,
    description,
    entityType,
    legalBusinessName,
    ownProfile?.processorChargesEnabled,
    ownProfile?.processorPayoutsEnabled,
    processorOnboardingStatus,
    publicContactEmail,
    state,
    storefrontSlug,
    tagline,
  ]);

  async function saveProfile() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/business-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          legalBusinessName: clean(legalBusinessName),
          dbaName: clean(dbaName),
          entityType: clean(entityType),
          industry: clean(industry),
          tagline: clean(tagline),
          description: clean(description),
          websiteUrl: clean(websiteUrl),
          contactEmail: clean(publicContactEmail),
          supportEmail: clean(supportEmail),
          publicContactEmail: clean(publicContactEmail),
          publicContactPhone: clean(publicContactPhone),
          contactPhone: clean(publicContactPhone),
          businessPhone: clean(businessPhone),
          category: clean(category),
          location: [city, state, country].filter(Boolean).join(", ") || null,
          country: clean(country),
          state: clean(state),
          city: clean(city),
          postalCode: clean(postalCode),
          streetAddress1: clean(streetAddress1),
          streetAddress2: clean(streetAddress2),
          timezone: clean(timezone),
          logoUrl: clean(logoUrl),
          bannerUrl: clean(bannerUrl),
          isPublic,
          storefrontSlug: clean(storefrontSlug),
          storefrontEnabled,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save company profile.");
        return;
      }
      setStatus("Company profile saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const canSave = canCreate && Boolean(businessName.trim());

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">Company Profile Setup</h2>
            <p className="text-sm text-slate-400">
              {canCreate ? "Build the company sub-profile that unlocks Biz tools." : accessReason ?? "Browse only."}
            </p>
          </div>
          <div className="min-w-40 rounded border border-[#304058] bg-[#101a2c] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d878]">Completion</p>
            <p className="text-xl font-semibold text-[var(--text-strong)]">{completion.percent}%</p>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((step) => {
            const active = activeStep === step.key;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setActiveStep(step.key)}
                className={
                  active
                    ? "rounded-[10px] border border-[#cdb66d]/40 bg-[#1a2030] px-3 py-2 text-sm text-white shadow-[inset_0_-2px_0_#d8c36f]"
                    : "rounded-[10px] border border-[#2c3951] px-3 py-2 text-sm text-slate-300 transition hover:border-[#4a5a78] hover:text-white"
                }
              >
                {step.label}
              </button>
            );
          })}
        </div>

        {activeStep === "IDENTITY" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} disabled={!canCreate} placeholder="Business name" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={dbaName} onChange={(event) => setDbaName(event.target.value)} disabled={!canCreate} placeholder="DBA name" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={tagline} onChange={(event) => setTagline(event.target.value)} disabled={!canCreate} placeholder="Tagline" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={industry} onChange={(event) => setIndustry(event.target.value)} disabled={!canCreate} placeholder="Industry" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={category} onChange={(event) => setCategory(event.target.value)} disabled={!canCreate} placeholder="Category" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} disabled={!canCreate} placeholder="Website URL" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} disabled={!canCreate} placeholder="Logo URL" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} disabled={!canCreate} placeholder="Banner URL" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canCreate} placeholder="Public company description" className="min-h-28 rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm md:col-span-2" />
          </div>
        ) : null}

        {activeStep === "CONTACT" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input value={publicContactEmail} onChange={(event) => setPublicContactEmail(event.target.value)} disabled={!canCreate} placeholder="Public contact email" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} disabled={!canCreate} placeholder="Support email" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={businessPhone} onChange={(event) => setBusinessPhone(event.target.value)} disabled={!canCreate} placeholder="Business phone" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={publicContactPhone} onChange={(event) => setPublicContactPhone(event.target.value)} disabled={!canCreate} placeholder="Public contact phone" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={streetAddress1} onChange={(event) => setStreetAddress1(event.target.value)} disabled={!canCreate} placeholder="Street address" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={streetAddress2} onChange={(event) => setStreetAddress2(event.target.value)} disabled={!canCreate} placeholder="Suite / unit" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={city} onChange={(event) => setCity(event.target.value)} disabled={!canCreate} placeholder="City" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={state} onChange={(event) => setState(event.target.value)} disabled={!canCreate} placeholder="State" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={country} onChange={(event) => setCountry(event.target.value)} disabled={!canCreate} placeholder="Country" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} disabled={!canCreate} placeholder="Postal code" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!canCreate} placeholder="Timezone" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
          </div>
        ) : null}

        {activeStep === "LEGAL" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input value={legalBusinessName} onChange={(event) => setLegalBusinessName(event.target.value)} disabled={!canCreate} placeholder="Legal business name" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <input value={entityType} onChange={(event) => setEntityType(event.target.value)} disabled={!canCreate} placeholder="Entity type" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <div className="rounded border border-[#304058] bg-[#101a2c] px-3 py-2 text-sm text-slate-300">
              Payment processor: {processorProvider === "STRIPE" ? "Stripe" : processorProvider}
            </div>
            <div className="rounded border border-[#304058] bg-[#101a2c] px-3 py-2 text-sm text-slate-300">
              Onboarding status: {processorOnboardingStatus.replaceAll("_", " ").toLowerCase()}
            </div>
            <p className="rounded border border-[#304058] bg-[#101a2c] p-3 text-xs text-slate-400 md:col-span-2">
              Payment onboarding is controlled through processor-hosted or admin-reviewed flows. Business owners can review readiness here, but cannot self-mark processor approval or payout status.
            </p>
          </div>
        ) : null}

        {activeStep === "STOREFRONT" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input value={storefrontSlug} onChange={(event) => setStorefrontSlug(event.target.value)} disabled={!canCreate} placeholder="Storefront slug" className="rounded border border-[#304058] bg-[#182232] px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 rounded border border-[#304058] bg-[#101a2c] px-3 py-2 text-sm text-slate-300">
              <input type="checkbox" checked={storefrontEnabled} onChange={(event) => setStorefrontEnabled(event.target.checked)} disabled={!canCreate || !completion.reviewReady} />
              Enable public storefront
            </label>
            <label className="flex items-center gap-2 rounded border border-[#304058] bg-[#101a2c] px-3 py-2 text-sm text-slate-300">
              <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} disabled={!canCreate} />
              Public business profile
            </label>
            {ownProfile?.storefrontSlug ? (
              <Link href="/production-zone/business/storefront" className="rounded border border-[#304058] px-3 py-2 text-sm text-amber-200 hover:bg-white/5">
                Open storefront settings
              </Link>
            ) : null}
          </div>
        ) : null}

        {activeStep === "REVIEW" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Public identity", completion.publicIdentity],
              ["Contact and location", completion.contactLocation],
              ["Legal business info", completion.legalBusinessInfo],
              ["Payment processor setup", completion.paymentProcessorSetup],
              ["Storefront setup", completion.storefrontSetup],
              ["Review ready", completion.reviewReady],
            ].map(([label, done]) => (
              <div key={String(label)} className="rounded border border-[#304058] bg-[#101a2c] p-3">
                <p className="text-sm font-semibold text-[var(--text-strong)]">{label}</p>
                <p className={done ? "text-xs text-emerald-200" : "text-xs text-amber-200"}>{statusLabel(Boolean(done))}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <p className="text-xs text-slate-400">
            Status: {ownProfile?.status ?? "NEW"} / Verification: {ownProfile?.verificationStatus ?? "PENDING"}
          </p>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void saveProfile()}
            className="rounded-[10px] border border-[#6a5420] bg-[#c49a35] px-4 py-2 text-sm font-semibold text-[#1a1204] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : ownProfile ? "Save company profile" : "Create company profile"}
          </button>
        </div>
        {status ? <p className="text-xs text-slate-300">{status}</p> : null}
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Public Business Profiles</h2>
          <p className="text-xs text-slate-400">Browse public profiles on the platform.</p>
        </div>
        <div className="space-y-2">
          {publicProfiles.length ? (
            publicProfiles.map((profile) => (
              <article key={profile.id} className="rounded border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{profile.businessName}</p>
                    <p className="text-xs text-slate-400">@{profile.owner.username}{profile.owner.fullName ? ` - ${profile.owner.fullName}` : ""}</p>
                  </div>
                  <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {profile.category || "Business"}
                  </span>
                </div>
                {profile.tagline ? <p className="mt-2 text-sm text-slate-300">{profile.tagline}</p> : null}
                {profile.description ? <p className="mt-2 text-sm text-slate-400">{profile.description}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {profile.storefrontEnabled && profile.storefrontSlug ? (
                    <Link href={`/storefront/${profile.storefrontSlug}`} className="rounded-full border border-amber-300/40 px-3 py-1 text-amber-200 transition hover:bg-amber-300/10">
                      Storefront
                    </Link>
                  ) : null}
                  <span className="rounded-full border border-[#304058] px-3 py-1 text-slate-400">{profile.location || "No location"}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No public business profiles yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
