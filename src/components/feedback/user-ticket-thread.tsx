"use client";

import type { FeedbackTicketDetailView } from "@/modules/feedback-support/feedback-support.service";

export function UserTicketThread({ initialView }: { initialView: FeedbackTicketDetailView }) {
  return (
    <main data-user-ticket-thread>
      <h1>{initialView.ticket.publicId}</h1>
      <h2>{initialView.ticket.subject}</h2>
      <p>{initialView.ticket.description}</p>
    </main>
  );
}
