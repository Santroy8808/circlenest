import assert from "node:assert/strict";
import test from "node:test";
import "../../../scripts/load-next-env";
import {
  BETA_REMINDER_DURATION_MS,
  BETA_REMINDER_EXCLUDED_EMAIL,
  buildBetaActivityReminderEmail
} from "@/modules/membership-policy/beta-activity-reminders.service";

test("beta activity reminder contains the required login call to action", () => {
  const message = buildBetaActivityReminderEmail();

  assert.equal(message.subject, "Have you tested Theta-Space today?");
  assert.match(message.text, /Log in: https?:\/\//i);
  assert.match(message.text, /desktop or laptop/i);
  assert.match(message.text, /Android app is in development/i);
  assert.match(message.text, /iOS to follow/i);
  assert.match(message.html, /theta-send-logo\.png/i);
  assert.match(message.html, /Log in to Theta-Space/i);
  assert.match(message.html, /\/login/i);
});

test("beta reminder policy lasts 90 days and excludes Mike", () => {
  assert.equal(BETA_REMINDER_DURATION_MS, 90 * 24 * 60 * 60 * 1000);
  assert.equal(BETA_REMINDER_EXCLUDED_EMAIL, "mike@santroy.com");
});
