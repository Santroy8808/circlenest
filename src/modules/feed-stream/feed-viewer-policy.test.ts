import assert from "node:assert/strict";
import test from "node:test";
import { friendAuthoredPostWhere, profileFeedPrincipalWhere } from "./feed-viewer-policy";

test("profile Stream identity includes authored public posts and direct profile posts", () => {
  assert.deepEqual(profileFeedPrincipalWhere("member-1"), {
    OR: [
      { authorUserId: "member-1", targetProfileUserId: null },
      { targetProfileUserId: "member-1" }
    ]
  });
});

test("friends Stream is based on a symmetric accepted relationship, not post visibility", () => {
  assert.deepEqual(friendAuthoredPostWhere("viewer-1"), {
    author: {
      is: {
        socialRelationshipsFrom: {
          some: { toUserId: "viewer-1", type: "FRIEND" }
        },
        socialRelationshipsTo: {
          some: { fromUserId: "viewer-1", type: "FRIEND" }
        }
      }
    }
  });
});
