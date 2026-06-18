import Link from "next/link";

const navItems = [
  { label: "Rebuild Home", href: "/" },
  { label: "Health", href: "/health" },
  { label: "Docs", href: "/docs" },
  { label: "System Map", href: "/docs/system-map" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Theta-Space</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">NewRepo Rebuild</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Private membership social platform, rebuilt one module at a time.
          </p>
        </div>
        <nav className="mt-8 grid gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border border-transparent px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--line)] hover:text-[var(--text)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 rounded-md border border-[var(--line)] bg-black/16 p-3 text-xs leading-5 text-[var(--muted)]">
          Production source remains untouched until cutover and rollback archive are ready.
        </div>
      </aside>
      <main className="main-surface">{children}</main>
    </div>
  );
}
