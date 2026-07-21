import assert from "node:assert/strict";
import test from "node:test";
import {
  nextWriterChapterSortOrder,
  writerStorefrontPublishingAllowed,
  writerAccessAllowsRead,
  writerAccessAllowsWrite
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
