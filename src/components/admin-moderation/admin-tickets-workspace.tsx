"use client";

import type { AdminFeedbackTicketListView } from "@/modules/feedback-support/feedback-support.service";

export function AdminTicketsWorkspace({ initialView }: { initialView: AdminFeedbackTicketListView }) {
  return (
    <main data-admin-tickets>
      <h1>Tickets</h1>
      <p>{initialView.summary.open} open tickets</p>
    </main>
  );
}
