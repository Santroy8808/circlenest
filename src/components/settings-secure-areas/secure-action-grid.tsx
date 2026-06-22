import Link from "next/link";

export type SecureActionCard = {
  title: string;
  description: string;
  href: string;
  badge?: string;
};

export function SecureActionGrid({ actions }: { actions: SecureActionCard[] }) {
  return (
    <div className="settings-card-grid">
      {actions.map((action) => (
        <Link className="module-card rounded-md p-5" href={action.href} key={`${action.href}:${action.title}`}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-[var(--gold)]">{action.title}</h2>
            {action.badge ? <span className="pill rounded-full px-3 py-1 text-xs">{action.badge}</span> : null}
          </div>
          <p className="mt-3 leading-6 text-[var(--muted)]">{action.description}</p>
        </Link>
      ))}
    </div>
  );
}
