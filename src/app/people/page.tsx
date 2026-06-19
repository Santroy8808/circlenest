import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { getListingViewPreference } from "@/modules/listing-preferences/listing-preferences.service";
import { PeopleDirectoryClient } from "@/components/social/people-directory-client";
import { safeBrowsePeopleCards } from "@/modules/social-graph/social-graph.service";

export default async function PeoplePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/people");
  }

  const [people, initialView] = await Promise.all([
    safeBrowsePeopleCards(session.user.id),
    getListingViewPreference(session.user.id, "people", "square")
  ]);

  return (
    <AppShell>
      <PeopleDirectoryClient initialPeople={people} initialView={initialView} />
    </AppShell>
  );
}
