import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ProfileCard } from "@/components/profile/profile-card";
import { getPublicProfileByUsername } from "@/modules/profile-identity/profile-identity.service";
import { redirect } from "next/navigation";

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/profile/${params.username}`);
  }

  const profile = await getPublicProfileByUsername(params.username);
  const isOwner = Boolean(session?.user?.username && session.user.username === params.username.toLowerCase());

  return (
    <AppShell>
      {profile ? (
        <ProfileCard profile={profile} ownerControls={isOwner} />
      ) : (
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Profile</p>
          <h1 className="mt-3 text-3xl font-semibold">Profile unavailable</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
            That profile was not found, is private, or the database is unavailable in this local environment.
          </p>
        </section>
      )}
    </AppShell>
  );
}
