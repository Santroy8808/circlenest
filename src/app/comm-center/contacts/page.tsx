import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ContactsDirectoryClient } from "@/components/comm-center/contacts-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { safeListPeopleCards } from "@/modules/social-graph/social-graph.service";

export default async function CommCenterContactsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/comm-center/contacts");
  }

  const actor = await getActiveAccountActor(session.user.id);
  const contacts = await safeListPeopleCards(actor.actorUserId);

  return (
    <AppShell>
      <ContactsDirectoryClient contacts={contacts} />
    </AppShell>
  );
}
