export type FeatureFlags = {
  rebuildCore: boolean;
  rebuildGroups: boolean;
  rebuildMessaging: boolean;
  rebuildNotifications: boolean;
  rebuildAlerts: boolean;
};

function isEnabled(value: string | undefined, fallback = true) {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const featureFlags: FeatureFlags = {
  rebuildCore: isEnabled(process.env.FEATURE_REBUILD_CORE, true),
  rebuildGroups: isEnabled(process.env.FEATURE_REBUILD_GROUPS, true),
  rebuildMessaging: isEnabled(process.env.FEATURE_REBUILD_MESSAGING, true),
  rebuildNotifications: isEnabled(process.env.FEATURE_REBUILD_NOTIFICATIONS, true),
  rebuildAlerts: isEnabled(process.env.FEATURE_REBUILD_ALERTS, true),
};
