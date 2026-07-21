import assert from "node:assert/strict";
import test from "node:test";
import {
  nextWriterChapterSortOrder,
  writerStorefrontPublishingAllowed,
  writerAccessAllowsRead,
  writerAccessAllowsWrite,
  writerCanEditOwnedContent
} from "@/modules/writers-corner/writers-corner.service";

test("Free readers retain Writers Corner read access without mutation access", () => {
  const downgradedAuthorAccess = { canRead: true, canWrite: false };
  assert.equal(writerAccessAllowsRead(downgradedAuthorAccess), true);
  assert.equal(writerAccessAllowsWrite(downgradedAuthorAccess), false);
});

test("chapter ordering advances from the latest order", () => {
  assert.equal(nextWriterChapterSortOrder(undefined), 1);
  assert.equal(nextWriterChapterSortOrder(0), 1);
  assert.equal(nextWriterChapterSortOrder(8), 9);
});

test("an existing storefront cannot bypass the publisher's membership entitlement", () => {
  assert.equal(
    writerStorefrontPublishingAllowed({
      hasStorefrontEntitlement: false,
      hasEnabledStorefront: true
    }),
    false
  );
  assert.equal(
    writerStorefrontPublishingAllowed({
      hasStorefrontEntitlement: true,
      hasEnabledStorefront: true
    }),
    true
  );
});

test("writer editing requires both canonical write access and content ownership", () => {
  assert.equal(
    writerCanEditOwnedContent({
      viewerUserId: "author",
      authorUserId: "author",
      canWrite: true
    }),
    true
  );
  assert.equal(
    writerCanEditOwnedContent({
      viewerUserId: "administrator",
      authorUserId: "author",
      canWrite: true
    }),
    false
  );
  assert.equal(
    writerCanEditOwnedContent({
      viewerUserId: "author",
      authorUserId: "author",
      canWrite: false
    }),
    false
  );
});
