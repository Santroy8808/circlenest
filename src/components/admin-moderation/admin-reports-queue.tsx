import { AdminObjectId } from "@/components/admin/admin-object-id";
import type { AdminFeedbackTicketView } from "@/modules/admin-moderation/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

export function AdminReportsQueue({ tickets }: { tickets: AdminFeedbackTicketView[] }) {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Queue</p>
        <h1 className="mt-3 text-3xl font-semibold">Reports Queue</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          All admins see this same queue. Feedback tickets created from the Report Issue button land here for review.
        </p>
      </section>

      {tickets.length === 0 ? (
        <section className="surface rounded-md p-8 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No reports waiting</h2>
          <p className="mt-2 text-[var(--muted)]">There are no feedback, bug report, or support tickets in the queue.</p>
        </section>
      ) : (
        <section className="grid gap-4">
          {tickets.map((ticket) => (
            <article className="surface rounded-md p-5" key={ticket.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">{ticket.publicId}</p>
                  <h2 className="mt-2 text-2xl font-semibold">{ticket.title}</h2>
                  <div className="mt-2">
                    <AdminObjectId id={ticket.id} kind="Report" visible />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="pill rounded-full px-3 py-1 text-xs">{statusLabel(ticket.status)}</span>
                  <span className="pill rounded-full px-3 py-1 text-xs">{ticket.severity}</span>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--muted)]">{ticket.description}</p>
              <div className="mt-5 grid gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4 text-sm md:grid-cols-2">
                <p>
                  <span className="text-[var(--muted)]">Reporter:</span> {ticket.reporterName}
                </p>
                <p>
                  <span className="text-[var(--muted)]">Email:</span> {ticket.reporterEmail ?? "Not provided"}
                </p>
                <p>
                  <span className="text-[var(--muted)]">Source page:</span> {ticket.pageUrl ?? "Not captured"}
                </p>
                <p>
                  <span className="text-[var(--muted)]">Created:</span> {formatDate(ticket.createdAt)}
                </p>
                {ticket.lastEvent ? (
                  <p className="md:col-span-2">
                    <span className="text-[var(--muted)]">Last event:</span> {ticket.lastEvent}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
