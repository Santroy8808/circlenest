export const STRIPE_SECRET_MIGRATION_ID = "20260721132000_remove_plaintext_stripe_secrets";

export const STRIPE_SECRET_MIGRATION_RECEIPT = {
  id: `stripe-secret-migration-receipt:${STRIPE_SECRET_MIGRATION_ID}`,
  operationId: `stripe-secret-migration:${STRIPE_SECRET_MIGRATION_ID}:verified-and-scrubbed`,
  module: "billing",
  action: "STRIPE_SECRET_MIGRATION_PREFLIGHT",
  targetType: "DatabaseMigration",
  targetId: STRIPE_SECRET_MIGRATION_ID,
  severity: "info",
  outcome: "SUCCESS",
  retentionClass: "VITAL",
  receiptVersion: 1,
  result: "VERIFIED_AND_SCRUBBED"
} as const;

export const DEFAULT_STRIPE_SECRET_ENVIRONMENT_VARIABLES = {
  secretKey: "STRIPE_SECRET_KEY",
  webhookSecret: "STRIPE_WEBHOOK_SECRET"
} as const;

const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;

const LEGACY_COLUMNS = ["secretKey", "webhookSecret"] as const;
const REFERENCE_COLUMNS = ["secretKeyEnvVar", "webhookSecretEnvVar"] as const;

export type StripeSecretPreflightErrorCode =
  | "SCHEMA_INVALID"
  | "ENV_REFERENCE_INVALID"
  | "ENV_SECRET_MISSING"
  | "ENV_SECRET_MISMATCH"
  | "RECEIPT_INVALID"
  | "RECEIPT_GUARD_INVALID"
  | "CONCURRENT_CHANGE"
  | "SCRUB_VERIFICATION_FAILED";

const STRIPE_SECRET_PREFLIGHT_ERROR_MESSAGES: Record<StripeSecretPreflightErrorCode, string> = {
  SCHEMA_INVALID: "The Stripe secret migration schema is not in a safe state.",
  ENV_REFERENCE_INVALID: "A Stripe secret environment-variable reference is invalid.",
  ENV_SECRET_MISSING: "A legacy Stripe secret has no corresponding server environment value.",
  ENV_SECRET_MISMATCH: "A legacy Stripe secret does not exactly match its server environment value.",
  RECEIPT_INVALID: "The deterministic Stripe migration receipt is missing or invalid.",
  RECEIPT_GUARD_INVALID: "The immutable Stripe migration receipt guards could not be verified.",
  CONCURRENT_CHANGE: "A Stripe config row changed while the migration preflight was running.",
  SCRUB_VERIFICATION_FAILED: "Stripe plaintext scrubbing verification failed; no changes were committed."
};

export class StripeSecretPreflightError extends Error {
  readonly code: StripeSecretPreflightErrorCode;

  constructor(code: StripeSecretPreflightErrorCode) {
    super(STRIPE_SECRET_PREFLIGHT_ERROR_MESSAGES[code]);
    this.name = "StripeSecretPreflightError";
    this.code = code;
  }
}

export function safeStripeSecretPreflightFailure(error: unknown) {
  if (error instanceof StripeSecretPreflightError) {
    return { code: error.code, message: STRIPE_SECRET_PREFLIGHT_ERROR_MESSAGES[error.code] };
  }
  return {
    code: "UNEXPECTED_DATABASE_ERROR" as const,
    message: "The Stripe secret preflight failed and its transaction was rolled back."
  };
}

export type StripeSecretColumnAssessment =
  | { status: "requires-migration" }
  | { status: "already-removed" };

export type LegacyStripeSecretRow = {
  id: string;
  secretKey: string | null;
  webhookSecret: string | null;
  secretKeyEnvVar: string | null;
  webhookSecretEnvVar: string | null;
};

export type StripeSecretMigrationPlanRow = {
  id: string;
  secretKeyEnvVar: string | null;
  webhookSecretEnvVar: string | null;
  secretKeyHadLegacyValue: boolean;
  webhookSecretHadLegacyValue: boolean;
  referenceChanged: boolean;
};

export type StripeSecretEnvironment = Readonly<Record<string, string | undefined>>;

export type StripeSecretMigrationReceiptRecord = {
  id: string;
  operationId: string;
  module: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: string;
  outcome: string;
  retentionClass: string;
  actorUserId: string | null;
  requestId: string | null;
  beforeIsNull: boolean;
  afterIsNull: boolean;
  metadata: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isValidStripeSecretMigrationReceipt(
  receipt: StripeSecretMigrationReceiptRecord | null
) {
  if (!receipt || !isObject(receipt.metadata)) return false;
  const expected = STRIPE_SECRET_MIGRATION_RECEIPT;
  const metadataKeys = Object.keys(receipt.metadata);
  const expectedMetadataKeys = [
    "receiptVersion",
    "migrationId",
    "result",
    "configCount",
    "secretKeyCount",
    "webhookSecretCount",
    "referenceUpdateCount",
    "secretMaterialRecorded"
  ];
  return receipt.id === expected.id &&
    receipt.operationId === expected.operationId &&
    receipt.module === expected.module &&
    receipt.action === expected.action &&
    receipt.targetType === expected.targetType &&
    receipt.targetId === expected.targetId &&
    receipt.severity === expected.severity &&
    receipt.outcome === expected.outcome &&
    receipt.retentionClass === expected.retentionClass &&
    receipt.actorUserId === null &&
    receipt.requestId === null &&
    receipt.beforeIsNull &&
    receipt.afterIsNull &&
    metadataKeys.length === expectedMetadataKeys.length &&
    expectedMetadataKeys.every((key) => metadataKeys.includes(key)) &&
    receipt.metadata.receiptVersion === expected.receiptVersion &&
    receipt.metadata.migrationId === STRIPE_SECRET_MIGRATION_ID &&
    receipt.metadata.result === expected.result &&
    receipt.metadata.secretMaterialRecorded === false &&
    isNonnegativeInteger(receipt.metadata.configCount) &&
    isNonnegativeInteger(receipt.metadata.secretKeyCount) &&
    isNonnegativeInteger(receipt.metadata.webhookSecretCount) &&
    isNonnegativeInteger(receipt.metadata.referenceUpdateCount);
}

export function assessStripeSecretMigrationReceipt(
  receipt: StripeSecretMigrationReceiptRecord | null
) {
  if (receipt === null) return { status: "create" as const };
  if (!isValidStripeSecretMigrationReceipt(receipt)) {
    throw new StripeSecretPreflightError("RECEIPT_INVALID");
  }
  return { status: "reuse" as const };
}

function listMissingColumns(columns: ReadonlySet<string>, required: readonly string[]) {
  return required.filter((column) => !columns.has(column));
}

export function assessStripeSecretColumns(columnNames: Iterable<string>): StripeSecretColumnAssessment {
  const columns = new Set(columnNames);
  const missingLegacy = listMissingColumns(columns, LEGACY_COLUMNS);
  const missingReferences = listMissingColumns(columns, REFERENCE_COLUMNS);

  if (missingLegacy.length === LEGACY_COLUMNS.length) {
    if (missingReferences.length > 0) {
      throw new StripeSecretPreflightError("SCHEMA_INVALID");
    }
    return { status: "already-removed" };
  }

  if (missingLegacy.length > 0 || missingReferences.length > 0) {
    throw new StripeSecretPreflightError("SCHEMA_INVALID");
  }

  return { status: "requires-migration" };
}

function normalizeEnvironmentReference(value: string | null) {
  const normalized = value?.trim() || null;
  if (normalized && !ENVIRONMENT_VARIABLE_PATTERN.test(normalized)) {
    throw new StripeSecretPreflightError("ENV_REFERENCE_INVALID");
  }
  return normalized;
}

function planSecretReference(input: {
  legacyValue: string | null;
  currentReference: string | null;
  defaultReference: string;
  environment: StripeSecretEnvironment;
}) {
  const currentReference = normalizeEnvironmentReference(input.currentReference);
  const hasLegacyValue = input.legacyValue !== null && input.legacyValue.trim().length > 0;

  if (!hasLegacyValue) {
    return { reference: currentReference, hadLegacyValue: false };
  }

  const reference = currentReference ?? input.defaultReference;
  const environmentValue = input.environment[reference];
  if (environmentValue === undefined) {
    throw new StripeSecretPreflightError("ENV_SECRET_MISSING");
  }
  if (environmentValue !== input.legacyValue) {
    throw new StripeSecretPreflightError("ENV_SECRET_MISMATCH");
  }

  return { reference, hadLegacyValue: true };
}

export function planStripeSecretMigration(
  rows: readonly LegacyStripeSecretRow[],
  environment: StripeSecretEnvironment
): StripeSecretMigrationPlanRow[] {
  return rows.map((row) => {
    const secretKey = planSecretReference({
      legacyValue: row.secretKey,
      currentReference: row.secretKeyEnvVar,
      defaultReference: DEFAULT_STRIPE_SECRET_ENVIRONMENT_VARIABLES.secretKey,
      environment
    });
    const webhookSecret = planSecretReference({
      legacyValue: row.webhookSecret,
      currentReference: row.webhookSecretEnvVar,
      defaultReference: DEFAULT_STRIPE_SECRET_ENVIRONMENT_VARIABLES.webhookSecret,
      environment
    });

    return {
      id: row.id,
      secretKeyEnvVar: secretKey.reference,
      webhookSecretEnvVar: webhookSecret.reference,
      secretKeyHadLegacyValue: secretKey.hadLegacyValue,
      webhookSecretHadLegacyValue: webhookSecret.hadLegacyValue,
      referenceChanged:
        row.secretKeyEnvVar !== secretKey.reference ||
        row.webhookSecretEnvVar !== webhookSecret.reference
    };
  });
}
