import assert from "node:assert/strict";
import test from "node:test";
import { extractFirstExternalLink, getExternalLinkHost, normalizeExternalLinkUrl } from "./link-preview.shared";

test("extracts a rich-text markdown link", () => {
  assert.equal(extractFirstExternalLink("Read [the update](https://example.com/news?id=4)."), "https://example.com/news?id=4");
});

test("extracts a pasted plain link and excludes trailing punctuation", () => {
  assert.equal(extractFirstExternalLink("Open https://example.com/hello-world, then reply."), "https://example.com/hello-world");
});

test("only accepts external HTTP URLs", () => {
  assert.equal(normalizeExternalLinkUrl("javascript:alert(1)"), null);
  assert.equal(normalizeExternalLinkUrl("/posts/abc"), null);
  assert.equal(extractFirstExternalLink("No external link here."), null);
});

test("reads a presentable external link host", () => {
  assert.equal(getExternalLinkHost("https://www.theta-space.net/jobs"), "theta-space.net");
});
