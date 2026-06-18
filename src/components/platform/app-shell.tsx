import Link from "next/link";
import { auth } from "@/auth";
import {
  getUnreadCounts,
  type UnreadCounts
} from "@/modules/notifications-alerts/notifications-alerts.service";

const navItems: Array<{ label: string; href: string; countKey?: keyof UnreadCounts }> = [
  { label: "Rebuild Home", href: "/" },
  { label: "Health", href: "/health" },
  { label: "Membership", href: "/membership" },
  { label: "Friends", href: "/friends" },
  { label: "Groups", href: "/groups" },
  { label: "Events", href: "/events" },
  { label: "Profile", href: "/profile" },
  { label: "My Scientology", href: "/profile/scientology" },
  { label: "My Pics", href: "/profile/gallery" },
  { label: "Messages", href: "/messages", countKey: "messages" },
  { label: "Mail", href: "/mail", countKey: "mail" },
  { label: "Notifications", href: "/notifications", countKey: "notifications" },
  { label: "Alerts", href: "/alerts", countKey: "alerts" },
  { label: "Login", href: "/login" },
  { label: "Docs", href: "/docs" },
  { label: "System Map", href: "/docs/system-map" }
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const counts = await getUnreadCounts(session?.user?.id);

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
              <span>{item.label}</span>
              {item.countKey && counts[item.countKey] > 0 ? (
                <span className="float-right rounded-full bg-[var(--gold)] px-2 text-xs font-bold text-black">
                  {counts[item.countKey]}
                </span>
              ) : null}
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
