import { redirect } from "next/navigation";
import { SocialRelationshipType } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { PeopleGrid } from "@/components/social/people-grid";
import { getListingViewPreference } from "@/modules/listing-preferences/listing-preferences.service";
import { safeListPeopleCards } from "@/modules/social-graph/social-graph.service";

export default async function FriendsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/friends");
  }

  const [people, initialView] = await Promise.all([
    safeListPeopleCards(session.user.id, SocialRelationshipType.FRIEND),
    getListingViewPreference(session.user.id, "friends", "square")
  ]);

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">People</p>
        <h1 className="mt-3 text-3xl font-semibold">Friends</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Friends render as visual cards. Contacts and family are relationship tags, not separate hidden account systems.
        </p>
      </section>
      <section className="mt-5">
        <PeopleGrid initialView={initialView} people={people} surface="friends" />
      </section>
    </AppShell>
  );
}
