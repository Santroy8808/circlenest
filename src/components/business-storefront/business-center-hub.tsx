import Link from "next/link";
import type { AdsManagerView } from "@/modules/ads-credits/types";
import type { BusinessCenterView } from "@/modules/business-storefront/types";

type BusinessCenterHubCard = {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  meta: string;
};

export function BusinessCenterHub({ adsManager, businessCenter }: { adsManager: AdsManagerView; businessCenter: BusinessCenterView }) {
  const profile = businessCenter.profile;
  const activeCampaigns = adsManager.campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const hasStorefront = Boolean(profile?.publicStorefrontEnabled);

  const cards: BusinessCenterHubCard[] = [
    {
      title: "Create ad",
      eyebrow: "Promote",
      description:
        "Build a complete ad campaign with creative, destination, audience targeting, campaign length, credit investment, and optional A/B testing.",
      href: "/business-center/create-ad",
      meta: `${adsManager.platformCredits.toLocaleString()} credits available`
    },
    {
      title: "Campaigns",
      eyebrow: "Manage",
      description: "Review running and historical campaigns, inspect destinations, remaining credits, targeting, and end active campaigns.",
      href: "/business-center/campaigns",
      meta: `${activeCampaigns} active, ${adsManager.campaigns.length} total`
    },
    {
      title: "Metrics",
      eyebrow: "Measure",
      description: "Filter campaign performance by timeframe, placement, status, location, interest audience, and subscriber audience.",
      href: "/business-center/metrics",
      meta: "Hourly, daily, weekly, monthly"
    },
    {
      title: "Storefront",
      eyebrow: "Presence",
      description: "Manage your public storefront profile, banner, articles, inquiries, gallery, and published business information.",
      href: "/business-center/storefront",
      meta: hasStorefront ? "Public storefront enabled" : "Storefront draft"
    }
  ];

  return (
    <div className="grid gap-5">
      <section className="surface business-center-hub-hero rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Business Center</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{profile?.businessName ?? "Business tools"}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
              Choose the job you want to do first. Each section opens as a focused workspace instead of stacking unrelated tools on one page.
            </p>
          </div>
          {profile?.publicUrl ? (
            <Link className="btn-secondary" href={profile.publicUrl}>
              View storefront
            </Link>
          ) : null}
        </div>
      </section>

      <section className="business-center-card-grid">
        {cards.map((card) => (
          <Link className="business-center-nav-card" href={card.href} key={card.title}>
            <span>{card.eyebrow}</span>
            <strong>{card.title}</strong>
            <p>{card.description}</p>
            <small>{card.meta}</small>
          </Link>
        ))}
      </section>
    </div>
  );
}
