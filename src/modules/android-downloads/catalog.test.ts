import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { getAndroidDownload, isAndroidDownloadId } from "./catalog";

test("recognizes only published Android download identifiers", () => {
  assert.equal(isAndroidDownloadId("theta-space"), true);
  assert.equal(isAndroidDownloadId("theta-comm"), true);
  assert.equal(isAndroidDownloadId("../private"), false);
});

test("uses clear, versioned filenames for downloaded APKs", () => {
  assert.equal(getAndroidDownload("theta-space").downloadName, "Theta-Space-Android-v24.0.45.apk");
  assert.equal(getAndroidDownload("theta-comm").downloadName, "Theta-Comm-Android-v2.0.0-beta01.apk");
});

test("allows a dedicated absolute source path per build", () => {
  const previous = process.env.ANDROID_THETA_COMM_APK;
  process.env.ANDROID_THETA_COMM_APK = path.resolve("custom", "theta-comm.apk");

  try {
    assert.equal(getAndroidDownload("theta-comm").sourcePath, path.resolve("custom", "theta-comm.apk"));
  } finally {
    if (previous === undefined) delete process.env.ANDROID_THETA_COMM_APK;
    else process.env.ANDROID_THETA_COMM_APK = previous;
  }
});
