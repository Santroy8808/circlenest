import assert from "node:assert/strict";
import test from "node:test";
import "../../../scripts/load-next-env";
import {
  buildFeedbackNotificationEmail,
  feedbackTicketQueueUrl
} from "@/modules/feedback-support/feedback-notification-email";

test("feedback notification links directly to the matching admin queue ticket", () => {
  const input = {
    publicId: "TS-TEST-1234",
    title: "Gallery upload stops",
    description: "The upload finished, but the image did not appear.",
    kind: "BUG",
    severity: "high",
    reporterName: "Test Member",
    reporterEmail: "member@example.com",
    pageUrl: "https://theta-space.net/profile/gallery"
  };
  const message = buildFeedbackNotificationEmail(input);
  const queueUrl = feedbackTicketQueueUrl(input.publicId);

  assert.match(queueUrl, /\/admin\/tickets\?ticket=TS-TEST-1234$/);
  assert.match(message.subject, /^\[TS-TEST-1234\] Bug:/);
  assert.match(message.text, /Test Member <member@example\.com>/);
  assert.match(message.text, /https:\/\/theta-space\.net\/profile\/gallery/);
  assert.match(message.text, /Open in the Theta-Space queue:/);
  assert.match(message.html, /theta-send-logo\.png/i);
  assert.match(message.html, /Open ticket in queue/i);
});
