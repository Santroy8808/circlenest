ALTER TABLE "ChatMessage"
ADD COLUMN "feedbackTicketMessageId" TEXT;

CREATE UNIQUE INDEX "ChatMessage_feedbackTicketMessageId_key"
ON "ChatMessage"("feedbackTicketMessageId");

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_feedbackTicketMessageId_fkey"
FOREIGN KEY ("feedbackTicketMessageId")
REFERENCES "FeedbackTicketMessage"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
