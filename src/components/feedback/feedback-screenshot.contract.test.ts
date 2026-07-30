import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("feedback UI is hidden before the browser starts capturing the selected tab", () => {
  const form = readFileSync(resolve("src/components/feedback/feedback-ticket-form.tsx"), "utf8");
  const hideIndex = form.indexOf("setCaptureHidden(true)");
  const captureIndex = form.indexOf("navigator.mediaDevices.getDisplayMedia(options)");

  assert.ok(hideIndex >= 0);
  assert.ok(captureIndex > hideIndex);
  assert.match(form, /await capturedVideoFrame\(video\);\s*await capturedVideoFrame\(video\);/);
});

test("capture-only styles immediately hide the dialog and Feedback button", () => {
  const link = readFileSync(resolve("src/components/feedback/global-feedback-link.tsx"), "utf8");
  const styles = readFileSync(resolve("src/app/globals.css"), "utf8");

  assert.match(link, /captureHidden \? "feedback-fab--capture-hidden"/);
  assert.match(styles, /\.feedback-fab--capture-hidden\s*\{[\s\S]*?visibility:\s*hidden;/);
  assert.match(
    styles,
    /\.feedback-modal-layer--capture-hidden\s*\{[\s\S]*?transition:\s*none;[\s\S]*?visibility:\s*hidden;/
  );
});
