import Link from "next/link";

export function AuthCard({
  eyebrow,
  title,
  subtitle,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-layout">
      <section className="surface auth-card rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-6 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">
          <Link className="text-[var(--gold)]" href="/">
            Back to Theta-Space
          </Link>
        </div>
      </section>
    </main>
  );
}
