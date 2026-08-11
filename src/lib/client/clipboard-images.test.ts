import assert from "node:assert/strict";
import test from "node:test";
import { getClipboardImageFile, isSupportedClipboardImage } from "./clipboard-images";

function image(type: string) {
  return { type } as File;
}

test("recognizes GIF clipboard images", () => {
  const pasted = image("image/gif");
  assert.equal(isSupportedClipboardImage(image("image/gif")), true);
  assert.equal(getClipboardImageFile({ files: [pasted] }), pasted);
});

test("accepts a supported image from clipboard items", () => {
  const pasted = image("image/webp");
  assert.equal(
    getClipboardImageFile({
      items: [{ getAsFile: () => pasted, kind: "file", type: "image/webp" }]
    }),
    pasted
  );
});

test("does not treat unsupported clipboard files as stream images", () => {
  assert.equal(isSupportedClipboardImage(image("image/svg+xml")), false);
  assert.equal(getClipboardImageFile({ files: [image("image/svg+xml")] }), null);
  assert.equal(getClipboardImageFile({ files: [image("application/pdf")] }), null);
});
