import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function ProductionZoneEventsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: Events</h1>
          <p className="text-sm text-slate-400">Events only show up when you created them, were invited, or were added as an event moderator.</p>
        </div>
        <Link
          href="/events"
          className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Open Events</h2>
          <p className="mt-1 text-sm text-slate-400">Use the events page to view invited events and create new ones. Event promotion now routes through the standard ads builder.</p>
        </Link>
      </section>
    </AppShell>
  );
}
