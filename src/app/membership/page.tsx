import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { MembershipMatrix } from "@/components/policy/membership-matrix";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/membership");

  const policy = await getEffectivePolicyForUser(session.user.id);
  if (!policy) redirect("/login?callbackUrl=/membership");

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Membership</p>
        <h1 className="mt-3 text-3xl font-semibold">Your current membership</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          This page shows only the access currently enabled for your account.
        </p>
      </section>
      <section className="mt-5">
        <MembershipMatrix policies={[policy]} />
      </section>
    </AppShell>
  );
}
