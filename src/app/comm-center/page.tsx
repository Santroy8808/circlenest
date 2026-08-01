import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";

const commCenterCards = [
  {
    title: "Comms",
    description: "Open direct and group chat.",
    href: "/messages"
  },
  {
    title: "Contacts",
    description: "Search family, friends, and acquaintances.",
    href: "/comm-center/contacts"
  },
  {
    title: "Groups",
    description: "Browse groups you created or joined.",
    href: "/comm-center/groups"
  }
];

export default async function CommCenterPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/comm-center");
  }

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Comm Center</p>
        <h1 className="mt-3 text-3xl font-semibold">Communications</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Choose chat, contacts, or your groups.</p>
      </section>
      <section className="settings-card-grid mt-5">
        {commCenterCards.map((card) => (
          <Link className="module-card rounded-md p-5" href={card.href} key={card.href}>
            <h2 className="text-xl font-semibold text-[var(--gold)]">{card.title}</h2>
            <p className="mt-3 leading-6 text-[var(--muted)]">{card.description}</p>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
