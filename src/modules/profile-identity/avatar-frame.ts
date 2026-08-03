export const avatarFrameDefaults = {
  focalX: 50,
  focalY: 50,
  frameShape: 100,
  zoom: 100
} as const;

export const avatarFrameLimits = {
  frameShapeMax: 112,
  frameShapeMin: 88,
  zoomMax: 240,
  zoomMin: 100
} as const;

type AvatarFrameInput = {
  avatarFocalX?: number | null;
  avatarFocalY?: number | null;
  avatarFrameShape?: number | null;
  avatarZoom?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

export function normalizeAvatarFrame(frame: AvatarFrameInput) {
  return {
    focalX: clamp(round(frame.avatarFocalX ?? avatarFrameDefaults.focalX), 0, 100),
    focalY: clamp(round(frame.avatarFocalY ?? avatarFrameDefaults.focalY), 0, 100),
    frameShape: clamp(
      round(frame.avatarFrameShape ?? avatarFrameDefaults.frameShape),
      avatarFrameLimits.frameShapeMin,
      avatarFrameLimits.frameShapeMax
    ),
    zoom: clamp(round(frame.avatarZoom ?? avatarFrameDefaults.zoom), avatarFrameLimits.zoomMin, avatarFrameLimits.zoomMax)
  };
}

export function avatarImageStyle(frame: AvatarFrameInput) {
  const normalized = normalizeAvatarFrame(frame);
  const zone = getAvatarFrameZone(frame);
  const scale = Math.round((100 / Math.min(zone.width, zone.height)) * 1000) / 1000;

  return {
    objectPosition: `${normalized.focalX}% ${normalized.focalY}%`,
    transform: scale > 1 ? `scale(${scale})` : undefined,
    transformOrigin: `${normalized.focalX}% ${normalized.focalY}%`
  };
}

export function getAvatarFrameZone(frame: AvatarFrameInput) {
  const normalized = normalizeAvatarFrame(frame);
  const baseSize = 10000 / normalized.zoom;
  const aspect = normalized.frameShape / 100;
  const width = clamp(baseSize * Math.sqrt(aspect), 30, 100);
  const height = clamp(baseSize / Math.sqrt(aspect), 30, 100);
  const x = clamp(normalized.focalX, width / 2, 100 - width / 2);
  const y = clamp(normalized.focalY, height / 2, 100 - height / 2);

  return {
    height,
    left: x - width / 2,
    selectedPercent: clamp(Math.round((width * height) / 100), 9, 100),
    top: y - height / 2,
    width,
    x,
    y
  };
}

export function clampAvatarFrameCenter(x: number, y: number, frame: Pick<AvatarFrameInput, "avatarFrameShape" | "avatarZoom">) {
  const zone = getAvatarFrameZone({ avatarFocalX: 50, avatarFocalY: 50, ...frame });

  return {
    x: round(clamp(x, zone.width / 2, 100 - zone.width / 2)),
    y: round(clamp(y, zone.height / 2, 100 - zone.height / 2))
  };
}
