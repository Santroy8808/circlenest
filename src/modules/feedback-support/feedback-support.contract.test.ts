import assert from "node:assert/strict";
import test from "node:test";
import {
  FeedbackTicketMessageType,
  UserRole
} from "@prisma/client";
import {
  canAddFeedbackMessage,
  canAccessFeedbackScreenshot,
  canCreateFeedbackTicket,
  canViewFeedbackTicket,
  resolveFeedbackTicketAudience,
  visibleFeedbackMessageTypes
} from "@/modules/feedback-support/authorization";
import { normalizeFeedbackSourceUrl } from "@/modules/feedback-support/feedback-support.service";
import {
  createFeedbackTicketMessageSchema,
  createFeedbackTicketSchema,
  feedbackScreenshotIntentSchema,
  feedbackTicketBulkActionSchema
} from "@/modules/feedback-support/types";

test("ticket creators can view their own ticket but not another user's ticket", () => {
  assert.equal(
    canViewFeedbackTicket({
      viewerUserId: "creator",
      viewerRole: UserRole.MEMBER,
      reporterUserId: "creator"
    }),
    true
  );
  assert.equal(
    canViewFeedbackTicket({
      viewerUserId: "other-user",
      viewerRole: UserRole.MEMBER,
      reporterUserId: "creator"
    }),
    false
  );
});

test("administrators can view shared tickets", () => {
  assert.equal(
    canViewFeedbackTicket({
      viewerUserId: "administrator",
      viewerRole: UserRole.ADMIN,
      reporterUserId: "creator"
    }),
    true
  );
});

test("every authenticated account can create feedback regardless of membership tier", () => {
  assert.equal(canCreateFeedbackTicket("member"), true);
  assert.equal(canCreateFeedbackTicket("administrator"), true);
  assert.equal(canCreateFeedbackTicket(undefined), false);
});

test("administrator creator links stay creator-scoped while admin routes expose admin details", () => {
  assert.equal(resolveFeedbackTicketAudience(UserRole.ADMIN), "creator");
  assert.equal(resolveFeedbackTicketAudience(UserRole.ADMIN, "admin"), "admin");
  assert.equal(resolveFeedbackTicketAudience(UserRole.MEMBER, "admin"), null);
});

test("internal notes are never permitted or selected for ordinary members", () => {
  assert.equal(
    canAddFeedbackMessage({
      viewerUserId: "creator",
      viewerRole: UserRole.MEMBER,
      reporterUserId: "creator",
      messageType: FeedbackTicketMessageType.INTERNAL
    }),
    false
  );
  assert.deepEqual(
    visibleFeedbackMessageTypes(UserRole.MEMBER),
    [FeedbackTicketMessageType.NORMAL]
  );
  assert.deepEqual(
    visibleFeedbackMessageTypes(UserRole.ADMIN),
    [FeedbackTicketMessageType.NORMAL, FeedbackTicketMessageType.INTERNAL]
  );
});

test("feedback source URLs only retain internal Theta-Space locations", () => {
  assert.equal(normalizeFeedbackSourceUrl("https://example.com/private"), null);
  assert.equal(
    normalizeFeedbackSourceUrl("https://theta-space.net/gallery?token=secret&view=recent"),
    "https://theta-space.net/gallery?token=%5Bredacted%5D&view=recent"
  );
  assert.equal(
    normalizeFeedbackSourceUrl("/profile/member-1"),
    "https://theta-space.net/profile/member-1"
  );
});

test("feedback can be submitted without a screenshot and carries an idempotency key", () => {
  const result = createFeedbackTicketSchema.safeParse({
    title: "Gallery upload does not finish",
    description: "The upload reaches the final step but the new photo does not appear.",
    kind: "BUG",
    pageUrl: "https://theta-space.net/profile/gallery",
    submissionKey: "e56b8125-b53b-4cf3-a7cb-44b86ef83d49"
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.screenshotUploadIntentId, undefined);
});

test("screenshot contracts reject invalid and oversized files", () => {
  assert.equal(
    feedbackScreenshotIntentSchema.safeParse({
      fileName: "capture.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 1024
    }).success,
    false
  );
  assert.equal(
    feedbackScreenshotIntentSchema.safeParse({
      fileName: "capture.png",
      mimeType: "image/png",
      sizeBytes: 2 * 1024 * 1024 + 1
    }).success,
    false
  );
});

test("unrelated members cannot access a ticket screenshot while admins can", () => {
  assert.equal(
    canAccessFeedbackScreenshot({
      viewerUserId: "other-user",
      viewerRole: UserRole.MEMBER,
      reporterUserId: "creator"
    }),
    false
  );
  assert.equal(
    canAccessFeedbackScreenshot({
      viewerUserId: "administrator",
      viewerRole: UserRole.ADMIN,
      reporterUserId: "creator"
    }),
    true
  );
});

test("bulk ticket updates require a current version for every selected ticket", () => {
  assert.equal(
    feedbackTicketBulkActionSchema.safeParse({
      action: "ASSIGN_TO_ME",
      ticketIds: ["TS-ONE"],
      expectedVersions: {}
    }).success,
    false
  );
  assert.equal(
    feedbackTicketBulkActionSchema.safeParse({
      action: "ASSIGN_TO_ME",
      ticketIds: ["TS-ONE"],
      expectedVersions: { "TS-ONE": 3 }
    }).success,
    true
  );
  assert.equal(
    feedbackTicketBulkActionSchema.safeParse({
      action: "ASSIGN_TO_ME",
      ticketIds: ["TS-ONE"]
    }).success,
    false
  );
});

test("message retries require a stable idempotency key and reject empty text", () => {
  const key = "6fa85f64-5717-4562-b3fc-2c963f66afa6";
  assert.equal(
    createFeedbackTicketMessageSchema.safeParse({
      type: FeedbackTicketMessageType.NORMAL,
      body: "Here is the additional information you requested.",
      idempotencyKey: key
    }).success,
    true
  );
  assert.equal(
    createFeedbackTicketMessageSchema.safeParse({
      type: FeedbackTicketMessageType.NORMAL,
      body: " ",
      idempotencyKey: key
    }).success,
    false
  );
});
