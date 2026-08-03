import assert from "node:assert/strict";
import test from "node:test";
import {
  avatarImageStyle,
  clampAvatarFrameCenter,
  getAvatarFrameZone,
  normalizeAvatarFrame
} from "@/modules/profile-identity/avatar-frame";

test("avatar frame values are clamped to supported bounds", () => {
  assert.deepEqual(normalizeAvatarFrame({
    avatarFocalX: -12,
    avatarFocalY: 140,
    avatarFrameShape: 200,
    avatarZoom: 999
  }), {
    focalX: 0,
    focalY: 100,
    frameShape: 112,
    zoom: 240
  });
});

test("avatar frame center stays inside the selected zone bounds", () => {
  assert.deepEqual(clampAvatarFrameCenter(1, 99, {
    avatarFrameShape: 88,
    avatarZoom: 240
  }), {
    x: 20,
    y: 78
  });
});

test("avatar display style preserves the selected focus and zoom", () => {
  assert.deepEqual(avatarImageStyle({
    avatarFocalX: 42,
    avatarFocalY: 63,
    avatarFrameShape: 100,
    avatarZoom: 160
  }), {
    objectPosition: "42% 63%",
    transform: "scale(1.6)",
    transformOrigin: "42% 63%"
  });
});

test("default frame zone starts as a full image selection", () => {
  const zone = getAvatarFrameZone({
    avatarFocalX: 50,
    avatarFocalY: 50,
    avatarFrameShape: 100,
    avatarZoom: 100
  });

  assert.equal(zone.selectedPercent, 100);
});
