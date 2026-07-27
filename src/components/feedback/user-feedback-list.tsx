"use client";

import Link from "next/link";
import type { UserFeedbackTicketListView } from "@/modules/feedback-support/feedback-support.service";

export function UserFeedbackList({ initialView }: { initialView: UserFeedbackTicketListView }) {
  return (
    <main data-user-feedback>
      <h1>Feedback</h1>
      <ul>
        {initialView.tickets.map((ticket) => (
          <li key={ticket.publicId}>
            <Link href={`/feedback/tickets/${encodeURIComponent(ticket.publicId)}`}>
              {ticket.publicId}: {ticket.subject}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
