import assert from "node:assert/strict";
import test from "node:test";
import { UploadIntentPurpose } from "@prisma/client";
import { uploadCountsAgainstPersonalStorage } from "@/modules/media/upload-intent.service";

test("feedback screenshots do not count against personal storage", () => {
  assert.equal(
    uploadCountsAgainstPersonalStorage(UploadIntentPurpose.FEEDBACK_SCREENSHOT),
    false
  );
  assert.equal(uploadCountsAgainstPersonalStorage(UploadIntentPurpose.GALLERY), true);
  assert.equal(uploadCountsAgainstPersonalStorage(UploadIntentPurpose.PROFILE_MEDIA), true);
});
