import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EventDetailClient } from "@/components/events/event-detail-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetEventDetail } from "@/modules/events/events.service";

export default async function EventDetailPage({ params }: { params: { eventId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/events/${params.eventId}`);
  }

  const result = await safeGetEventDetail(session.user.id, params.eventId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <EventDetailClient event={result.event} />
    </AppShell>
  );
}
