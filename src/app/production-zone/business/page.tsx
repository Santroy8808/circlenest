import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/db/prisma";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

export default async function ProductionZoneBusinessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  if (!(policy.tier === "PRO" || policy.isAdmin)) {
    redirect("/production-zone");
  }

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone: My Business</h1>
          <p className="text-sm text-slate-400">Use your business hub to manage the profile first, then branch into job and event flows.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">My business profile</h2>
            <p className="mt-1 text-sm text-slate-400">Create or update the public business presence for your account.</p>
            <Link href="/production-zone/business-profile" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              Open business profile
            </Link>
          </article>
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Create a job listing</h2>
            <p className="mt-1 text-sm text-slate-400">Business recruiting still uses the dedicated job-listing creator.</p>
            <Link href="/jobs/new" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              Open job creator
            </Link>
          </article>
          <article className="rounded border border-[var(--border)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Create an event</h2>
            <p className="mt-1 text-sm text-slate-400">Create the event first, then add event-specific ads from the event page.</p>
            <Link href="/events" className="mt-3 inline-flex rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-strong)]">
              Open events
            </Link>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
