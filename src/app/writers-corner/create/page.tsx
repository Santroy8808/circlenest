import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { CreateManuscriptForm } from "@/components/writers-corner/create-manuscript-form";
import { getWriterAccessState } from "@/modules/writers-corner/writers-corner.service";

export default async function CreateManuscriptPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/writers-corner/create");
  }

  const access = await getWriterAccessState(session.user.id);

  return (
    <AppShell>
      <CreateManuscriptForm access={access} />
    </AppShell>
  );
}
