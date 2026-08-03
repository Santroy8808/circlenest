import assert from "node:assert/strict";
import test from "node:test";
import { chatBadgeCount } from "@/modules/navigation/shell-badges";

test("chat badge count only includes unread chat messages", () => {
  assert.equal(chatBadgeCount({
    alerts: 7,
    mail: 5,
    messages: 2,
    notifications: 11
  }), 2);
});
