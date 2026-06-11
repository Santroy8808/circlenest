import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { resolveMemberAccessPolicy } from "@/lib/policy/member-access-policy";

type ZoneCard = {
  title: string;
  description: string;
  href: string;
};

export default async function ProductionZonePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, auditorListing, businessProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, subscriptionTier: true },
    }),
    prisma.auditorListing.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
    prisma.businessProfile.findUnique({
      where: { ownerId: session.user.id },
      select: { id: true },
    }),
  ]);
  const policy = resolveMemberAccessPolicy(session.user.id, user);
  const hasAuditorAccount = policy.tier === "AUDITOR" || Boolean(auditorListing);
  const showBusiness = policy.tier === "PRO" || policy.isAdmin || Boolean(businessProfile);
  const showActivistTools = policy.tier !== "FREE";

  const cards: ZoneCard[] = [
    {
      title: "Events",
      description: "Open the events you create, moderate, or are invited to.",
      href: "/production-zone/events",
    },
    {
      title: "Market",
      description: "Browse listings, create a listing if your tier allows it, and add listing ads when available.",
      href: "/production-zone/market",
    },
    {
      title: "Find a Job",
      description: "Browse job listings and create a posting if your tier supports it.",
      href: "/production-zone/jobs",
    },
    {
      title: "Find an Auditor",
      description: "Search the auditor directory with filters and member listings.",
      href: "/production-zone/auditors",
    },
  ];

  if (hasAuditorAccount) {
    cards.push({
      title: "I'm an Auditor",
      description: "Open and maintain your auditor profile.",
      href: "/auditors/im-an-auditor",
    });
  }

  if (showBusiness) {
    cards.push({
      title: "My Business",
      description: "Manage your business profile, then branch into business job and event flows.",
      href: "/production-zone/business",
    });
  }

  if (showActivistTools) {
    cards.push(
      {
        title: "Writers Corner",
        description: "Open manuscripts and chapters inside Writers Corner.",
        href: "/production-zone/writers-corner",
      },
      {
        title: "Fund Raiser",
        description: "Browse fund raisers and create one when your tier allows it.",
        href: "/production-zone/fundraisers",
      },
    );
  }

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone</h1>
          <p className="text-sm text-slate-400">Use the zone as a layered control panel. Open one production surface at a time.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block rounded border border-[var(--border)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[color:var(--card-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <h2 className="text-base font-semibold text-[var(--text-strong)]">{card.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{card.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
