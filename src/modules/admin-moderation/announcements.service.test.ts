import assert from "node:assert/strict";
import test from "node:test";
import { DeliveryChannel } from "@prisma/client";
import { announcementEmailMessageId } from "./delivery-outbox.service";
import { buildAnnouncementOutboxEntries, validateAnnouncementAudienceChannels } from "./announcements.service";

const recipients = [
  { id: "admin-user", email: "admin@example.test" },
  { id: "member-one", email: "one@example.test" },
  { id: "member-two", email: null }
];

test("announcement delivery is represented by durable, deterministic outbox entries", () => {
  const entries = buildAnnouncementOutboxEntries(
    "announcement-1",
    "admin-user",
    "A platform update",
    "The platform will be updated tonight.",
    ["CHAT", "MAIL", "LOGIN_POPUP", "GLOBAL_POST", "PERSONAL_EMAIL"],
    recipients
  );

  assert.equal(entries.filter((entry) => entry.channel === DeliveryChannel.CHAT).length, 2);
  assert.equal(entries.filter((entry) => entry.channel === DeliveryChannel.MAIL).length, 3);
  assert.equal(entries.filter((entry) => entry.channel === DeliveryChannel.POPUP).length, 3);
  assert.equal(entries.filter((entry) => entry.channel === DeliveryChannel.GLOBAL_POST).length, 1);
  assert.equal(entries.filter((entry) => entry.channel === DeliveryChannel.PERSONAL_EMAIL).length, 2);
  assert.equal(new Set(entries.map((entry) => entry.idempotencyKey)).size, entries.length);
  assert.ok(!entries.some((entry) => entry.channel === DeliveryChannel.CHAT && entry.recipientUserId === "admin-user"));
});

test("a global Stream announcement is one public post job, not one job per recipient", () => {
  const entries = buildAnnouncementOutboxEntries(
    "announcement-2",
    "admin-user",
    "A platform update",
    "The platform will be updated tonight.",
    ["GLOBAL_POST"],
    recipients
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.recipientUserId, null);
  assert.equal(entries[0]?.channel, DeliveryChannel.GLOBAL_POST);
  assert.equal(entries[0]?.payload.visibility, "PUBLIC");
});

test("targeted audiences cannot leak into the public Stream", () => {
  assert.equal(validateAnnouncementAudienceChannels("ALL_ACTIVE", ["GLOBAL_POST"]), null);
  assert.match(validateAnnouncementAudienceChannels("TIER", ["GLOBAL_POST"]) ?? "", /public Stream/i);
  assert.equal(validateAnnouncementAudienceChannels("USERS", ["CHAT", "LOGIN_POPUP"]), null);
});

test("personal email retries use a stable RFC message id", () => {
  assert.equal(announcementEmailMessageId("delivery-123"), "<announcement-delivery-123@theta-space.net>");
});
