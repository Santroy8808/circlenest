import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";

const profileCards = [
  { title: "Profile", description: "Edit display name, bio, avatar, banner, and visibility.", href: "/profile/edit" },
  { title: "My Pics", description: "Open your photo gallery without the secure settings wall.", href: "/profile/gallery" },
  { title: "My Scientology", description: "Manage Scientology-specific profile details and privacy.", href: "/profile/scientology" },
  { title: "Public Profile", description: "View your member-facing profile page.", href: "/profile" }
];

export default async function ProfileSettingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/settings/profile");
  }

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Profile Settings</p>
        <h1 className="mt-3 text-3xl font-semibold">Profile areas</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Profile navigation is card-based. My Pics is intentionally not behind a second password prompt.</p>
      </section>
      <section className="settings-card-grid mt-5">
        {profileCards.map((card) => (
          <Link className="module-card rounded-md p-5" href={card.href} key={card.title}>
            <h2 className="text-xl font-semibold text-[var(--gold)]">{card.title}</h2>
            <p className="mt-3 leading-6 text-[var(--muted)]">{card.description}</p>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
