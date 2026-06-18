import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ScientologyProfileForm } from "@/components/profile/scientology-profile-form";
import { getScientologyProfileForOwner } from "@/modules/my-scientology/my-scientology.service";

export default async function MyScientologyPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/profile/scientology");
  }

  const profile = await getScientologyProfileForOwner(session.user.id);

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Scientology</p>
        <h1 className="mt-3 text-3xl font-semibold">Scientology profile</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          This data supports qualification, auditor education pull-through, and privacy-safe matching. Visibility is
          explicit and defaults to private.
        </p>
      </section>
      <section className="mt-5">
        <ScientologyProfileForm profile={profile} />
      </section>
    </AppShell>
  );
}
