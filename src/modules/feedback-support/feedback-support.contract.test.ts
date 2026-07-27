import assert from "node:assert/strict";
import test from "node:test";
import {
  FeedbackTicketMessageType,
  UserRole
} from "@prisma/client";
import {
  canAddFeedbackMessage,
  canViewFeedbackTicket,
  visibleFeedbackMessageTypes
} from "@/modules/feedback-support/authorization";
import { normalizeFeedbackSourceUrl } from "@/modules/feedback-support/feedback-support.service";

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
