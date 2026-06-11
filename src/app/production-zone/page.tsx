import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { resolveProductionZoneAccess } from "@/lib/policy/production-zone";

const sections: Array<{ key: "BAZAAR" | "WRITERS_STUDIO" | "BUSINESS_PROFILE"; label: string; href?: string }> = [
  { key: "BAZAAR", label: "Bazaar" },
  { key: "WRITERS_STUDIO", label: "Writers Studio", href: "/production-zone/writers-studio" },
  { key: "BUSINESS_PROFILE", label: "Business Profile", href: "/production-zone/business-profile" },
];

export default async function ProductionZonePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, iasStatus: true },
  });
  const isInvitedCreator = Boolean(user?.iasStatus && user.iasStatus.toUpperCase() === "INVITED_CREATOR");
  const access = resolveProductionZoneAccess(user?.subscriptionTier, isInvitedCreator);

  return (
    <AppShell>
      <section className="card space-y-4 p-4">
        <div>
          <h1 className="text-xl font-semibold">Production Zone</h1>
          <p className="text-sm text-slate-500">Browse is open. Creation is invite-only and subscription-gated.</p>
        </div>
        {!access.canCreate ? (
          <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-sm text-amber-200">{access.reason}</p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          {sections.map((section) => (
            <article key={section.key} className="rounded border border-[var(--border)] p-3">
              <h2 className="font-medium">{section.label}</h2>
              <p className="mt-1 text-xs text-slate-500">Browsing enabled.</p>
              {section.href ? (
                <Link href={section.href} className="mt-3 inline-flex rounded border border-slate-400 px-2 py-1 text-xs text-slate-200 hover:border-slate-200 hover:text-white">
                  Open
                </Link>
              ) : (
                <button disabled={!access.canCreate} className="mt-3 rounded border border-slate-400 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  {access.canCreate ? `Create in ${section.label}` : "Create locked"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

