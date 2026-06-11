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
        <div className="rounded border border-[var(--border)] p-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Open Events</h2>
          <p className="mt-1 text-sm text-slate-400">Use the events page to view invited events, create new ones, and manage event-specific ads when your tier allows it.</p>
          <Link href="/events" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
            Open events
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
