import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { AppShell } from "@/components/platform/app-shell";

export default async function CreateGroupPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/groups/create");
  }

  return (
    <AppShell>
      <CreateGroupForm />
    </AppShell>
  );
}
