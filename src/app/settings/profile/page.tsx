import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";

const profileCards = [
  { title: "Edit Profile", description: "Edit display name, bio, avatar, banner, location, and profile visibility.", href: "/profile/edit" },
  { title: "My Pics", description: "Open your photo gallery without the secure settings wall.", href: "/profile/gallery" },
  { title: "My Scientology", description: "Manage Scientology-specific profile details and privacy.", href: "/profile/scientology" },
  { title: "My Resume", description: "Build a printable executive resume and optional My Scientology summary page.", href: "/settings/profile/resume" },
  { title: "My Interests", description: "Choose optional interest categories for discovery and relevant internal ads.", href: "/profile/interests" },
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
        <h1 className="mt-3 text-3xl font-semibold">Profile</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Manage the public-facing parts of your account and the personal pages attached to your profile.</p>
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
