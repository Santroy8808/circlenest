import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { getProfileForOwner } from "@/modules/profile-identity/profile-identity.service";

export default async function EditProfilePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/edit");
  }

  const profile = await getProfileForOwner(session.user.id);

  if (!profile) {
    redirect("/login?callbackUrl=/profile/edit");
  }

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Profile Identity</p>
        <h1 className="mt-3 text-3xl font-semibold">Edit profile</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Shape the public member card. Gallery-backed avatar and banner selection arrives with the media module.
        </p>
      </section>
      <section className="mt-5">
        <ProfileEditForm profile={profile} />
      </section>
    </AppShell>
  );
}
