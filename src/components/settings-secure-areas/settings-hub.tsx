import Link from "next/link";
import type { SettingsCard } from "@/modules/settings-secure-areas/types";

export function SettingsHub({ cards }: { cards: SettingsCard[] }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Settings</p>
        <h1 className="mt-3 text-3xl font-semibold">Choose a settings area</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Settings stay card-first. Sensitive areas route through a fresh secure-area prompt; My Pics does not.
        </p>
      </section>
      <section className="settings-card-grid">
        {cards.map((card) => (
          <Link className="module-card rounded-md p-5" href={card.href} key={card.title}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--gold)]">{card.title}</h2>
              <span className="pill rounded-full px-3 py-1 text-xs">{card.sensitive ? "secure" : card.badge}</span>
            </div>
            <p className="mt-3 leading-6 text-[var(--muted)]">{card.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
