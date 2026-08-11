import assert from "node:assert/strict";
import test from "node:test";
import { isLinkPreviewUrlAllowed } from "./link-preview.service";

test("allows conventional public web URLs", () => {
  assert.equal(isLinkPreviewUrlAllowed("https://example.com/article"), true);
  assert.equal(isLinkPreviewUrlAllowed("https://news.example.com:443/article"), true);
});

test("rejects local and private-network targets", () => {
  assert.equal(isLinkPreviewUrlAllowed("http://localhost:3000"), false);
  assert.equal(isLinkPreviewUrlAllowed("http://127.0.0.1"), false);
  assert.equal(isLinkPreviewUrlAllowed("http://192.168.1.10"), false);
  assert.equal(isLinkPreviewUrlAllowed("http://[::1]"), false);
});

test("rejects unusual ports and non-web URLs", () => {
  assert.equal(isLinkPreviewUrlAllowed("https://example.com:8080"), false);
  assert.equal(isLinkPreviewUrlAllowed("file:///etc/passwd"), false);
});
