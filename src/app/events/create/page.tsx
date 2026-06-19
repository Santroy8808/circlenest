import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { CreateEventForm } from "@/components/events/create-event-form";
import { AppShell } from "@/components/platform/app-shell";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function CreateEventPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/events/create");
  }

  const access =
    session.user.role === UserRole.ADMIN
      ? { allowed: true, reason: "Admin role grants this platform control." }
      : await canUserAccessFeature(session.user.id, "events.create");

  if (!access.allowed) {
    return (
      <AppShell>
        <section className="surface rounded-md p-8 text-center">
          <h1 className="text-3xl font-semibold text-[var(--gold)]">Create Event</h1>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">{access.reason}</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <CreateEventForm />
    </AppShell>
  );
}
