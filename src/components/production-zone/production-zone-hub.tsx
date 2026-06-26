import Link from "next/link";
import { unavailableFeatureHref } from "@/modules/feature-availability/feature-availability.service";
import type { ProductionZoneCard, ProductionZoneView } from "@/modules/production-zone/types";

function CardList({ cards }: { cards: ProductionZoneCard[] }) {
  return (
    <div className="production-zone-grid">
      {cards.map((card) => {
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold text-[var(--gold)]">{card.title}</h3>
              <span className="pill rounded-full px-3 py-1 text-xs">{card.badge}</span>
            </div>
            <p className="mt-3 leading-6 text-[var(--muted)]">{card.description}</p>
            {!card.available && card.reason ? <p className="mt-4 text-sm text-[var(--muted)]">{card.reason}</p> : null}
          </>
        );

        if (card.available) {
          return (
            <Link className="module-card rounded-md p-5" href={card.href} key={card.title}>
              {content}
            </Link>
          );
        }

        return (
          <Link
            className="module-card rounded-md p-5 opacity-80"
            href={unavailableFeatureHref({
              featureKey: card.featureKey ?? card.href,
              label: card.title,
              requestedPath: card.href,
              from: "/production-zone"
            })}
            key={card.title}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

export function ProductionZoneHub({ zone }: { zone: ProductionZoneView }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Production Zone</p>
        <h1 className="mt-3 text-3xl font-semibold">Creator and professional tools</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Your current tier is {zone.tierName}. Browse tools stay visible; creator and business tools appear when the account can use them.
        </p>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Browse</h2>
        <p className="mt-2 text-[var(--muted)]">Available production areas you can view or search.</p>
        <div className="mt-5">
          <CardList cards={zone.browseCards} />
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Create</h2>
        <p className="mt-2 text-[var(--muted)]">Action cards only. Forms live inside their own focused pages.</p>
        <div className="mt-5">
          <CardList cards={zone.creatorCards} />
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Business Center</h2>
        <p className="mt-2 text-[var(--muted)]">Professional business surfaces, storefront, and ad creation handoffs.</p>
        <div className="mt-5">
          <CardList cards={zone.businessCards} />
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Future Production Tools</h2>
        <p className="mt-2 text-[var(--muted)]">Blueprints that are intentionally not pretending to be finished pages yet.</p>
        <div className="mt-5">
          <CardList cards={zone.futureCards} />
        </div>
      </section>
    </div>
  );
}
