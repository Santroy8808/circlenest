CREATE TYPE "FeedbackTicketKind" AS ENUM ('SUPPORT_REQUEST', 'ISSUE_REPORT', 'FEATURE_REQUEST');

ALTER TABLE "FeedbackTicket"
  ADD COLUMN "kind" "FeedbackTicketKind" NOT NULL DEFAULT 'ISSUE_REPORT';

CREATE INDEX "FeedbackTicket_kind_createdAt_idx"
  ON "FeedbackTicket"("kind", "createdAt");
