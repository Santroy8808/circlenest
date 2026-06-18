export type AdminActionCard = {
  key: string;
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  steps: string[];
};

export type AdminLogView = {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
};

export type AdminFeatureFlagView = {
  key: string;
  enabled: boolean;
  description: string | null;
};

export type AdminPortalView = {
  canAccess: boolean;
  actions: AdminActionCard[];
  featureFlags: AdminFeatureFlagView[];
  recentAuditLogs: AdminLogView[];
  recentDiagnostics: AdminLogView[];
};
