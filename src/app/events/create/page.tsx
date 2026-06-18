import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateEventForm } from "@/components/events/create-event-form";
import { AppShell } from "@/components/platform/app-shell";

export default async function CreateEventPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/events/create");
  }

  return (
    <AppShell>
      <CreateEventForm />
    </AppShell>
  );
}
