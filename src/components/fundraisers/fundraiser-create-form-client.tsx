"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";
import { FUNDRAISER_TYPES, type FundraiserType } from "@/lib/fundraisers/fundraisers";

type FundraiserCreateFormClientProps = {
  canCreate: boolean;
};

const FUNDRAISER_TYPE_LABELS: Record<FundraiserType, string> = {
  CHARITY: "Charity",
  ORG: "Org",
  "4D_CAMPAIGN": "4D Campaign",
  OTHER: "Other",
};

const FUNDRAISER_FIELD_CLASS =
  "w-full rounded-lg border border-[#52647f] bg-[#253145] px-3 py-2 font-sans text-sm leading-5 text-[#f3f6fb] shadow-inner shadow-black/10 placeholder:text-slate-400 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/25 disabled:cursor-not-allowed disabled:bg-[#1b2435] disabled:text-slate-400";

export function FundraiserCreateFormClient({ canCreate }: FundraiserCreateFormClientProps) {
  const router = useRouter();
  const [organizerName, setOrganizerName] = useState("");
  const [fundraiserType, setFundraiserType] = useState<FundraiserType>("CHARITY");
  const [charityName, setCharityName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [locationCountry, setLocationCountry] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [currentOrg, setCurrentOrg] = useState("");
  const [currentService, setCurrentService] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [allowDirectMessages, setAllowDirectMessages] = useState(true);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const selectedLabel = useMemo(() => FUNDRAISER_TYPE_LABELS[fundraiserType], [fundraiserType]);

  async function handleBannerUpload(file: File | null) {
    if (!file) return;
    setUploadingBanner(true);
    setUploadStatus("");
    try {
      const result = await uploadImageWithCompression(file, { purpose: "fundraiser-banner" });
      if (!result.url) {
        setUploadStatus("Could not upload banner.");
        return;
      }
      setBannerUrl(result.url);
      setUploadStatus("Banner uploaded.");
    } finally {
      setUploadingBanner(false);
    }
  }

  async function submitForm() {
    setSubmitting(true);
    setStatus("");
    try {
      const response = await fetch("/api/fundraisers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizerName: organizerName.trim(),
          fundraiserType,
          charityName: charityName.trim() || null,
          organizationName: organizationName.trim() || null,
          campaignName: campaignName.trim() || null,
          otherDescription: otherDescription.trim() || null,
          title: title.trim(),
          description: description.trim(),
          goalAmount,
          locationCountry: locationCountry.trim(),
          locationState: locationState.trim(),
          locationCity: locationCity.trim(),
          currentOrg: currentOrg.trim() || null,
          currentService: currentService.trim() || null,
          additionalNotes: additionalNotes.trim() || null,
          bannerUrl,
          allowDirectMessages,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; fundraiser?: { id?: string } };
      if (!response.ok) {
        setStatus(payload.error ?? "Could not create fund raiser.");
        return;
      }
      const fundraiserId = payload.fundraiser?.id;
      if (!fundraiserId) {
        setStatus("Fund raiser created, but no destination was returned.");
        return;
      }
      router.push(`/fundraisers/${fundraiserId}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded border border-[var(--border)] bg-[#0d1320] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Create fund raiser</p>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">Tell people exactly what this campaign is for</h2>
          <p className="text-sm text-slate-400">Be specific. This is for transparency and trust.</p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
          {selectedLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Who are you?</span>
          <input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Your name or org name" />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">What is this for?</span>
          <select
            value={fundraiserType}
            onChange={(event) => setFundraiserType(event.target.value as FundraiserType)}
            disabled={!canCreate}
            className={FUNDRAISER_FIELD_CLASS}
          >
            {FUNDRAISER_TYPES.map((type) => (
              <option key={type} value={type}>
                {FUNDRAISER_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        {fundraiserType === "CHARITY" ? (
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Charity name</span>
            <input value={charityName} onChange={(event) => setCharityName(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Name of the charity" />
          </label>
        ) : null}

        {fundraiserType === "ORG" ? (
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Organization name</span>
            <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Name of the org" />
          </label>
        ) : null}

        {fundraiserType === "4D_CAMPAIGN" ? (
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">4D campaign name</span>
            <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Campaign name" />
          </label>
        ) : null}

        {fundraiserType === "OTHER" ? (
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-slate-300">Explain</span>
            <textarea value={otherDescription} onChange={(event) => setOtherDescription(event.target.value)} disabled={!canCreate} className={`${FUNDRAISER_FIELD_CLASS} min-h-24`} placeholder="Tell people what this fundraiser is for" />
          </label>
        ) : null}

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-slate-300">Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Fund raiser title" />
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-slate-300">Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canCreate} className={`${FUNDRAISER_FIELD_CLASS} min-h-28`} placeholder="What are you raising money for?" />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Goal amount</span>
          <input value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} disabled={!canCreate} type="number" min="0" step="0.01" className={FUNDRAISER_FIELD_CLASS} placeholder="0.00" />
        </label>

        <div className="space-y-1 text-sm">
          <span className="text-slate-300">Banner</span>
          <label className="inline-flex cursor-pointer items-center rounded border border-[#3d4e6d] bg-[#1a2335] px-3 py-2 text-xs text-slate-200 hover:bg-[#243149]">
            {uploadingBanner ? "Uploading..." : bannerUrl ? "Replace banner" : "Upload banner"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingBanner || !canCreate}
              onChange={(event) => {
                void handleBannerUpload(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {bannerUrl ? (
            <div className="mt-2 overflow-hidden rounded border border-[var(--border)] bg-[#0b1220]">
              <Image src={bannerUrl} alt="Fund raiser banner preview" width={1200} height={420} unoptimized className="h-36 w-full object-cover" />
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-400">
                <span>Banner attached</span>
                <button type="button" className="underline" onClick={() => setBannerUrl(null)}>
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          {uploadStatus ? <p className="text-xs text-slate-400">{uploadStatus}</p> : null}
        </div>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Country</span>
          <input value={locationCountry} onChange={(event) => setLocationCountry(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Country" />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">State</span>
          <input value={locationState} onChange={(event) => setLocationState(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="State" />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">City</span>
          <input value={locationCity} onChange={(event) => setLocationCity(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="City" />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Your current org</span>
          <input value={currentOrg} onChange={(event) => setCurrentOrg(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Optional" />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Your current service</span>
          <input value={currentService} onChange={(event) => setCurrentService(event.target.value)} disabled={!canCreate} className={FUNDRAISER_FIELD_CLASS} placeholder="Optional" />
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-slate-300">Anything else that should be part of the campaign</span>
          <textarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} disabled={!canCreate} className={`${FUNDRAISER_FIELD_CLASS} min-h-24`} placeholder="Add any extra notes" />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
          <input type="checkbox" checked={allowDirectMessages} onChange={(event) => setAllowDirectMessages(event.target.checked)} disabled={!canCreate} />
          Allow people to DM me about this fundraiser
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canCreate || submitting}
          onClick={() => void submitForm()}
          className="rounded bg-[#8f7228] px-4 py-2 text-sm font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create fund raiser"}
        </button>
        {status ? <p className="text-sm text-slate-400">{status}</p> : null}
      </div>
    </section>
  );
}
