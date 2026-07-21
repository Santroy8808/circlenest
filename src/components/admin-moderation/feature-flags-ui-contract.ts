import type { RegisteredFeatureFlagView } from "@/modules/feature-flags/feature-flags.service";

export type FeatureFlagPendingChange = {
  scope: "feature" | "category";
  key: string;
  title: string;
  action: "set" | "reset" | "set-category";
  enabled?: boolean;
  effectWhenDisabled: string;
  defaultEnabled?: boolean;
  affectedCount?: number;
};

export type FeatureFlagCommand =
  | {
      action: "set" | "reset";
      key: string;
      enabled?: boolean;
      reason: string;
      expectedVersion: number;
    }
  | {
      action: "set-category";
      categoryKey: string;
      enabled: boolean;
      reason: string;
      expectedVersions: Record<string, number>;
    };

export type FeatureFlagCatalogResponse = {
  catalogVersion: number;
  flags: RegisteredFeatureFlagView[];
};

export type FeatureFlagMutationResponse = FeatureFlagCatalogResponse & {
  ok: true;
  receipt: {
    commandId: string;
    auditLogId: string;
    replayed: boolean;
  };
};

export type FeatureFlagErrorResponse = {
  error?: string;
  code?: string;
  field?: string;
};

export function buildFeatureFlagCommand(
  change: FeatureFlagPendingChange,
  reason: string,
  flags: readonly RegisteredFeatureFlagView[]
): { ok: true; command: FeatureFlagCommand } | { ok: false; error: string } {
  const cleanReason = reason.trim().replace(/\r\n/g, "\n");

  if (change.scope === "feature") {
    const flag = flags.find((candidate) => candidate.key === change.key);
    if (!flag) return { ok: false, error: "That feature is no longer in the current catalog. Reload and try again." };
    if (change.action === "set" && typeof change.enabled !== "boolean") {
      return { ok: false, error: "Choose whether the feature should be enabled or disabled." };
    }

    return {
      ok: true,
      command: {
        action: change.action === "reset" ? "reset" : "set",
        key: flag.key,
        ...(change.action === "set" ? { enabled: change.enabled } : {}),
        reason: cleanReason,
        expectedVersion: flag.version
      }
    };
  }

  if (change.action !== "set-category" || typeof change.enabled !== "boolean") {
    return { ok: false, error: "Choose whether the feature category should be enabled or disabled." };
  }

  const categoryFlags = flags
    .filter((flag) => flag.categoryKey === change.key)
    .sort((left, right) => left.key.localeCompare(right.key));
  if (categoryFlags.length === 0) {
    return { ok: false, error: "That category has no features in the current catalog. Reload and try again." };
  }

  return {
    ok: true,
    command: {
      action: "set-category",
      categoryKey: change.key,
      enabled: change.enabled,
      reason: cleanReason,
      expectedVersions: Object.fromEntries(categoryFlags.map((flag) => [flag.key, flag.version]))
    }
  };
}

export function serializeFeatureFlagIntent(command: FeatureFlagCommand) {
  return JSON.stringify(command);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidUpdatedAt(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value)));
}

export function isRegisteredFeatureFlagView(value: unknown): value is RegisteredFeatureFlagView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const flag = value as Record<string, unknown>;
  return Boolean(
    isNonEmptyString(flag.key) &&
    isNonEmptyString(flag.title) &&
    isNonEmptyString(flag.categoryKey) &&
    isNonEmptyString(flag.area) &&
    isNonEmptyString(flag.description) &&
    isNonEmptyString(flag.effectWhenDisabled) &&
    isNonEmptyString(flag.enforcement) &&
    (flag.risk === "high" || flag.risk === "medium") &&
    typeof flag.defaultEnabled === "boolean" &&
    typeof flag.enabled === "boolean" &&
    Number.isInteger(flag.version) &&
    (flag.version as number) >= 0 &&
    (flag.source === "default" || flag.source === "override") &&
    isNullableString(flag.overrideDescription) &&
    isValidUpdatedAt(flag.updatedAt)
  );
}

export function isFeatureFlagCatalogResponse(value: unknown): value is FeatureFlagCatalogResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<FeatureFlagCatalogResponse>;
  return Boolean(
    Number.isInteger(candidate.catalogVersion) &&
    (candidate.catalogVersion as number) >= 1 &&
    Array.isArray(candidate.flags) &&
    candidate.flags.every(isRegisteredFeatureFlagView)
  );
}

export function isFeatureFlagMutationResponse(value: unknown): value is FeatureFlagMutationResponse {
  if (!isFeatureFlagCatalogResponse(value)) return false;
  const candidate = value as Partial<FeatureFlagMutationResponse>;
  return Boolean(
    candidate.ok === true &&
    candidate.receipt &&
    isNonEmptyString(candidate.receipt.commandId) &&
    isNonEmptyString(candidate.receipt.auditLogId) &&
    typeof candidate.receipt.replayed === "boolean"
  );
}

export function describeFeatureFlagMutationResult(
  change: FeatureFlagPendingChange,
  flags: readonly RegisteredFeatureFlagView[],
  receipt: FeatureFlagMutationResponse["receipt"]
) {
  const receiptSummary = receipt.replayed
    ? `This identical command was already applied earlier. Prior command audit receipt: ${receipt.auditLogId}.`
    : `The change was recorded. Audit receipt: ${receipt.auditLogId}.`;

  if (change.scope === "feature") {
    const flag = flags.find((candidate) => candidate.key === change.key);
    if (!flag) {
      return `${receiptSummary} Current state: ${change.title} is no longer present in the returned feature catalog.`;
    }
    const source = flag.source === "override" ? "admin override" : "documented default";
    return `${receiptSummary} Current state: ${flag.title} is ${flag.enabled ? "on" : "off"} (${source}).`;
  }

  const categoryFlags = flags.filter((flag) => flag.categoryKey === change.key);
  if (categoryFlags.length === 0) {
    return `${receiptSummary} Current state: ${change.title} has no features in the returned catalog.`;
  }
  const enabledCount = categoryFlags.filter((flag) => flag.enabled).length;
  const state = enabledCount === 0
    ? "off"
    : enabledCount === categoryFlags.length
      ? "on"
      : `mixed (${enabledCount} of ${categoryFlags.length} features on)`;
  return `${receiptSummary} Current state: ${change.title} is ${state}.`;
}

export function featureFlagErrorResponse(value: unknown): FeatureFlagErrorResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  return {
    error: typeof candidate.error === "string" ? candidate.error : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    field: typeof candidate.field === "string" ? candidate.field : undefined
  };
}
