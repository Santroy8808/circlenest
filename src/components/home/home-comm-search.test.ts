import assert from "node:assert/strict";
import test from "node:test";
import { ChatAttachmentKind, ChatThreadType } from "@prisma/client";
import {
  contactsWithoutExistingDirectChats,
  filterHomeCommThreads,
  homeCommContactScope
} from "@/components/home/home-comm-search";
import type { ChatThreadView } from "@/modules/chat-messages/types";

const directThread: ChatThreadView = {
  id: "thread-1",
  type: ChatThreadType.DIRECT,
  title: "Julianne",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  unread: false,
  participants: [
    { id: "current", username: "current", displayName: "Current User" },
    { id: "julianne", username: "jules", displayName: "Julianne Dearmon" }
  ],
  lastMessage: {
    id: "message-1",
    body: "The gallery upload is ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    sender: { id: "julianne", username: "jules", displayName: "Julianne Dearmon" },
    attachments: [{
      id: "attachment-1",
      kind: ChatAttachmentKind.FILE,
      fileName: "beta-notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: "1200"
    }]
  }
};

test("the unified Comm search matches chat names, message context, and attachments", () => {
  assert.deepEqual(filterHomeCommThreads([directThread], "jules"), [directThread]);
  assert.deepEqual(filterHomeCommThreads([directThread], "gallery upload"), [directThread]);
  assert.deepEqual(filterHomeCommThreads([directThread], "beta-notes"), [directThread]);
  assert.deepEqual(filterHomeCommThreads([directThread], "no match"), []);
});

test("member discovery is relationship-only until explicitly expanded", () => {
  assert.equal(homeCommContactScope(false), "RELATIONSHIPS");
  assert.equal(homeCommContactScope(true), "ALL");
});

test("people with an existing direct chat are not duplicated as start-chat results", () => {
  assert.deepEqual(
    contactsWithoutExistingDirectChats(
      [{ id: "julianne" }, { id: "new-person" }],
      [directThread],
      "current"
    ),
    [{ id: "new-person" }]
  );
});
